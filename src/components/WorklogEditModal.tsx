import React, { useState, useEffect } from 'react';
import { LocalWorklog, WorklogFormData } from '../types/worklog';
import './Modal.css';

interface WorklogEditModalProps {
  worklog: LocalWorklog | null;
  tasks: { id: string; title: string; jira_references: { ticket_id: string }[] }[];
  selectedDate: string;
  onSave: (data: WorklogFormData, id?: string) => void;
  onClose: () => void;
}

export function WorklogEditModal({ worklog, tasks, selectedDate, onSave, onClose }: WorklogEditModalProps) {
  const [formData, setFormData] = useState<WorklogFormData>(() => {
    if (worklog) {
      return {
        taskId: worklog.taskId,
        jiraKey: worklog.jiraKey || '',
        date: worklog.date,
        startTime: worklog.startTime,
        endTime: worklog.endTime,
        description: worklog.description,
      };
    }
    // Default for new worklog
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return {
      taskId: '',
      jiraKey: '',
      date: selectedDate,
      startTime: `${hours}:00`,
      endTime: `${hours}:${minutes}`,
      description: '',
    };
  });

  // Calculate duration
  const calculateDuration = () => {
    const [startH, startM] = formData.startTime.split(':').map(Number);
    const [endH, endM] = formData.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return Math.max(0, endMinutes - startMinutes);
  };

  // Auto-fill Jira key when task changes
  useEffect(() => {
    if (formData.taskId && !worklog) {
      const task = tasks.find(t => t.id === formData.taskId);
      if (task && task.jira_references.length > 0) {
        setFormData(prev => ({
          ...prev,
          jiraKey: task.jira_references[0].ticket_id,
        }));
      }
    }
  }, [formData.taskId, tasks, worklog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const duration = calculateDuration();
    if (duration <= 0) {
      alert('Время окончания должно быть больше времени начала');
      return;
    }
    const data: WorklogFormData = {
      ...formData,
      durationMinutes: duration,
    } as WorklogFormData & { durationMinutes: number };
    onSave(data, worklog?.id);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}ч ${mins}м`;
    if (hours > 0) return `${hours}ч`;
    return `${mins}м`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{worklog ? 'Редактировать worklog' : 'Добавить worklog'}</h2>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {/* Task */}
          <div className="form-group">
            <label>Задача</label>
            <select
              value={formData.taskId}
              onChange={e => setFormData(prev => ({ ...prev, taskId: e.target.value }))}
              required
            >
              <option value="">Выберите задачу...</option>
              {tasks.map(task => (
                <option key={task.id} value={task.id}>
                  {task.jira_references[0]?.ticket_id && `[${task.jira_references[0].ticket_id}] `}
                  {task.title}
                </option>
              ))}
            </select>
          </div>

          {/* Jira Key */}
          <div className="form-group">
            <label>Jira ключ</label>
            <input
              type="text"
              value={formData.jiraKey}
              onChange={e => setFormData(prev => ({ ...prev, jiraKey: e.target.value }))}
              placeholder="EGISZREMD-12345"
            />
          </div>

          {/* Date */}
          <div className="form-group">
            <label>Дата</label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
              required
            />
          </div>

          {/* Time */}
          <div className="form-row">
            <div className="form-group">
              <label>Начало</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Конец</label>
              <input
                type="time"
                value={formData.endTime}
                onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Длительность</label>
              <div className="duration-display">{formatDuration(calculateDuration())}</div>
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label>Описание (комментарий для Jira)</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder="Что было сделано..."
            />
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
