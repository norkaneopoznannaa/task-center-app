import React, { useState } from 'react';
import { Task, STATUS_LABELS, PRIORITY_LABELS } from '../types';
import './TaskDetails.css';

interface TaskDetailsProps {
  task: Task | null;
  onClose: () => void;
  onStatusChange: (taskId: string, status: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

// Округление до 30 минут (вверх)
const roundTo30Minutes = (minutes: number): number => {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 30) * 30;
};

// Форматирование даты для Jira API (ISO 8601 с timezone)
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

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  task,
  onClose,
  onStatusChange,
  onStartTimer,
  onStopTimer,
  activeTimers,
}) => {
  // Состояние для экспорта в Jira
  const [jiraExportState, setJiraExportState] = useState<{
    loading: boolean;
    success: boolean;
    error: string | null;
    exportedMinutes: number | null;
  }>({ loading: false, success: false, error: null, exportedMinutes: null });

  // Функция экспорта worklog в Jira
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

  if (!task) {
    return (
      <div className="task-details-empty">
        <div className="empty-icon">📋</div>
        <p>Выберите задачу для просмотра деталей</p>
      </div>
    );
  }

  const isTimerActive = !!activeTimers[task.id];
  const totalMinutes = task.time_tracking?.total_minutes || 0;
  const actualHours = task.metadata?.actual_hours || 0;
  const estimatedHours = task.metadata?.estimated_hours;

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}ч ${mins}м`;
    }
    return `${mins}м`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPriorityClass = (priority: string) => {
    const map: Record<string, string> = {
      'CRITICAL': 'critical',
      'HIGH': 'high',
      'MEDIUM': 'medium',
      'LOW': 'low',
      'BACKLOG': 'backlog',
    };
    return map[priority] || 'medium';
  };

  const getStatusClass = (status: string) => {
    const map: Record<string, string> = {
      'новая': 'new',
      'в работе': 'progress',
      'выполнена': 'done',
      'заблокирована': 'blocked',
    };
    return map[status] || 'new';
  };

  return (
    <div className="task-details">
      <div className="task-details-header">
        <h2>Детали задачи</h2>
        <button className="btn-icon close-btn" onClick={onClose} title="Закрыть">
          ✕
        </button>
      </div>

      <div className="task-details-content">
        {/* Title */}
        <div className="detail-section">
          <h3 className="task-title">{task.title}</h3>
          <div className="task-badges">
            <span className={`badge badge-${getPriorityClass(task.priority)}`}>
              {PRIORITY_LABELS[task.priority] || task.priority}
            </span>
            <span className={`badge badge-${getStatusClass(task.status)}`}>
              {STATUS_LABELS[task.status] || task.status}
            </span>
            {task.task_type && (
              <span className="badge badge-type">{task.task_type}</span>
            )}
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div className="detail-section">
            <label>Описание</label>
            <p className="task-description">{task.description}</p>
          </div>
        )}

        {/* Original Text */}
        {task.original_text && task.original_text !== task.description && (
          <div className="detail-section">
            <label>Исходный текст</label>
            <p className="task-original">{task.original_text}</p>
          </div>
        )}

        {/* Jira References */}
        {task.jira_references && task.jira_references.length > 0 && (
          <div className="detail-section">
            <label>Jira задачи</label>
            <div className="jira-links">
              {task.jira_references.map((ref, i) => (
                <a
                  key={i}
                  href={ref.url || `#${ref.ticket_id}`}
                  className="jira-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🔗 {ref.ticket_id}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Mentions */}
        {task.mentions && task.mentions.length > 0 && (
          <div className="detail-section">
            <label>Упоминания</label>
            <div className="mentions">
              {task.mentions.map((person, i) => (
                <span key={i} className="mention">
                  👤 {person.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Time Tracking */}
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

        {/* Status Change */}
        <div className="detail-section">
          <label>Изменить статус</label>
          <div className="status-buttons">
            {Object.entries(STATUS_LABELS)
              .filter(([status]) => status !== 'выполнена')
              .map(([status, label]) => (
              <button
                key={status}
                className={`btn btn-status ${task.status === status ? 'active' : ''}`}
                onClick={() => onStatusChange(task.id, status)}
                disabled={task.status === status}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Metadata */}
        <div className="detail-section metadata-section">
          <label>Метаданные</label>
          <div className="metadata-grid">
            <div className="metadata-item">
              <span className="meta-label">ID:</span>
              <span className="meta-value">{task.id.slice(0, 8)}</span>
            </div>
            <div className="metadata-item">
              <span className="meta-label">Создана:</span>
              <span className="meta-value">{formatDate(task.created_at)}</span>
            </div>
            <div className="metadata-item">
              <span className="meta-label">Обновлена:</span>
              <span className="meta-value">{formatDate(task.metadata?.updated_at)}</span>
            </div>
            {task.deadline && (
              <div className="metadata-item">
                <span className="meta-label">Дедлайн:</span>
                <span className="meta-value deadline">{formatDate(task.deadline)}</span>
              </div>
            )}
            {task.complexity && (
              <div className="metadata-item">
                <span className="meta-label">Сложность:</span>
                <span className="meta-value">{task.complexity}</span>
              </div>
            )}
            {task.ai_classification_confidence && (
              <div className="metadata-item">
                <span className="meta-label">AI уверенность:</span>
                <span className="meta-value">
                  {Math.round(task.ai_classification_confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* User Notes - главный блок заметок */}
        {task.user_notes && (
          <div className="detail-section">
            <label>Заметки</label>
            <div className="user-notes">
              {task.user_notes.split('\n').map((line, i) => (
                <p key={i} className={line.startsWith('**') || line.startsWith('СРОЧНО') ? 'note-important' : ''}>
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Tags/Labels from clarifications - только важные метки */}
        {task.clarifications && (
          (task.clarifications.urgent || task.clarifications.deadline || task.clarifications.first_document) && (
            <div className="detail-section">
              <label>Метки</label>
              <div className="task-labels">
                {task.clarifications.urgent && (
                  <span className="label label-urgent">СРОЧНО</span>
                )}
                {task.clarifications.deadline && (
                  <span className="label label-deadline">Дедлайн: {String(task.clarifications.deadline)}</span>
                )}
                {task.clarifications.first_document && (
                  <span className="label label-info">{String(task.clarifications.first_document)}</span>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
