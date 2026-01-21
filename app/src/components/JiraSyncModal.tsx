import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { LocalWorklog } from '../types/worklog';
import './Modal.css';

interface JiraSyncModalProps {
  worklogs: LocalWorklog[];
  onClose: () => void;
}

export function JiraSyncModal({ worklogs, onClose }: JiraSyncModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(worklogs.map(w => w.id))
  );
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === worklogs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(worklogs.map(w => w.id)));
    }
  };

  // Format time for Jira API (ISO 8601 with timezone)
  const formatJiraDateTime = (date: string, time: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const d = new Date(year, month - 1, day, hours, minutes);

    const offsetMinutes = -d.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';

    const pad = (n: number) => n.toString().padStart(2, '0');

    return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00.000${offsetSign}${pad(offsetHours)}${pad(offsetMins)}`;
  };

  const handleSync = async () => {
    const selectedWorklogs = worklogs.filter(w => selected.has(w.id));
    if (selectedWorklogs.length === 0) {
      toast.error('Выберите записи для выгрузки');
      return;
    }

    setSyncing(true);
    setProgress({ current: 0, total: selectedWorklogs.length });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < selectedWorklogs.length; i++) {
      const worklog = selectedWorklogs[i];
      setProgress({ current: i + 1, total: selectedWorklogs.length });

      try {
        const started = formatJiraDateTime(worklog.date, worklog.startTime);
        const timeSpentSeconds = worklog.durationMinutes * 60;
        const comment = worklog.description || worklog.taskTitle;

        const result = await window.api.addJiraWorklog(
          worklog.jiraKey!,
          started,
          timeSpentSeconds,
          comment
        );

        if (result.success && result.worklogId) {
          await window.api.markWorklogSynced(worklog.id, result.worklogId);
          success++;
        } else {
          await window.api.markWorklogError(worklog.id, result.error || 'Unknown error');
          failed++;
        }
      } catch (error) {
        await window.api.markWorklogError(worklog.id, String(error));
        failed++;
      }
    }

    setResults({ success, failed });
    setSyncing(false);

    if (failed === 0) {
      toast.success(`Успешно выгружено ${success} записей в Jira`);
      onClose();
    } else {
      toast.error(`Выгружено: ${success}, ошибок: ${failed}`);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}ч ${mins}м`;
    if (hours > 0) return `${hours}ч`;
    return `${mins}м`;
  };

  const totalMinutes = worklogs
    .filter(w => selected.has(w.id))
    .reduce((sum, w) => sum + w.durationMinutes, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Выгрузка в Jira</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">
          {syncing ? (
            <div className="sync-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="progress-text">
                Выгрузка {progress.current} из {progress.total}...
              </p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={selected.size === worklogs.length}
                    onChange={toggleAll}
                  />
                  {' '}Выбрать все ({worklogs.length})
                </label>
              </div>

              {/* List */}
              <div className="sync-list">
                {worklogs.map(worklog => (
                  <div key={worklog.id} className="sync-item">
                    <input
                      type="checkbox"
                      checked={selected.has(worklog.id)}
                      onChange={() => toggleSelect(worklog.id)}
                    />
                    <div className="sync-item-content">
                      <div className="sync-item-jira">{worklog.jiraKey}</div>
                      <div className="sync-item-title">{worklog.taskTitle}</div>
                      <div className="sync-item-time">
                        {worklog.startTime} - {worklog.endTime} ({formatDuration(worklog.durationMinutes)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="sync-summary">
                Выбрано: {selected.size} записей, {formatDuration(totalMinutes)}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={syncing}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing || selected.size === 0}
          >
            {syncing ? 'Выгрузка...' : 'Выгрузить выбранные'}
          </button>
        </div>
      </div>
    </div>
  );
}
