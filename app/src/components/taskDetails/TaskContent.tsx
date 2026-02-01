import React, { useState, useCallback } from 'react';
import { Task } from '../../types';
import { LinkIcon, UserIcon, ExternalLinkIcon, EditIcon, CheckIcon, CloseIcon } from '../icons';

interface TaskContentProps {
  task: Task;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
}

// Editable Notes Component
const EditableNotes: React.FC<{
  value: string;
  onSave: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onSave, disabled }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = useCallback(() => {
    onSave(draft);
    setIsEditing(false);
  }, [draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  }, [handleCancel, handleSave]);

  if (disabled) {
    return (
      <div className="notes-display readonly">
        {value ? (
          value.split('\n').map((line, i) => (
            <p key={i} className={line.startsWith('**') || line.startsWith('СРОЧНО') ? 'note-important' : ''}>
              {line || '\u00A0'}
            </p>
          ))
        ) : (
          <span className="notes-placeholder">Нет заметок</span>
        )}
      </div>
    );
  }

  if (!isEditing) {
    return (
      <div
        className="notes-display editable"
        onClick={() => setIsEditing(true)}
        title="Нажмите для редактирования"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsEditing(true)}
      >
        {value ? (
          value.split('\n').map((line, i) => (
            <p key={i} className={line.startsWith('**') || line.startsWith('СРОЧНО') ? 'note-important' : ''}>
              {line || '\u00A0'}
            </p>
          ))
        ) : (
          <span className="notes-placeholder">Нажмите чтобы добавить заметки...</span>
        )}
        <EditIcon size={14} className="edit-hint-icon" />
      </div>
    );
  }

  return (
    <div className="notes-editor">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        rows={5}
        placeholder="Введите заметки..."
        className="notes-textarea"
      />
      <div className="editor-actions">
        <button className="btn btn-sm btn-primary" onClick={handleSave} title="Сохранить (Ctrl+Enter)">
          <CheckIcon size={14} />
          <span>Сохранить</span>
        </button>
        <button className="btn btn-sm btn-secondary" onClick={handleCancel} title="Отмена (Esc)">
          <CloseIcon size={14} />
          <span>Отмена</span>
        </button>
      </div>
      <div className="editor-hint">
        Ctrl+Enter для сохранения, Esc для отмены
      </div>
    </div>
  );
};

export const TaskContent: React.FC<TaskContentProps> = ({ task, onUpdateTask }) => {
  const handleNotesUpdate = useCallback((newNotes: string) => {
    if (onUpdateTask) {
      onUpdateTask(task.id, { user_notes: newNotes });
    }
  }, [task.id, onUpdateTask]);

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

      {/* Jira References - improved with external link button */}
      {task.jira_references && task.jira_references.length > 0 && (
        <div className="detail-section">
          <label>Jira</label>
          <div className="jira-links">
            {task.jira_references.map((ref, i) => (
              <div key={i} className="jira-link-item">
                <a
                  href={ref.url || `https://jira.i-novus.ru/browse/${ref.ticket_id}`}
                  className="jira-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LinkIcon size={14} />
                  <span>{ref.ticket_id}</span>
                </a>
                <button
                  className="btn-icon btn-open-external"
                  onClick={() => window.open(ref.url || `https://jira.i-novus.ru/browse/${ref.ticket_id}`, '_blank')}
                  title="Открыть в Jira"
                  aria-label={`Открыть ${ref.ticket_id} в Jira`}
                >
                  <ExternalLinkIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mentions */}
      {task.mentions && task.mentions.length > 0 && (
        <div className="detail-section">
          <label>Участники</label>
          <div className="mentions">
            {task.mentions.map((person, i) => (
              <span key={i} className="mention" title={person.role || 'Участник'}>
                <UserIcon size={14} />
                <span>{person.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* User Notes - editable */}
      <div className="detail-section">
        <label>Заметки</label>
        <EditableNotes
          value={task.user_notes || ''}
          onSave={handleNotesUpdate}
          disabled={!onUpdateTask}
        />
      </div>
    </>
  );
};
