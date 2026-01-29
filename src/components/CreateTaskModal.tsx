import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Priority, TaskType, Complexity, Status, Category } from '../types';
import './Modal.css';

interface CreateTaskModalProps {
  onClose: () => void;
  onTaskCreated?: () => void;
}

export function CreateTaskModal({ onClose, onTaskCreated }: CreateTaskModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    task_type: 'Неизвестно' as TaskType,
    complexity: 'средняя' as Complexity,
    priority: 3 as Priority,
    status: 'новая' as Status,
    category: undefined as Category | undefined,
    jiraTicket: '', // Helper field for adding Jira references
  });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Название задачи обязательно');
      return;
    }

    setCreating(true);

    try {
      // Prepare task data
      const taskData: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        task_type: formData.task_type,
        complexity: formData.complexity,
        priority: formData.priority,
        status: formData.status,
      };

      // Add category if provided
      if (formData.category) {
        taskData.category = formData.category;
      }

      // Add Jira reference if provided
      if (formData.jiraTicket.trim()) {
        const jiraTicket = formData.jiraTicket.trim().toUpperCase();
        const project = jiraTicket.split('-')[0];
        taskData.jira_references = [
          {
            ticket_id: jiraTicket,
            url: `https://jira.i-novus.ru/browse/${jiraTicket}`,
            project: project,
          },
        ];
      }

      const result = await window.api.createTask(taskData);

      if (result.success) {
        toast.success('Задача создана');
        onTaskCreated?.();
        onClose();
      } else {
        toast.error(result.error || 'Ошибка создания задачи');
      }
    } catch (error) {
      toast.error('Ошибка создания задачи');
      console.error('Create task error:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Создать задачу</h2>
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
                  Необязательно. Например: EGISZREMD-12345
                </small>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={creating}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
