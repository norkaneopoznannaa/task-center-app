import React, { useEffect, useState, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { TasksPage } from './pages/TasksPage';
import { WorklogsPage } from './pages/WorklogsPage';
import { TaskDetails } from './components/TaskDetails';
import { ResizeHandle } from './components/ResizeHandle';
import { Task, TasksData, TaskFilters, SortConfig } from './types';

type Theme = 'dark' | 'light';
type Page = 'tasks' | 'worklogs';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [activeTimers, setActiveTimers] = useState<Record<string, { startTime: Date; elapsed: number }>>({});
  const [filters, setFilters] = useState<TaskFilters>({
    status: 'all',
    priority: 'all',
    category: 'all',
    search: '',
  });
  const [sort, setSort] = useState<SortConfig>({
    field: 'priority',
    direction: 'desc',
  });
  const [detailsWidth, setDetailsWidth] = useState(() => {
    const saved = localStorage.getItem('task-center-details-width');
    return saved ? parseInt(saved, 10) : 560;
  });
  const [activePage, setActivePage] = useState<Page>('tasks');

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('task-center-theme', theme);
  }, [theme]);

  // Load saved theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('task-center-theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // Handle details panel resize
  const handleDetailsResize = useCallback((deltaX: number) => {
    setDetailsWidth(prev => {
      const newWidth = Math.min(Math.max(prev + deltaX, 320), 800);
      localStorage.setItem('task-center-details-width', String(newWidth));
      return newWidth;
    });
  }, []);

  // Load tasks
  const loadTasks = useCallback(async () => {
    try {
      const result = await window.api.getTasks();
      if (result.success && result.data) {
        setTasks(result.data.tasks);
        setLastUpdated(result.data.updated_at);
      } else {
        console.error('Failed to load tasks:', result.error);
        toast.error('Не удалось загрузить задачи');
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      toast.error('Ошибка загрузки задач');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Subscribe to file changes (auto-refresh)
  useEffect(() => {
    const cleanup = window.api.onTasksFileChanged(() => {
      console.log('Tasks file changed, reloading...');
      toast.success('Данные обновлены', { duration: 2000, icon: '🔄' });
      loadTasks();
    });

    return cleanup;
  }, [loadTasks]);

  // Update task
  const handleUpdateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    try {
      const result = await window.api.updateTask(taskId, updates);
      if (result.success) {
        // Локально обновляем для мгновенного отображения
        setTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, ...updates } : t))
        );
        toast.success('Задача обновлена', { duration: 1500 });
      } else {
        toast.error('Ошибка обновления');
      }
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Ошибка обновления задачи');
    }
  }, []);

  // Start time tracking
  const handleStartTracking = useCallback(async (taskId: string) => {
    try {
      const result = await window.api.startTimeTracking(taskId);
      if (result.success) {
        setActiveTimers(prev => ({
          ...prev,
          [taskId]: { startTime: new Date(result.startTime), elapsed: 0 }
        }));
        toast.success('Таймер запущен', { icon: '⏱️' });
        loadTasks();
      }
    } catch (error) {
      toast.error('Ошибка запуска таймера');
    }
  }, [loadTasks]);

  // Stop time tracking
  const handleStopTracking = useCallback(async (taskId: string) => {
    try {
      const result = await window.api.stopTimeTracking(taskId);
      if (result.success) {
        setActiveTimers(prev => {
          const newTimers = { ...prev };
          delete newTimers[taskId];
          return newTimers;
        });
        toast.success(
          `Таймер остановлен: ${result.durationMinutes} мин (всего: ${result.totalMinutes} мин)`,
          { icon: '⏱️', duration: 3000 }
        );
        loadTasks();
      }
    } catch (error) {
      toast.error('Ошибка остановки таймера');
    }
  }, [loadTasks]);

  // Handle task selection
  const handleTaskSelect = useCallback((task: Task) => {
    setSelectedTask(task);
    setShowDetails(true);
  }, []);

  // Close details panel
  const handleCloseDetails = useCallback(() => {
    setShowDetails(false);
  }, []);

  // Update active timers from loaded tasks
  useEffect(() => {
    const newTimers: Record<string, { startTime: Date; elapsed: number }> = {};
    tasks.forEach(task => {
      if (task.time_tracking?.current_session_start) {
        newTimers[task.id] = {
          startTime: new Date(task.time_tracking.current_session_start),
          elapsed: 0
        };
      }
    });
    setActiveTimers(newTimers);
  }, [tasks]);

  // Update selected task when tasks change
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [tasks, selectedTask?.id]);

  // Stats
  const stats = {
    total: tasks.length,
    new: tasks.filter(t => t.status === 'новая').length,
    inProgress: tasks.filter(t => t.status === 'в работе').length,
    done: tasks.filter(t => t.status === 'завершена').length,
    blocked: tasks.filter(t => t.status === 'заблокирована').length,
  };

  return (
    <div className="app-container">
      <TitleBar theme={theme} onThemeToggle={toggleTheme} />
      <div className="app-main">
        <Sidebar
          filters={filters}
          onFiltersChange={setFilters}
          stats={stats}
          activePage={activePage}
          onPageChange={setActivePage}
        />
        <main className="app-content">
          {loading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : activePage === 'tasks' ? (
            <TasksPage
              tasks={tasks}
              filters={filters}
              sort={sort}
              onSortChange={setSort}
              onUpdateTask={handleUpdateTask}
              onStartTracking={handleStartTracking}
              onStopTracking={handleStopTracking}
              onTaskSelect={handleTaskSelect}
              activeTimers={activeTimers}
              lastUpdated={lastUpdated}
            />
          ) : (
            <WorklogsPage tasks={tasks} />
          )}
        </main>
        {showDetails && (
          <aside className="app-details" style={{ width: detailsWidth, minWidth: detailsWidth }}>
            <ResizeHandle position="left" onResize={handleDetailsResize} />
            <TaskDetails
              task={selectedTask}
              onClose={handleCloseDetails}
              onStatusChange={(taskId, status) => handleUpdateTask(taskId, { status })}
              onStartTimer={handleStartTracking}
              onStopTimer={handleStopTracking}
              activeTimers={activeTimers}
            />
          </aside>
        )}
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </div>
  );
}

export default App;
