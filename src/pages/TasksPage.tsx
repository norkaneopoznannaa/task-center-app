import React, { useMemo } from 'react';
import { Task, TaskFilters, SortConfig, SortField, Priority, Status } from '../types';
import { TaskRow } from '../components/TaskRow';
import { DailyPlan } from '../components/DailyPlan';
import './TasksPage.css';

interface TasksPageProps {
  tasks: Task[];
  filters: TaskFilters;
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onStartTracking: (taskId: string) => void;
  onStopTracking: (taskId: string) => void;
  onTaskSelect: (task: Task) => void;
  activeTimers: Record<string, { startTime: Date; elapsed: number }>;
  lastUpdated: string | null;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  BACKLOG: 1,
};

const STATUS_ORDER: Record<Status, number> = {
  'в работе': 4,
  'новая': 3,
  'заблокирована': 2,
  'завершена': 1,
};

export function TasksPage({
  tasks,
  filters,
  sort,
  onSortChange,
  onUpdateTask,
  onStartTracking,
  onStopTracking,
  onTaskSelect,
  activeTimers,
  lastUpdated,
}: TasksPageProps) {
  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Status filter
      if (filters.status !== 'all' && task.status !== filters.status) {
        return false;
      }
      // Priority filter
      if (filters.priority !== 'all' && task.priority !== filters.priority) {
        return false;
      }
      // Category filter
      if (filters.category !== 'all' && task.category !== filters.category) {
        return false;
      }
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(searchLower);
        const matchDesc = task.description.toLowerCase().includes(searchLower);
        const matchJira = task.jira_references.some(j =>
          j.ticket_id.toLowerCase().includes(searchLower)
        );
        if (!matchTitle && !matchDesc && !matchJira) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filters]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'priority':
          comparison = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
          break;
        case 'status':
          comparison = STATUS_ORDER[b.status] - STATUS_ORDER[a.status];
          break;
        case 'deadline':
          if (!a.deadline && !b.deadline) comparison = 0;
          else if (!a.deadline) comparison = 1;
          else if (!b.deadline) comparison = -1;
          else comparison = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          break;
        case 'created_at':
          comparison = new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title, 'ru');
          break;
      }

      return sort.direction === 'desc' ? comparison : -comparison;
    });
  }, [filteredTasks, sort]);

  const handleSort = (field: SortField) => {
    if (sort.field === field) {
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ field, direction: 'desc' });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sort.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="tasks-page">
      {/* Daily Plan */}
      <div className="tasks-top-section">
        <DailyPlan
          tasks={tasks}
          onTaskClick={onTaskSelect}
          onStartTimer={onStartTracking}
          activeTimers={activeTimers}
        />
      </div>

      {/* Header */}
      <div className="tasks-header">
        <div className="tasks-header-left">
          <h1>Все задачи</h1>
          <span className="tasks-count">{filteredTasks.length} из {tasks.length}</span>
        </div>
        <div className="tasks-header-right">
          {lastUpdated && (
            <span className="last-updated">
              Обновлено: {formatDate(lastUpdated)}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="tasks-table-container">
        <table className="tasks-table">
          <thead>
            <tr>
              <th className="col-priority" onClick={() => handleSort('priority')}>
                Приоритет <SortIcon field="priority" />
              </th>
              <th className="col-title" onClick={() => handleSort('title')}>
                Задача <SortIcon field="title" />
              </th>
              <th className="col-status" onClick={() => handleSort('status')}>
                Статус <SortIcon field="status" />
              </th>
              <th className="col-jira">Jira</th>
              <th className="col-time">Время</th>
              <th className="col-deadline" onClick={() => handleSort('deadline')}>
                Дедлайн <SortIcon field="deadline" />
              </th>
              <th className="col-actions">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  <div className="empty-state-content">
                    <span className="empty-state-icon">📭</span>
                    <p>Нет задач по выбранным фильтрам</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onUpdateTask={onUpdateTask}
                  onStartTracking={onStartTracking}
                  onStopTracking={onStopTracking}
                  onClick={() => onTaskSelect(task)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
