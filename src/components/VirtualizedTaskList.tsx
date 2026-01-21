import React, { useCallback, useMemo, CSSProperties } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { Task } from '../types';
import { TaskRow } from './TaskRow';
import './VirtualizedTaskList.css';

interface VirtualizedTaskListProps {
  tasks: Task[];
  height: number;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onStartTracking: (taskId: string) => void;
  onStopTracking: (taskId: string) => void;
  onSelectTask?: (task: Task) => void;
  selectedTaskId?: string;
}

// Row height in pixels
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 40;

// Memoized row component for better performance
const MemoizedTaskRow = React.memo(TaskRow);

interface RowData {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onStartTracking: (taskId: string) => void;
  onStopTracking: (taskId: string) => void;
  onSelectTask?: (task: Task) => void;
  selectedTaskId?: string;
}

// Individual row renderer
const Row = ({ index, style, data }: ListChildComponentProps<RowData>) => {
  const { tasks, onUpdateTask, onStartTracking, onStopTracking, onSelectTask, selectedTaskId } = data;
  const task = tasks[index];

  // Wrap in table structure for proper rendering
  return (
    <div style={style} className={`virtual-row ${selectedTaskId === task.id ? 'selected' : ''}`}>
      <table className="task-table-row">
        <tbody>
          <MemoizedTaskRow
            task={task}
            onUpdateTask={onUpdateTask}
            onStartTracking={onStartTracking}
            onStopTracking={onStopTracking}
            onClick={onSelectTask ? () => onSelectTask(task) : undefined}
          />
        </tbody>
      </table>
    </div>
  );
};

export function VirtualizedTaskList({
  tasks,
  height,
  onUpdateTask,
  onStartTracking,
  onStopTracking,
  onSelectTask,
  selectedTaskId
}: VirtualizedTaskListProps) {
  // Memoize item data to prevent unnecessary re-renders
  const itemData = useMemo<RowData>(() => ({
    tasks,
    onUpdateTask,
    onStartTracking,
    onStopTracking,
    onSelectTask,
    selectedTaskId
  }), [tasks, onUpdateTask, onStartTracking, onStopTracking, onSelectTask, selectedTaskId]);

  // Calculate actual list height (minus header)
  const listHeight = Math.max(height - HEADER_HEIGHT, 200);

  // Render nothing if no tasks
  if (tasks.length === 0) {
    return (
      <div className="virtualized-task-list empty">
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Приоритет</th>
              <th>Название</th>
              <th style={{ width: '120px' }}>Статус</th>
              <th style={{ width: '100px' }}>Jira</th>
              <th style={{ width: '100px' }}>Время</th>
              <th style={{ width: '80px' }}>Дедлайн</th>
              <th style={{ width: '60px' }}></th>
            </tr>
          </thead>
        </table>
        <div className="empty-message">Нет задач</div>
      </div>
    );
  }

  return (
    <div className="virtualized-task-list">
      {/* Fixed header */}
      <table className="task-table">
        <thead>
          <tr>
            <th style={{ width: '80px' }}>Приоритет</th>
            <th>Название</th>
            <th style={{ width: '120px' }}>Статус</th>
            <th style={{ width: '100px' }}>Jira</th>
            <th style={{ width: '100px' }}>Время</th>
            <th style={{ width: '80px' }}>Дедлайн</th>
            <th style={{ width: '60px' }}></th>
          </tr>
        </thead>
      </table>

      {/* Virtualized body */}
      <List
        height={listHeight}
        width="100%"
        itemCount={tasks.length}
        itemSize={ROW_HEIGHT}
        itemData={itemData}
        overscanCount={5}
        className="virtual-list-body"
      >
        {Row}
      </List>

      {/* Task count footer */}
      <div className="list-footer">
        Показано: {tasks.length} задач
      </div>
    </div>
  );
}

// Export with default props for easy drop-in replacement
export default VirtualizedTaskList;
