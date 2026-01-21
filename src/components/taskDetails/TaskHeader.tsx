import React from 'react';
import { Task, PRIORITY_LABELS, STATUS_LABELS } from '../../types';

interface TaskHeaderProps {
  task: Task;
  onClose: () => void;
}

const getPriorityClass = (priority: number): string => {
  const map: Record<number, string> = {
    5: 'critical',
    4: 'high',
    3: 'medium',
    2: 'low',
    1: 'backlog',
  };
  return map[priority] || 'medium';
};

const getStatusClass = (status: string): string => {
  const map: Record<string, string> = {
    'новая': 'new',
    'в работе': 'progress',
    'выполнена': 'done',
    'заблокирована': 'blocked',
  };
  return map[status] || 'new';
};

export const TaskHeader: React.FC<TaskHeaderProps> = ({ task, onClose }) => {
  return (
    <div className="task-details-header">
      <h2>Детали задачи</h2>
      <button className="btn-icon close-btn" onClick={onClose} title="Закрыть">
        ✕
      </button>

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
    </div>
  );
};
