import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Task, Priority, TaskType, Complexity, Status, Category } from '../types';
import './Modal.css';

interface EditTaskModalProps {
  task: Task;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export function EditTaskModal({ task, onClose, onTaskUpdated }: EditTaskModalProps) {
  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description || '',
    task_type: task.task_type,
    complexity: task.complexity,
    priority: task.priority,
    status: task.status,
    category: task.category,
    jiraTicket: task.jira_references[0]?.ticket_id || '', // Edit first Jira reference
  });
  const [updating, setUpdating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Название задачи обязательно');
      return;
    }

    setUpdating(true);

    try {
      // Prepare updates
      const updates: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        task_type: formData.task_type,
        complexity: formData.complexity,
        priority: formData.priority,
        status: formData.status,
      };

      // Update category if changed
      if (formData.category !== task.category) {
        updates.category = formData.category || null;
      }

      // Update Jira reference if changed
      if (formData.jiraTicket.trim() !== (task.jira_references[0]?.ticket_id || '')) {
        if (formData.jiraTicket.trim()) {
          const jiraTicket = formData.jiraTicket.trim().toUpperCase();
          const project = jiraTicket.split('-')[0];
          updates.jira_references = [
            {
              ticket_id: jiraTicket,
              url: `https://jira.i-novus.ru/browse/${jiraTicket}`,
              project: project,
            },
          ];
        } else {
          // Remove Jira reference if empty
          updates.jira_references = [];
        }
      }

      const result = await window.api.updateTask(task.id, updates);

      if (result.success) {
        toast.success('Задача обновлена');
        onTaskUpdated?.();
        onClose();
      } else {
        toast.error(result.error || 'Ошибка обновления задачи');
      }
    } catch (error) {
      toast.error('Ошибка обновления задачи');
      console.error('Update task error:', error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Редактировать задачу</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Title (required) */}
            <div className="form-group">
              <label>
                Название <span className="required">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Краткое описание задачи"
                maxLength={200}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="form-group">
              <label>Описание</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Подробное описание задачи"
                rows={4}
                maxLength={5000}
              />
            </div>

            {/* Row 1: Type, Complexity */}
            <div className="form-row">
              <div className="form-group">
                <label>Тип задачи</label>
                <select
                  value={formData.task_type}
                  onChange={e => setFormData(prev => ({ ...prev, task_type: e.target.value as TaskType }))}
                >
                  <option value="Анализ/Исследование">Анализ/Исследование</option>
                  <option value="Документация">Документация</option>
                  <option value="Разработка">Разработка</option>
                  <option value="Координация">Координация</option>
                  <option value="Баг/Проблема">Баг/Проблема</option>
                  <option value="Неизвестно">Неизвестно</option>
                </select>
              </div>

              <div className="form-group">
                <label>Сложность</label>
                <select
                  value={formData.complexity}
                  onChange={e => setFormData(prev => ({ ...prev, complexity: e.target.value as Complexity }))}
                >
                  <option value="низкая">Низкая</option>
                  <option value="средняя">Средняя</option>
                  <option value="высокая">Высокая</option>
                </select>
              </div>
            </div>

            {/* Row 2: Priority, Status */}
            <div className="form-row">
              <div className="form-group">
                <label>Приоритет</label>
                <select
                  value={formData.priority}
                  onChange={e => setFormData(prev => ({ ...prev, priority: Number(e.target.value) as Priority }))}
                >
                  <option value={5}>5 - Критично</option>
                  <option value={4}>4 - Высокий</option>
                  <option value={3}>3 - Средний</option>
                  <option value={2}>2 - Низкий</option>
                  <option value={1}>1 - Бэклог</option>
                </select>
              </div>

              <div className="form-group">
                <label>Статус</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as Status }))}
                >
                  <option value="новая">Новая</option>
                  <option value="в работе">В работе</option>
                  <option value="завершена">Завершена</option>
                  <option value="заблокирована">Заблокирована</option>
                  <option value="выполнена">Выполнена</option>
                </select>
              </div>
            </div>

            {/* Row 3: Category, Jira Ticket */}
            <div className="form-row">
              <div className="form-group">
                <label>Категория</label>
                <select
                  value={formData.category || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    category: e.target.value ? e.target.value as Category : undefined
                  }))}
                >
                  <option value="">Не указана</option>
                  <option value="Общие">Общие</option>
                  <option value="РЭМД">РЭМД</option>
                  <option value="КУ ФЭР">КУ ФЭР</option>
                  <option value="Авто">Авто</option>
                </select>
              </div>

              <div className="form-group">
                <label>Jira задача</label>
                <input
                  type="text"
                  value={formData.jiraTicket}
                  onChange={e => setFormData(prev => ({ ...prev, jiraTicket: e.target.value }))}
                  placeholder="EGISZREMD-12345"
                  maxLength={20}
                />
                <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Редактирует первую Jira ссылку. Очистите для удаления.
                </small>
              </div>
            </div>

            {/* Task ID (read-only) */}
            <div className="form-group">
              <label>ID задачи</label>
              <input
                type="text"
                value={task.id}
                disabled
                style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={updating}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={updating}>
              {updating ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
