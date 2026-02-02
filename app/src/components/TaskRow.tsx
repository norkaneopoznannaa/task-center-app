import React, { useState, useEffect } from 'react';
import { Task, Status, normalizePriority, getPriorityLabel } from '../types';
import {
  PlayIcon,
  StopIcon,
  EditIcon,
  TrashIcon,
  CopyIcon,
  CalendarIcon,
  ClockIcon,
  ExternalLinkIcon,
} from './icons';
import './TaskRow.css';

interface TaskRowProps {
  task: Task;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onStartTracking: (taskId: string) => void;
  onStopTracking: (taskId: string) => void;
  onClick?: () => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
  onDuplicateTask?: (taskId: string) => void;
  onAddToDailyPlan?: (taskId: string) => void;
}

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'новая', label: 'Новая' },
  { value: 'в работе', label: 'В работе' },
  { value: 'завершена', label: 'Завершена' },
  { value: 'заблокирована', label: 'Заблокирована' },
];

export function TaskRow({ task, onUpdateTask, onStartTracking, onStopTracking, onClick, onEditTask, onDeleteTask, onDuplicateTask, onAddToDailyPlan }: TaskRowProps) {
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const isTracking = !!task.time_tracking?.current_session_start;

  // Timer for active tracking
  useEffect(() => {
    if (!isTracking || !task.time_tracking?.current_session_start) return;

    const startTime = new Date(task.time_tracking.current_session_start).getTime();

    const updateElapsed = () => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isTracking, task.time_tracking?.current_session_start]);

  const getPriorityClass = () => {
    const normalized = normalizePriority(task.priority);
    switch (normalized) {
      case 'CRITICAL': return 'badge-critical';
      case 'HIGH': return 'badge-high';
      case 'MEDIUM': return 'badge-medium';
      case 'LOW': return 'badge-low';
      case 'BACKLOG': return 'badge-backlog';
      default: return '';
    }
  };

  const getStatusClass = () => {
    switch (task.status) {
      case 'новая': return 'badge-new';
      case 'в работе': return 'badge-progress';
      case 'завершена': return 'badge-done';
      case 'заблокирована': return 'badge-blocked';
      default: return '';
    }
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}м`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}м`;
  };

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return '—';
    try {
      const date = new Date(deadline);
      const now = new Date();
      const isOverdue = date < now && task.status !== 'завершена';

      return (
        <span className={isOverdue ? 'deadline-overdue' : ''}>
          {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
        </span>
      );
    } catch {
      return '—';
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateTask(task.id, { status: e.target.value as Status });
  };

  const totalMinutes = task.time_tracking?.total_minutes || 0;
  const estimatedHours = task.metadata.estimated_hours || 0;
  const estimatedMinutes = estimatedHours * 60;

  return (
    <tr className={`task-row ${isTracking ? 'tracking' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {/* Priority */}
      <td>
        <span className={`badge ${getPriorityClass()}`}>
          {getPriorityLabel(task.priority)}
        </span>
      </td>

      {/* Title */}
      <td>
        <div className="task-title-cell">
          <span className="task-title">{task.title}</span>
          {task.mentions.length > 0 && (
            <span className="task-mentions">
              {task.mentions.map(m => m.name).join(', ')}
            </span>
          )}
        </div>
      </td>

      {/* Status */}
      <td>
        <select
          className={`status-select ${getStatusClass()}`}
          value={task.status}
          onChange={handleStatusChange}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>

      {/* Jira */}
      <td>
        {task.jira_references.length > 0 ? (
          <div className="jira-links">
            {task.jira_references.map(ref => (
              <div key={ref.ticket_id} className="jira-link-item">
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="jira-link"
                  title={`Открыть ${ref.ticket_id} в Jira`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {ref.ticket_id} <ExternalLinkIcon size={12} />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <span className="no-jira">—</span>
        )}
      </td>

      {/* Time */}
      <td>
        <div className="time-cell">
          {isTracking ? (
            <span className="time-tracking-active">
              <ClockIcon size={14} /> {formatElapsed(elapsedTime)}
            </span>
          ) : (
            <span className="time-total">
              {totalMinutes > 0 ? formatTime(totalMinutes) : '—'}
              {estimatedMinutes > 0 && (
                <span className="time-estimated"> / {formatTime(estimatedMinutes)}</span>
              )}
            </span>
          )}
        </div>
      </td>

      {/* Deadline */}
      <td>{formatDeadline(task.deadline)}</td>

      {/* Actions */}
      <td>
        <div className="task-actions">
          {isTracking ? (
            <button
              className="btn-icon stop-btn"
              onClick={(e) => {
                e.stopPropagation();
                onStopTracking(task.id);
              }}
              title="Остановить таймер"
            >
              <StopIcon size={14} />
            </button>
          ) : (
            <button
              className="btn-icon start-btn"
              onClick={(e) => {
                e.stopPropagation();
                onStartTracking(task.id);
              }}
              title="Начать работу"
            >
              <PlayIcon size={14} />
            </button>
          )}
          {onAddToDailyPlan && (
            <button
              className="btn-icon plan-btn"
              onClick={(e) => {
                e.stopPropagation();
                onAddToDailyPlan(task.id);
              }}
              title="Добавить в план на день"
            >
              <CalendarIcon size={14} />
            </button>
          )}
          {onEditTask && (
            <button
              className="btn-icon edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEditTask(task);
              }}
              title="Редактировать"
            >
              <EditIcon size={14} />
            </button>
          )}
          {onDuplicateTask && (
            <button
              className="btn-icon duplicate-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateTask(task.id);
              }}
              title="Дублировать"
            >
              <CopyIcon size={14} />
            </button>
          )}
          {onDeleteTask && (
            <button
              className="btn-icon delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTask(task);
              }}
              title="Удалить"
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
