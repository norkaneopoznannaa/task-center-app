import React from 'react';
import { Task } from '../../types';

interface TaskContentProps {
  task: Task;
}

export const TaskContent: React.FC<TaskContentProps> = ({ task }) => {
  return (
    <>
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
    </>
  );
};
