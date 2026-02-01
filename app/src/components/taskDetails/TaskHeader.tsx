import React from 'react';
import { Task, PRIORITY_LABELS, STATUS_LABELS, normalizePriority, getPriorityLabel, CATEGORY_COLORS, Category } from '../../types';
import { CloseIcon } from '../icons';

interface TaskHeaderProps {
  task: Task;
  onClose: () => void;
}

const getPriorityClass = (priority: string): string => {
  const map: Record<string, string> = {
    'CRITICAL': 'critical',
    'HIGH': 'high',
    'MEDIUM': 'medium',
    'LOW': 'low',
    'BACKLOG': 'backlog',
  };
  return map[priority] || 'medium';
};

const getStatusClass = (status: string): string => {
  const map: Record<string, string> = {
    'новая': 'new',
    'в работе': 'progress',
    'выполнена': 'done',
    'завершена': 'done',
    'заблокирована': 'blocked',
  };
  return map[status] || 'new';
};

export const TaskHeader: React.FC<TaskHeaderProps> = ({ task, onClose }) => {
  const categoryColor = task.category ? CATEGORY_COLORS[task.category as Category] : undefined;

  return (
    <div className="task-details-header">
      <div className="header-top-row">
        <div className="header-category-indicator">
          {categoryColor && (
            <span
              className="category-dot"
              style={{ backgroundColor: categoryColor }}
              title={task.category}
            />
          )}
          {task.category && (
            <span className="category-label">{task.category}</span>
          )}
        </div>
        <button
          className="btn-icon close-btn"
          onClick={onClose}
          title="Закрыть (Esc)"
          aria-label="Закрыть панель деталей"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <h2 className="task-title-main">{task.title}</h2>

      <div className="task-badges">
        <span
          className={`badge badge-priority badge-${getPriorityClass(normalizePriority(task.priority))}`}
          title="Приоритет"
        >
          {getPriorityLabel(task.priority)}
        </span>
        <span
          className={`badge badge-status badge-${getStatusClass(task.status)}`}
          title="Статус"
        >
          {STATUS_LABELS[task.status] || task.status}
        </span>
        {task.task_type && task.task_type !== 'Неизвестно' && (
          <span className="badge badge-type" title="Тип задачи">
            {task.task_type}
          </span>
        )}
      </div>
    </div>
  );
};
