import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Task, Priority, TaskType, Complexity, Status, Category } from '../types';
import './Modal.css';

interface BulkEditModalProps {
  tasks: Task[];
  onClose: () => void;
  onTasksUpdated?: () => void;
}

type FieldToUpdate = 'none' | 'priority' | 'status' | 'task_type' | 'complexity' | 'category';

export function BulkEditModal({ tasks, onClose, onTasksUpdated }: BulkEditModalProps) {
  const [selectedField, setSelectedField] = useState<FieldToUpdate>('none');
  const [newValue, setNewValue] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedField === 'none') {
      toast.error('Выберите поле для обновления');
      return;
    }

    if (!newValue) {
      toast.error('Выберите новое значение');
      return;
    }

    setUpdating(true);

    try {
      const taskIds = tasks.map(t => t.id);
      const updates: Record<string, unknown> = {};

      // Prepare update based on selected field
      if (selectedField === 'priority') {
        updates.priority = Number(newValue) as Priority;
      } else if (selectedField === 'status') {
        updates.status = newValue as Status;
      } else if (selectedField === 'task_type') {
        updates.task_type = newValue as TaskType;
      } else if (selectedField === 'complexity') {
        updates.complexity = newValue as Complexity;
      } else if (selectedField === 'category') {
        updates.category = newValue === 'none' ? null : (newValue as Category);
      }

      const result = await window.api.bulkUpdateTasks(taskIds, updates);

      if (result.success) {
        toast.success(`Обновлено задач: ${result.updatedCount}`);
        onTasksUpdated?.();
        onClose();
      } else {
        toast.error(result.error || 'Ошибка обновления задач');
      }
    } catch (error) {
      toast.error('Ошибка обновления задач');
      console.error('Bulk update error:', error);
    } finally {
      setUpdating(false);
    }
  };

  const renderValueSelector = () => {
    if (selectedField === 'none') {
      return null;
    }

    if (selectedField === 'priority') {
      return (
        <div className="form-group">
          <label>Новый приоритет</label>
          <select
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
          >
            <option value="">Выберите приоритет</option>
            <option value="5">5 - Критично</option>
            <option value="4">4 - Высокий</option>
            <option value="3">3 - Средний</option>
            <option value="2">2 - Низкий</option>
            <option value="1">1 - Бэклог</option>
          </select>
        </div>
      );
    }

    if (selectedField === 'status') {
      return (
        <div className="form-group">
          <label>Новый статус</label>
          <select
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
          >
            <option value="">Выберите статус</option>
            <option value="новая">Новая</option>
            <option value="в работе">В работе</option>
            <option value="завершена">Завершена</option>
            <option value="заблокирована">Заблокирована</option>
            <option value="выполнена">Выполнена</option>
          </select>
        </div>
      );
    }

    if (selectedField === 'task_type') {
      return (
        <div className="form-group">
          <label>Новый тип задачи</label>
          <select
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
          >
            <option value="">Выберите тип</option>
            <option value="Анализ/Исследование">Анализ/Исследование</option>
            <option value="Документация">Документация</option>
            <option value="Разработка">Разработка</option>
            <option value="Координация">Координация</option>
            <option value="Баг/Проблема">Баг/Проблема</option>
            <option value="Неизвестно">Неизвестно</option>
          </select>
        </div>
      );
    }

    if (selectedField === 'complexity') {
      return (
        <div className="form-group">
          <label>Новая сложность</label>
          <select
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
          >
            <option value="">Выберите сложность</option>
            <option value="низкая">Низкая</option>
            <option value="средняя">Средняя</option>
            <option value="высокая">Высокая</option>
          </select>
        </div>
      );
    }

    if (selectedField === 'category') {
      return (
        <div className="form-group">
          <label>Новая категория</label>
          <select
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
          >
            <option value="">Выберите категорию</option>
            <option value="none">Не указана</option>
            <option value="Общие">Общие</option>
            <option value="РЭМД">РЭМД</option>
            <option value="КУ ФЭР">КУ ФЭР</option>
            <option value="Авто">Авто</option>
          </select>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-medium" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Массовое редактирование</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Selected tasks count */}
            <div style={{
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '0.875rem'
            }}>
              Выбрано задач: <strong>{tasks.length}</strong>
            </div>

            {/* Field selector */}
            <div className="form-group">
              <label>Поле для обновления</label>
              <select
                value={selectedField}
                onChange={e => {
                  setSelectedField(e.target.value as FieldToUpdate);
                  setNewValue(''); // Reset value when field changes
                }}
              >
                <option value="none">Выберите поле</option>
                <option value="priority">Приоритет</option>
                <option value="status">Статус</option>
                <option value="task_type">Тип задачи</option>
                <option value="complexity">Сложность</option>
                <option value="category">Категория</option>
              </select>
            </div>

            {/* Value selector (conditional) */}
            {renderValueSelector()}

            {/* Warning */}
            {selectedField !== 'none' && (
              <p style={{
                color: 'var(--accent-warning)',
                fontSize: '0.875rem',
                marginTop: '16px',
                marginBottom: '0'
              }}>
                ⚠️ Это действие изменит выбранное поле для всех {tasks.length} задач(и).
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={updating}>
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={updating || selectedField === 'none' || !newValue}
            >
              {updating ? 'Обновление...' : 'Применить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
