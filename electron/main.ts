import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as chokidar from 'chokidar';
import * as worklogStorage from './worklog-storage';
import * as jiraConfig from './jira-config';

// File watcher
let fileWatcher: chokidar.FSWatcher | null = null;
let mainWindow: BrowserWindow | null = null;

// Путь к tasks.json
const TASKS_FILE_PATH = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  'tasks.json'
);

// ============================================================================
// IN-MEMORY CACHE - Ускорение для AI workflow
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TasksCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private ttl: number;

  constructor(ttl: number = 5000) { // 5 секунд TTL по умолчанию
    this.ttl = ttl;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

const tasksCache = new TasksCache(5000); // TTL 5 секунд

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Кастомный заголовок
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  // Dev или Production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopFileWatcher();
  });

  // Запуск file watcher
  startFileWatcher();
}

// ============================================================================
// FILE WATCHER - Auto-refresh при изменении tasks.json
// ============================================================================

function startFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
  }

  // Проверяем существование файла
  if (!fs.existsSync(TASKS_FILE_PATH)) {
    console.log('tasks.json not found at:', TASKS_FILE_PATH);
    return;
  }

  console.log('Starting chokidar file watcher for:', TASKS_FILE_PATH);

  // Используем chokidar для надёжного отслеживания на Windows
  fileWatcher = chokidar.watch(TASKS_FILE_PATH, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
    usePolling: true,      // Более надёжно на Windows
    interval: 500,         // Интервал polling
  });

  fileWatcher.on('change', (filePath) => {
    console.log('tasks.json changed (chokidar):', filePath);
    mainWindow?.webContents.send('tasks-file-changed');
  });

  fileWatcher.on('error', (error) => {
    console.error('File watcher error:', error);
  });
}

function stopFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

// Получить все задачи (с кэшированием)
ipcMain.handle('get-tasks', async () => {
  try {
    // Проверяем кэш
    const cached = tasksCache.get<{ version: string; tasks: unknown[] }>('all-tasks');
    if (cached) {
      console.log('Cache hit: get-tasks');
      return { success: true, data: cached };
    }

    // Async проверка существования файла
    try {
      await fsPromises.access(TASKS_FILE_PATH);
    } catch {
      return { success: false, error: 'tasks.json not found' };
    }

    // Async чтение файла
    const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content);

    // Сохраняем в кэш
    tasksCache.set('all-tasks', data);
    console.log('Cache miss: get-tasks, loaded from file');

    return { success: true, data };
  } catch (error) {
    console.error('Error reading tasks:', error);
    return { success: false, error: String(error) };
  }
});

// Обновить задачу (async + cache invalidation)
ipcMain.handle('update-task', async (_event, taskId: string, updates: Record<string, unknown>) => {
  try {
    // Async проверка существования файла
    try {
      await fsPromises.access(TASKS_FILE_PATH);
    } catch {
      return { success: false, error: 'tasks.json not found' };
    }

    // Async чтение
    const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content);

    const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: 'Task not found' };
    }

    // Обновляем задачу
    data.tasks[taskIndex] = {
      ...data.tasks[taskIndex],
      ...updates,
      metadata: {
        ...data.tasks[taskIndex].metadata,
        updated_at: new Date().toISOString(),
      },
    };

    // Обновляем время изменения файла
    data.updated_at = new Date().toISOString();

    // Async запись
    await fsPromises.writeFile(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

    // Инвалидируем кэш
    tasksCache.invalidate('all-tasks');
    console.log('Cache invalidated after update-task');

    return { success: true };
  } catch (error) {
    console.error('Error updating task:', error);
    return { success: false, error: String(error) };
  }
});

// Начать отслеживание времени (async + cache invalidation)
ipcMain.handle('start-time-tracking', async (_event, taskId: string) => {
  try {
    const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content);

    const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: 'Task not found' };
    }

    // Добавляем время начала
    if (!data.tasks[taskIndex].time_tracking) {
      data.tasks[taskIndex].time_tracking = {
        sessions: [],
        total_minutes: 0,
      };
    }

    data.tasks[taskIndex].time_tracking.current_session_start = new Date().toISOString();
    data.tasks[taskIndex].status = 'в работе';
    data.tasks[taskIndex].metadata.last_status_change = new Date().toISOString();
    data.updated_at = new Date().toISOString();

    await fsPromises.writeFile(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    tasksCache.invalidate('all-tasks');

    return { success: true, startTime: data.tasks[taskIndex].time_tracking.current_session_start };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Остановить отслеживание времени (async + cache invalidation)
ipcMain.handle('stop-time-tracking', async (_event, taskId: string) => {
  try {
    const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content);

    const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: 'Task not found' };
    }

    const task = data.tasks[taskIndex];
    if (!task.time_tracking?.current_session_start) {
      return { success: false, error: 'No active session' };
    }

    const startTime = new Date(task.time_tracking.current_session_start);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    // Сохраняем сессию
    task.time_tracking.sessions.push({
      start: task.time_tracking.current_session_start,
      end: endTime.toISOString(),
      duration_minutes: durationMinutes,
    });

    task.time_tracking.total_minutes += durationMinutes;
    delete task.time_tracking.current_session_start;

    // Обновляем actual_hours
    task.metadata.actual_hours = Math.round((task.time_tracking.total_minutes / 60) * 10) / 10;
    task.metadata.updated_at = new Date().toISOString();
    data.updated_at = new Date().toISOString();

    await fsPromises.writeFile(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

    // Инвалидируем кэш
    tasksCache.invalidate('all-tasks');
    console.log('Cache invalidated after stop-time-tracking');

    return {
      success: true,
      durationMinutes,
      totalMinutes: task.time_tracking.total_minutes,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ============================================================================
// SMART WORKLOG AUTO-CREATION - Phase 1 Quick Win
// ============================================================================

// Helper functions для worklog
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// Остановить отслеживание времени с автоматическим созданием worklog
ipcMain.handle('stop-time-tracking-with-worklog', async (_event, taskId: string, options?: {
  autoCreateWorklog?: boolean;
  suggestDescription?: boolean;
}) => {
  try {
    const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content);

    const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: 'Task not found' };
    }

    const task = data.tasks[taskIndex];
    if (!task.time_tracking?.current_session_start) {
      return { success: false, error: 'No active session' };
    }

    const startTime = new Date(task.time_tracking.current_session_start);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    // Сохраняем сессию в time_tracking
    task.time_tracking.sessions.push({
      start: task.time_tracking.current_session_start,
      end: endTime.toISOString(),
      duration_minutes: durationMinutes,
    });

    task.time_tracking.total_minutes += durationMinutes;
    delete task.time_tracking.current_session_start;

    // Обновляем actual_hours
    task.metadata.actual_hours = Math.round((task.time_tracking.total_minutes / 60) * 10) / 10;
    task.metadata.updated_at = new Date().toISOString();
    data.updated_at = new Date().toISOString();

    // Сохраняем tasks.json
    await fsPromises.writeFile(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

    // Инвалидируем кэш
    tasksCache.invalidate('all-tasks');
    console.log('Cache invalidated after stop-time-tracking-with-worklog');

    // ✅ НОВОЕ: Автоматически создаем worklog
    let worklog = null;
    if (options?.autoCreateWorklog !== false) {
      const jiraKey = task.jira_references?.[0]?.ticket_id || null;

      // Базовое описание (AI генерация будет добавлена позже)
      const durationHours = Math.round(durationMinutes / 60 * 10) / 10;
      const description = options?.suggestDescription && jiraKey
        ? `Работа над задачей ${task.title} (${durationHours}ч)`
        : '';

      const worklogData = {
        taskId: task.id,
        jiraKey: jiraKey,
        date: formatDate(startTime),
        startTime: formatTime(startTime),
        endTime: formatTime(endTime),
        durationMinutes: durationMinutes,
        description: description,
        taskTitle: task.title,
      };

      // Добавляем в worklogs.json
      const worklogResult = await worklogStorage.addWorklog(worklogData);
      if (worklogResult.success) {
        worklog = worklogResult.worklog;
        console.log('✅ Auto-created worklog:', worklog?.id);
      } else {
        console.error('❌ Failed to auto-create worklog:', worklogResult.error);
      }
    }

    return {
      success: true,
      durationMinutes,
      totalMinutes: task.time_tracking.total_minutes,
      worklog: worklog, // ✅ Возвращаем созданный worklog
    };
  } catch (error) {
    console.error('Error in stop-time-tracking-with-worklog:', error);
    return { success: false, error: String(error) };
  }
});

// Получить путь к tasks.json
ipcMain.handle('get-tasks-path', () => {
  return TASKS_FILE_PATH;
});

// Window controls
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// ============================================================================
// WORKLOG HANDLERS
// ============================================================================

// Получить все worklogs
ipcMain.handle('get-worklogs', async () => {
  return worklogStorage.getWorklogs();
});

// Получить worklogs за дату
ipcMain.handle('get-worklogs-by-date', async (_event, date: string) => {
  return worklogStorage.getWorklogsByDate(date);
});

// Получить worklogs за диапазон дат
ipcMain.handle('get-worklogs-by-range', async (_event, startDate: string, endDate: string) => {
  return worklogStorage.getWorklogsByRange(startDate, endDate);
});

// Получить pending worklogs
ipcMain.handle('get-pending-worklogs', async () => {
  return worklogStorage.getPendingWorklogs();
});

// Добавить worklog
ipcMain.handle('add-worklog', async (_event, worklogData: Parameters<typeof worklogStorage.addWorklog>[0]) => {
  return worklogStorage.addWorklog(worklogData);
});

// Обновить worklog
ipcMain.handle('update-worklog', async (_event, id: string, updates: Record<string, unknown>) => {
  return worklogStorage.updateWorklog(id, updates);
});

// Удалить worklog
ipcMain.handle('delete-worklog', async (_event, id: string) => {
  return worklogStorage.deleteWorklog(id);
});

// Пометить worklog как синхронизированный
ipcMain.handle('mark-worklog-synced', async (_event, id: string, jiraWorklogId: string) => {
  return worklogStorage.markWorklogSynced(id, jiraWorklogId);
});

// Пометить worklog с ошибкой
ipcMain.handle('mark-worklog-error', async (_event, id: string, errorMessage: string) => {
  return worklogStorage.markWorklogError(id, errorMessage);
});

// Получить путь к worklogs.json
ipcMain.handle('get-worklogs-path', () => {
  return worklogStorage.getWorklogsPath();
});

// ============================================================================
// JIRA CONFIG HANDLERS
// ============================================================================

// Получить конфиг Jira
ipcMain.handle('get-jira-config', async () => {
  return jiraConfig.getJiraConfig();
});

// Сохранить конфиг Jira
ipcMain.handle('save-jira-config', async (_event, config: Parameters<typeof jiraConfig.saveJiraConfig>[0]) => {
  return jiraConfig.saveJiraConfig(config);
});

// Проверить подключение к Jira
ipcMain.handle('test-jira-connection', async () => {
  return jiraConfig.testJiraConnection();
});

// Добавить worklog в Jira
ipcMain.handle('add-jira-worklog', async (_event, issueKey: string, started: string, timeSpentSeconds: number, comment: string) => {
  return jiraConfig.addJiraWorklog(issueKey, started, timeSpentSeconds, comment);
});

// Обновить worklog в Jira
ipcMain.handle('update-jira-worklog', async (_event, issueKey: string, worklogId: string, started: string, timeSpentSeconds: number, comment: string) => {
  return jiraConfig.updateJiraWorklog(issueKey, worklogId, started, timeSpentSeconds, comment);
});

// Удалить worklog из Jira
ipcMain.handle('delete-jira-worklog', async (_event, issueKey: string, worklogId: string) => {
  return jiraConfig.deleteJiraWorklog(issueKey, worklogId);
});

// Получить информацию о задаче из Jira
ipcMain.handle('get-jira-issue', async (_event, issueKey: string) => {
  return jiraConfig.getJiraIssue(issueKey);
});

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopFileWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
