import React from 'react';
import { Task, STATUS_LABELS } from '../../types';

interface TaskMetadataProps {
  task: Task;
  onStatusChange: (taskId: string, status: string) => void;
}

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

export const TaskMetadata: React.FC<TaskMetadataProps> = ({ task, onStatusChange }) => {
  return (
    <>
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
            <span className="meta-value">{formatDate(task.metadata?.created_at)}</span>
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

      {/* Tags/Labels from clarifications */}
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
    </>
  );
};
