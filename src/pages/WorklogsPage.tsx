import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { LocalWorklog, WorklogFormData } from '../types/worklog';
import { WorklogEditModal } from '../components/WorklogEditModal';
import { JiraSyncModal } from '../components/JiraSyncModal';
import { JiraSettingsModal } from '../components/JiraSettingsModal';
import './WorklogsPage.css';

interface WorklogsPageProps {
  tasks: { id: string; title: string; jira_references: { ticket_id: string }[] }[];
}

export function WorklogsPage({ tasks }: WorklogsPageProps) {
  const [worklogs, setWorklogs] = useState<LocalWorklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [editingWorklog, setEditingWorklog] = useState<LocalWorklog | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [jiraConfigured, setJiraConfigured] = useState(false);

  // Load worklogs for selected date
  const loadWorklogs = useCallback(async () => {
    try {
      const result = await window.api.getWorklogsByDate(selectedDate);
      if (result.success && result.worklogs) {
        // Sort by start time
        const sorted = [...result.worklogs].sort((a, b) =>
          a.startTime.localeCompare(b.startTime)
        );
        setWorklogs(sorted);
      }
    } catch (error) {
      console.error('Error loading worklogs:', error);
      toast.error('Ошибка загрузки worklogs');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Check Jira configuration
  const checkJiraConfig = useCallback(async () => {
    try {
      const result = await window.api.getJiraConfig();
      if (result.success && result.config) {
        setJiraConfigured(result.config.isConfigured);
      }
    } catch (error) {
      console.error('Error checking Jira config:', error);
    }
  }, []);

  useEffect(() => {
    loadWorklogs();
    checkJiraConfig();
  }, [loadWorklogs, checkJiraConfig]);

  // Navigate dates
  const goToPreviousDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Delete worklog
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить запись?')) return;

    try {
      const result = await window.api.deleteWorklog(id);
      if (result.success) {
        toast.success('Запись удалена');
        loadWorklogs();
      } else {
        toast.error(result.error || 'Ошибка удаления');
      }
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  // Save worklog (add or update)
  const handleSaveWorklog = async (data: WorklogFormData, id?: string) => {
    try {
      if (id) {
        // Update
        const result = await window.api.updateWorklog(id, data);
        if (result.success) {
          toast.success('Запись обновлена');
          setEditingWorklog(null);
          loadWorklogs();
        } else {
          toast.error(result.error || 'Ошибка обновления');
        }
      } else {
        // Add new
        const worklogData = {
          ...data,
          taskTitle: tasks.find(t => t.id === data.taskId)?.title || data.taskId,
        };
        const result = await window.api.addWorklog(worklogData);
        if (result.success) {
          toast.success('Запись добавлена');
          setShowAddModal(false);
          loadWorklogs();
        } else {
          toast.error(result.error || 'Ошибка добавления');
        }
      }
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  // Format time display
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}ч ${mins}м`;
    if (hours > 0) return `${hours}ч`;
    return `${mins}м`;
  };

  // Format date display
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Сегодня';
    }
    if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Вчера';
    }

    return date.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long'
    });
  };

  // Calculate totals
  const totalMinutes = worklogs.reduce((sum, w) => sum + w.durationMinutes, 0);
  const pendingCount = worklogs.filter(w => w.status === 'pending').length;
  const syncedCount = worklogs.filter(w => w.status === 'synced').length;
  const errorCount = worklogs.filter(w => w.status === 'error').length;
  const withJiraCount = worklogs.filter(w => w.jiraKey && w.status === 'pending').length;

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'synced':
        return <span className="worklog-status synced" title="Отправлено в Jira">Jira</span>;
      case 'error':
        return <span className="worklog-status error" title="Ошибка синхронизации">!</span>;
      default:
        return null;
    }
  };

  return (
    <div className="worklogs-page">
      {/* Header */}
      <div className="worklogs-header">
        <div className="worklogs-date-nav">
          <button className="btn btn-icon" onClick={goToPreviousDay} title="Предыдущий день">
            &lt;
          </button>
          <h2 className="worklogs-date-title" onClick={goToToday} title="Перейти к сегодня">
            {formatDateDisplay(selectedDate)}
          </h2>
          <button className="btn btn-icon" onClick={goToNextDay} title="Следующий день">
            &gt;
          </button>
        </div>
        <div className="worklogs-actions">
          <button className="btn btn-secondary" onClick={() => setShowSettingsModal(true)}>
            Jira
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddModal(true)}>
            + Добавить
          </button>
          {withJiraCount > 0 && jiraConfigured && (
            <button className="btn btn-primary" onClick={() => setShowSyncModal(true)}>
              Выгрузить ({withJiraCount})
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="worklogs-summary">
        <div className="summary-item">
          <span className="summary-value">{formatDuration(totalMinutes)}</span>
          <span className="summary-label">Всего</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{worklogs.length}</span>
          <span className="summary-label">Записей</span>
        </div>
        {pendingCount > 0 && (
          <div className="summary-item">
            <span className="summary-value pending">{pendingCount}</span>
            <span className="summary-label">Ожидают</span>
          </div>
        )}
        {syncedCount > 0 && (
          <div className="summary-item">
            <span className="summary-value synced">{syncedCount}</span>
            <span className="summary-label">В Jira</span>
          </div>
        )}
        {errorCount > 0 && (
          <div className="summary-item">
            <span className="summary-value error">{errorCount}</span>
            <span className="summary-label">Ошибки</span>
          </div>
        )}
      </div>

      {/* Worklogs List */}
      {loading ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : worklogs.length === 0 ? (
        <div className="worklogs-empty">
          <p>Нет записей за этот день</p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            Добавить первую запись
          </button>
        </div>
      ) : (
        <div className="worklogs-list">
          {worklogs.map(worklog => (
            <div key={worklog.id} className={`worklog-item ${worklog.status}`}>
              <div className="worklog-time">
                <span className="worklog-time-range">
                  {worklog.startTime} - {worklog.endTime}
                </span>
                <span className="worklog-duration">
                  {formatDuration(worklog.durationMinutes)}
                </span>
              </div>
              <div className="worklog-content">
                <div className="worklog-task">
                  {worklog.jiraKey && (
                    <span className="worklog-jira-key">{worklog.jiraKey}</span>
                  )}
                  <span className="worklog-title">{worklog.taskTitle}</span>
                  {getStatusBadge(worklog.status)}
                </div>
                {worklog.description && (
                  <p className="worklog-description">{worklog.description}</p>
                )}
                {worklog.errorMessage && (
                  <p className="worklog-error">{worklog.errorMessage}</p>
                )}
              </div>
              <div className="worklog-actions">
                <button
                  className="btn btn-icon btn-small"
                  onClick={() => setEditingWorklog(worklog)}
                  title="Редактировать"
                >
                  E
                </button>
                <button
                  className="btn btn-icon btn-small btn-danger"
                  onClick={() => handleDelete(worklog.id)}
                  title="Удалить"
                >
                  X
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {(showAddModal || editingWorklog) && (
        <WorklogEditModal
          worklog={editingWorklog}
          tasks={tasks}
          selectedDate={selectedDate}
          onSave={handleSaveWorklog}
          onClose={() => {
            setShowAddModal(false);
            setEditingWorklog(null);
          }}
        />
      )}

      {showSyncModal && (
        <JiraSyncModal
          worklogs={worklogs.filter(w => w.jiraKey && w.status === 'pending')}
          onClose={() => {
            setShowSyncModal(false);
            loadWorklogs();
          }}
        />
      )}

      {showSettingsModal && (
        <JiraSettingsModal
          onClose={() => {
            setShowSettingsModal(false);
            checkJiraConfig();
          }}
        />
      )}
    </div>
  );
}
