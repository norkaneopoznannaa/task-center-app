import React, { useEffect, useRef } from 'react';
import { Task } from '../types';
import { TaskHeader, TaskContent, TaskMetadata, TaskTimeTracking } from './taskDetails/index';
import { ClipboardIcon } from './icons';
import './TaskDetails.css';

interface TaskDetailsProps {
  task: Task | null;
  onClose: () => void;
  onStatusChange: (taskId: string, status: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  task,
  onClose,
  onStatusChange,
  onStartTimer,
  onStopTimer,
  onUpdateTask,
  activeTimers,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation - Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus panel when task changes
  useEffect(() => {
    if (task && panelRef.current) {
      panelRef.current.focus();
    }
  }, [task?.id]);

  if (!task) {
    return (
      <div className="task-details-empty">
        <div className="empty-icon">
          <ClipboardIcon size={48} />
        </div>
        <p>Выберите задачу для просмотра деталей</p>
        <span className="empty-hint">Нажмите на строку в таблице</span>
      </div>
    );
  }

  return (
    <div
      className="task-details"
      ref={panelRef}
      tabIndex={-1}
      role="complementary"
      aria-label={`Детали задачи: ${task.title}`}
    >
      <TaskHeader task={task} onClose={onClose} />

      <div className="task-details-content">
        {/* 1. Description - most important */}
        <TaskContent task={task} onUpdateTask={onUpdateTask} />

        {/* 2. Time Tracking */}
        <TaskTimeTracking
          task={task}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          activeTimers={activeTimers}
        />

        {/* 3. Status & Metadata - least important, at bottom */}
        <TaskMetadata task={task} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
};
