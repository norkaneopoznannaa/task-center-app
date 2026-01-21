import React, { useState } from 'react';
import { Task } from '../../types';

interface TaskTimeTrackingProps {
  task: Task;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

const roundTo30Minutes = (minutes: number): number => {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 30) * 30;
};

const formatJiraDateTime = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';

  const pad = (n: number) => n.toString().padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000` +
         `${offsetSign}${pad(offsetHours)}${pad(offsetMins)}`;
};

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}ч ${mins}м`;
  }
  return `${mins}м`;
};

export const TaskTimeTracking: React.FC<TaskTimeTrackingProps> = ({
  task,
  onStartTimer,
  onStopTimer,
  activeTimers,
}) => {
  const [jiraExportState, setJiraExportState] = useState<{
    loading: boolean;
    success: boolean;
    error: string | null;
    exportedMinutes: number | null;
  }>({ loading: false, success: false, error: null, exportedMinutes: null });

  const isTimerActive = !!activeTimers[task.id];
  const totalMinutes = task.time_tracking?.total_minutes || 0;
  const actualHours = task.metadata?.actual_hours || 0;
  const estimatedHours = task.metadata?.estimated_hours;

  const handleExportToJira = async () => {
    if (!task || !task.jira_references || task.jira_references.length === 0) {
      setJiraExportState({ loading: false, success: false, error: 'Нет связанной Jira задачи', exportedMinutes: null });
      return;
    }

    const totalMinutes = task.time_tracking?.total_minutes || 0;
    if (totalMinutes <= 0) {
      setJiraExportState({ loading: false, success: false, error: 'Нет отработанного времени', exportedMinutes: null });
      return;
    }

    const roundedMinutes = roundTo30Minutes(totalMinutes);
    const timeSpentSeconds = roundedMinutes * 60;
    const jiraKey = task.jira_references[0].ticket_id;
    const started = formatJiraDateTime(new Date());
    const comment = `${task.title}\n\nВремя: ${totalMinutes} мин -> ${roundedMinutes} мин (округлено до 30 мин)`;

    setJiraExportState({ loading: true, success: false, error: null, exportedMinutes: null });

    try {
      const result = await window.api.addJiraWorklog(jiraKey, started, timeSpentSeconds, comment);

      if (result.success) {
        setJiraExportState({ loading: false, success: true, error: null, exportedMinutes: roundedMinutes });
      } else {
        setJiraExportState({ loading: false, success: false, error: result.error || 'Ошибка экспорта', exportedMinutes: null });
      }
    } catch (err) {
      setJiraExportState({ loading: false, success: false, error: String(err), exportedMinutes: null });
    }
  };

  return (
    <div className="detail-section">
      <label>Учёт времени</label>
      <div className="time-tracking-details">
        <div className="time-row">
          <span>Затрачено:</span>
          <span className="time-value">
            {totalMinutes > 0 ? formatDuration(totalMinutes) : '—'}
            {actualHours > 0 && ` (${actualHours}ч)`}
          </span>
        </div>
        {estimatedHours && (
          <div className="time-row">
            <span>Оценка:</span>
            <span className="time-value">{estimatedHours}ч</span>
          </div>
        )}
        {estimatedHours && actualHours > 0 && (
          <div className="time-row">
            <span>Прогресс:</span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min((actualHours / estimatedHours) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="progress-percent">
              {Math.round((actualHours / estimatedHours) * 100)}%
            </span>
          </div>
        )}
        <div className="timer-controls">
          {isTimerActive ? (
            <button
              className="btn btn-secondary timer-btn active"
              onClick={() => onStopTimer(task.id)}
            >
              ⏹ Остановить таймер
            </button>
          ) : (
            <button
              className="btn btn-primary timer-btn"
              onClick={() => onStartTimer(task.id)}
            >
              ▶ Начать отсчёт
            </button>
          )}
        </div>

        {/* Экспорт в Jira */}
        {task.jira_references && task.jira_references.length > 0 && (
          <div className="jira-export-section">
            <div className="jira-export-info">
              <span className="jira-target">
                Jira: {task.jira_references[0].ticket_id}
              </span>
              {totalMinutes > 0 && (
                <span className="jira-time-preview">
                  {formatDuration(totalMinutes)} → {formatDuration(roundTo30Minutes(totalMinutes))}
                </span>
              )}
            </div>
            <button
              className={`btn btn-jira ${jiraExportState.loading ? 'loading' : ''} ${jiraExportState.success ? 'success' : ''}`}
              onClick={handleExportToJira}
              disabled={jiraExportState.loading || totalMinutes <= 0 || isTimerActive}
              title={isTimerActive ? 'Остановите таймер перед экспортом' : totalMinutes <= 0 ? 'Нет времени для экспорта' : `Экспортировать ${formatDuration(roundTo30Minutes(totalMinutes))} в Jira`}
            >
              {jiraExportState.loading ? (
                '⏳ Выгрузка...'
              ) : jiraExportState.success ? (
                `✓ Выгружено ${formatDuration(jiraExportState.exportedMinutes || 0)}`
              ) : (
                '📤 Выгрузить в Jira'
              )}
            </button>
            {jiraExportState.error && (
              <div className="jira-export-error">
                ⚠️ {jiraExportState.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sessions */}
      {task.time_tracking?.sessions && task.time_tracking.sessions.length > 0 && (
        <div className="detail-section">
          <label>Сессии работы</label>
          <div className="sessions-list">
            {task.time_tracking.sessions.slice(-5).reverse().map((session, i) => (
              <div key={i} className="session-item">
                <span className="session-date">
                  {new Date(session.start).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="session-time">
                  {new Date(session.start).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' — '}
                  {new Date(session.end).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="session-duration">
                  {formatDuration(session.duration_minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
