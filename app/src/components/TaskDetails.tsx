import React from 'react';
import { Task } from '../types';
import { TaskHeader, TaskContent, TaskMetadata, TaskTimeTracking } from './taskDetails/index';
import './TaskDetails.css';

interface TaskDetailsProps {
  task: Task | null;
  onClose: () => void;
  onStatusChange: (taskId: string, status: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
}

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  task,
  onClose,
  onStatusChange,
  onStartTimer,
  onStopTimer,
  activeTimers,
}) => {
  if (!task) {
    return (
      <div className="task-details-empty">
        <div className="empty-icon">📋</div>
        <p>Выберите задачу для просмотра деталей</p>
      </div>
    );
  }

  return (
    <div className="task-details">
      <TaskHeader task={task} onClose={onClose} />

      <div className="task-details-content">
        <TaskTimeTracking
          task={task}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          activeTimers={activeTimers}
        />

        <TaskContent task={task} />

        <TaskMetadata task={task} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
};
