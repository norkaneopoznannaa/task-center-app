import React, { useState, useEffect, useCallback } from 'react';
import { Task } from '../../types';
import { PlayIcon, StopIcon, UploadIcon, CheckIcon, AlertIcon, ClockIcon, InfoIcon, ChevronDownIcon, ChevronUpIcon } from '../icons';

interface TaskTimeTrackingProps {
  task: Task;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

// Live Timer Counter Component
const LiveTimer: React.FC<{ startTime: Date }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calculateElapsed = () => {
      return Math.floor((Date.now() - startTime.getTime()) / 1000);
    };

    setElapsed(calculateElapsed());

    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <span className="live-timer">
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
};

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

const formatDateShort = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
};

const formatTimeRange = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${startDate.toLocaleTimeString('ru-RU', timeOpts)} — ${endDate.toLocaleTimeString('ru-RU', timeOpts)}`;
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

  const [showAllSessions, setShowAllSessions] = useState(false);

  const isTimerActive = !!activeTimers[task.id];
  const activeTimer = activeTimers[task.id];
  const totalMinutes = task.time_tracking?.total_minutes || 0;
  const estimatedHours = task.metadata?.estimated_hours;
  const sessions = task.time_tracking?.sessions || [];
  const hasJiraRef = task.jira_references && task.jira_references.length > 0;
  const jiraKey = hasJiraRef ? task.jira_references[0].ticket_id : null;

  const roundedMinutes = roundTo30Minutes(totalMinutes);

  const handleExportToJira = useCallback(async () => {
    if (!jiraKey) {
      setJiraExportState({ loading: false, success: false, error: 'Нет связанной Jira задачи', exportedMinutes: null });
      return;
    }

    if (totalMinutes <= 0) {
      setJiraExportState({ loading: false, success: false, error: 'Нет отработанного времени', exportedMinutes: null });
      return;
    }

    const timeSpentSeconds = roundedMinutes * 60;
    const started = formatJiraDateTime(new Date());
    const comment = `${task.title}\n\nВремя: ${totalMinutes} мин → ${roundedMinutes} мин (округлено до 30 мин)`;

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
  }, [jiraKey, totalMinutes, roundedMinutes, task.title]);

  // Group sessions by date
  const groupedSessions = sessions.reduce((acc, session) => {
    const date = formatDateShort(session.start);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(session);
    return acc;
  }, {} as Record<string, typeof sessions>);

  const sortedDates = Object.keys(groupedSessions).reverse();
  const displayDates = showAllSessions ? sortedDates : sortedDates.slice(0, 2);

  return (
    <div className="detail-section time-tracking-section">
      <label>
        <ClockIcon size={14} className="section-icon" />
        Учёт времени
      </label>

      {/* Timer Display */}
      <div className="time-tracking-card">
        <div className="time-display">
          {isTimerActive && activeTimer ? (
            <div className="timer-active">
              <span className="timer-label">Текущая сессия:</span>
              <LiveTimer startTime={activeTimer.startTime} />
              <span className="timer-pulse" />
            </div>
          ) : (
            <div className="timer-inactive">
              <span className="timer-label">Всего затрачено:</span>
              <span className="total-time">{totalMinutes > 0 ? formatDuration(totalMinutes) : '—'}</span>
            </div>
          )}
        </div>

        {/* Progress bar if estimated */}
        {estimatedHours && totalMinutes > 0 && (
          <div className="time-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min((totalMinutes / 60 / estimatedHours) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="progress-text">
              {formatDuration(totalMinutes)} / {estimatedHours}ч
              ({Math.round((totalMinutes / 60 / estimatedHours) * 100)}%)
            </span>
          </div>
        )}

        {/* Timer Controls */}
        <div className="timer-controls">
          <button
            className={`btn-timer btn-play ${isTimerActive ? 'disabled' : ''}`}
            onClick={() => onStartTimer(task.id)}
            disabled={isTimerActive}
            title="Начать отсчёт"
            aria-label="Начать таймер"
          >
            <PlayIcon size={18} />
          </button>
          <button
            className={`btn-timer btn-stop ${!isTimerActive ? 'disabled' : ''}`}
            onClick={() => onStopTimer(task.id)}
            disabled={!isTimerActive}
            title="Остановить"
            aria-label="Остановить таймер"
          >
            <StopIcon size={18} />
          </button>
        </div>
      </div>

      {/* Jira Export Section */}
      {hasJiraRef && (
        <div className="jira-export-card">
          <div className="jira-export-header">
            <span className="jira-target">{jiraKey}</span>
            {totalMinutes > 0 && (
              <div className="export-preview">
                <span className="time-original">{formatDuration(totalMinutes)}</span>
                <span className="time-arrow">→</span>
                <span className="time-rounded">{formatDuration(roundedMinutes)}</span>
              </div>
            )}
          </div>

          {totalMinutes > 0 && totalMinutes !== roundedMinutes && (
            <div className="export-info">
              <InfoIcon size={12} />
              <span>Время округляется до 30 минут</span>
            </div>
          )}

          <button
            className={`btn btn-jira-export ${jiraExportState.loading ? 'loading' : ''} ${jiraExportState.success ? 'success' : ''}`}
            onClick={handleExportToJira}
            disabled={jiraExportState.loading || totalMinutes <= 0 || isTimerActive}
            title={
              isTimerActive ? 'Остановите таймер перед экспортом' :
              totalMinutes <= 0 ? 'Нет времени для экспорта' :
              `Экспортировать ${formatDuration(roundedMinutes)} в Jira`
            }
          >
            {jiraExportState.loading ? (
              <>
                <span className="btn-spinner" />
                <span>Выгрузка...</span>
              </>
            ) : jiraExportState.success ? (
              <>
                <CheckIcon size={16} />
                <span>Выгружено {formatDuration(jiraExportState.exportedMinutes || 0)}</span>
              </>
            ) : (
              <>
                <UploadIcon size={16} />
                <span>Выгрузить в Jira</span>
              </>
            )}
          </button>

          {jiraExportState.error && (
            <div className="export-error">
              <AlertIcon size={14} />
              <span>{jiraExportState.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Sessions List */}
      {sessions.length > 0 && (
        <div className="sessions-section">
          <div className="sessions-header">
            <label>История сессий</label>
            <span className="sessions-count">{sessions.length}</span>
          </div>

          <div className="sessions-list">
            {displayDates.map(date => (
              <div key={date} className="sessions-group">
                <div className="sessions-date">{date}</div>
                {groupedSessions[date].reverse().map((session, i) => (
                  <div key={i} className="session-item">
                    <span className="session-time">{formatTimeRange(session.start, session.end)}</span>
                    <span className="session-duration">{formatDuration(session.duration_minutes)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {sortedDates.length > 2 && (
            <button
              className="btn-show-more"
              onClick={() => setShowAllSessions(!showAllSessions)}
            >
              {showAllSessions ? (
                <>
                  <ChevronUpIcon size={14} />
                  <span>Свернуть</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon size={14} />
                  <span>Показать все ({sortedDates.length - 2} ещё)</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
