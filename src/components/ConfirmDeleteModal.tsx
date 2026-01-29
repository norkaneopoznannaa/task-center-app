import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Task } from '../types';
import './Modal.css';

interface ConfirmDeleteModalProps {
  task: Task;
  onClose: () => void;
  onTaskDeleted?: () => void;
}

export function ConfirmDeleteModal({ task, onClose, onTaskDeleted }: ConfirmDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);

    try {
      const result = await window.api.deleteTask(task.id);

      if (result.success) {
        toast.success('Задача удалена');
        onTaskDeleted?.();
        onClose();
      } else {
        toast.error(result.error || 'Ошибка удаления задачи');
      }
    } catch (error) {
      toast.error('Ошибка удаления задачи');
      console.error('Delete task error:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-small" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Удалить задачу?</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '16px' }}>
            Вы уверены, что хотите удалить эту задачу?
          </p>
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              {task.title}
            </div>
            {task.jira_references.length > 0 && (
              <div style={{
                color: 'var(--text-secondary)',
                fontSize: '0.875rem'
              }}>
                {task.jira_references[0].ticket_id}
              </div>
            )}
          </div>
          <p style={{
            color: 'var(--accent-error)',
            fontSize: '0.875rem',
            margin: '0'
          }}>
            ⚠️ Это действие нельзя отменить. Все данные задачи, включая историю времени, будут удалены.
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>
            Отмена
          </button>
          <button
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}
