import { app, ipcMain } from 'electron';
import * as fsPromises from 'fs/promises';
import { z } from 'zod';
import * as worklogStorage from './worklog-storage';
import * as jiraConfig from './jira-config';
import {
  UpdateTaskParamsSchema,
  StartTimerParamsSchema,
  StopTimerParamsSchema,
  JiraConfigSchema,
} from './validators';
import { TASKS_FILE_PATH, CACHE_TTL } from './constants';
import { TasksCache } from './cache';
import { getMainWindow } from './windowManager';
import { stopFileWatcher } from './fileWatcher';

const tasksCache = new TasksCache(CACHE_TTL);

/**
 * Validation helper function
 */
function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { valid: true; data: T } | { valid: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { valid: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return { valid: false, error: messages };
    }
    return { valid: false, error: String(error) };
  }
}

/**
 * Helper functions for worklog
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Register all IPC handlers for app functionality
 */
export function registerIpcHandlers() {
  // ============================================================================
  // TASK HANDLERS
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

  // Обновить задачу (async + cache invalidation + validation)
  ipcMain.handle('update-task', async (_event, taskId: string, updates: Record<string, unknown>) => {
    try {
      // Validate input parameters
      const validation = validateInput(UpdateTaskParamsSchema, { taskId, updates });
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      const { taskId: validTaskId, updates: validUpdates } = validation.data;

      // Async проверка существования файла
      try {
        await fsPromises.access(TASKS_FILE_PATH);
      } catch {
        return { success: false, error: 'tasks.json not found' };
      }

      // Async чтение
      const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);

      const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === validTaskId);
      if (taskIndex === -1) {
        return { success: false, error: 'Task not found' };
      }

      // Обновляем задачу
      data.tasks[taskIndex] = {
        ...data.tasks[taskIndex],
        ...validUpdates,
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

  // Начать отслеживание времени (async + cache invalidation + validation)
  ipcMain.handle('start-time-tracking', async (_event, taskId: string) => {
    try {
      // Validate input parameters
      const validation = validateInput(StartTimerParamsSchema, { taskId });
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      const { taskId: validTaskId } = validation.data;

      const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);

      const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === validTaskId);
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

  // Остановить отслеживание времени (async + cache invalidation + validation)
  ipcMain.handle('stop-time-tracking', async (_event, taskId: string) => {
    try {
      // Validate input parameters
      const validation = validateInput(StopTimerParamsSchema, { taskId });
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      const { taskId: validTaskId } = validation.data;

      const content = await fsPromises.readFile(TASKS_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);

      const taskIndex = data.tasks.findIndex((t: { id: string }) => t.id === validTaskId);
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

  // Получить путь к tasks.json
  ipcMain.handle('get-tasks-path', () => {
    return TASKS_FILE_PATH;
  });

  // ============================================================================
  // WORKLOG WITH AUTO-CREATION
  // ============================================================================

  // Остановить отслеживание времени с автоматическим созданием worklog
  ipcMain.handle('stop-time-tracking-with-worklog', async (
    _event,
    taskId: string,
    options?: {
      autoCreateWorklog?: boolean;
      suggestDescription?: boolean;
    }
  ) => {
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
        const durationHours = Math.round((durationMinutes / 60) * 10) / 10;
        const description = options?.suggestDescription && jiraKey ? `Работа над задачей ${task.title} (${durationHours}ч)` : '';

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
        worklog: worklog,
      };
    } catch (error) {
      console.error('Error in stop-time-tracking-with-worklog:', error);
      return { success: false, error: String(error) };
    }
  });

  // ============================================================================
  // WORKLOG HANDLERS
  // ============================================================================

  ipcMain.handle('get-worklogs', async () => {
    return worklogStorage.getWorklogs();
  });

  ipcMain.handle('get-worklogs-by-date', async (_event, date: string) => {
    return worklogStorage.getWorklogsByDate(date);
  });

  ipcMain.handle('get-worklogs-by-range', async (_event, startDate: string, endDate: string) => {
    return worklogStorage.getWorklogsByRange(startDate, endDate);
  });

  ipcMain.handle('get-pending-worklogs', async () => {
    return worklogStorage.getPendingWorklogs();
  });

  ipcMain.handle('add-worklog', async (_event, worklogData: Parameters<typeof worklogStorage.addWorklog>[0]) => {
    return worklogStorage.addWorklog(worklogData);
  });

  ipcMain.handle('update-worklog', async (_event, id: string, updates: Record<string, unknown>) => {
    return worklogStorage.updateWorklog(id, updates);
  });

  ipcMain.handle('delete-worklog', async (_event, id: string) => {
    return worklogStorage.deleteWorklog(id);
  });

  ipcMain.handle('mark-worklog-synced', async (_event, id: string, jiraWorklogId: string) => {
    return worklogStorage.markWorklogSynced(id, jiraWorklogId);
  });

  ipcMain.handle('mark-worklog-error', async (_event, id: string, errorMessage: string) => {
    return worklogStorage.markWorklogError(id, errorMessage);
  });

  ipcMain.handle('get-worklogs-path', () => {
    return worklogStorage.getWorklogsPath();
  });

  // ============================================================================
  // JIRA CONFIG HANDLERS
  // ============================================================================

  ipcMain.handle('get-jira-config', async () => {
    return jiraConfig.getJiraConfig();
  });

  ipcMain.handle('save-jira-config', async (_event, config: Parameters<typeof jiraConfig.saveJiraConfig>[0]) => {
    try {
      // Validate Jira config format
      const validation = validateInput(JiraConfigSchema, config);
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      return jiraConfig.saveJiraConfig(validation.data);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('test-jira-connection', async () => {
    return jiraConfig.testJiraConnection();
  });

  ipcMain.handle('add-jira-worklog', async (_event, issueKey: string, started: string, timeSpentSeconds: number, comment: string) => {
    try {
      // Validate parameters
      const params = { issueKey, started, timeSpentSeconds, comment };
      const schema = z.object({
        issueKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira key format'),
        started: z.string().datetime('Invalid datetime format'),
        timeSpentSeconds: z.number().min(0, 'Time must be non-negative'),
        comment: z.string().min(1, 'Comment required').max(1000, 'Comment too long'),
      });

      const validation = validateInput(schema, params);
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      const { issueKey: validKey, started: validStarted, timeSpentSeconds: validTime, comment: validComment } = validation.data;
      return jiraConfig.addJiraWorklog(validKey, validStarted, validTime, validComment);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-jira-worklog', async (
    _event,
    issueKey: string,
    worklogId: string,
    started: string,
    timeSpentSeconds: number,
    comment: string
  ) => {
    try {
      // Validate parameters
      const params = { issueKey, worklogId, started, timeSpentSeconds, comment };
      const schema = z.object({
        issueKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira key format'),
        worklogId: z.string().min(1, 'Worklog ID required'),
        started: z.string().datetime('Invalid datetime format'),
        timeSpentSeconds: z.number().min(0, 'Time must be non-negative'),
        comment: z.string().min(1, 'Comment required').max(1000, 'Comment too long'),
      });

      const validation = validateInput(schema, params);
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      const { issueKey: validKey, worklogId: validId, started: validStarted, timeSpentSeconds: validTime, comment: validComment } = validation.data;
      return jiraConfig.updateJiraWorklog(validKey, validId, validStarted, validTime, validComment);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('delete-jira-worklog', async (_event, issueKey: string, worklogId: string) => {
    try {
      // Validate parameters
      const params = { issueKey, worklogId };
      const schema = z.object({
        issueKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira key format'),
        worklogId: z.string().min(1, 'Worklog ID required'),
      });

      const validation = validateInput(schema, params);
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      const { issueKey: validKey, worklogId: validId } = validation.data;
      return jiraConfig.deleteJiraWorklog(validKey, validId);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-jira-issue', async (_event, issueKey: string) => {
    try {
      // Validate Jira issue key format
      const schema = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira key format');
      const validation = validateInput(schema, issueKey);
      if (!validation.valid) {
        return { success: false, error: `Validation error: ${validation.error}` };
      }

      return jiraConfig.getJiraIssue(validation.data);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

/**
 * Register app lifecycle events
 */
export function registerAppLifecycleEvents() {
  app.whenReady().then(() => {
    const { createWindow } = require('./windowManager');
    createWindow();
  });

  app.on('window-all-closed', () => {
    stopFileWatcher();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    const { BrowserWindow } = require('electron');
    if (BrowserWindow.getAllWindows().length === 0) {
      const { createWindow } = require('./windowManager');
      createWindow();
    }
  });
}
