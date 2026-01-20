import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Типы для worklogs
interface LocalWorklog {
  id: string;
  taskId: string;
  jiraKey: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  taskTitle: string;
  status: 'pending' | 'synced' | 'error';
  syncedAt: string | null;
  jiraWorklogId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorklogsData {
  version: string;
  worklogs: LocalWorklog[];
}

// Путь к worklogs.json
const WORKLOGS_FILE_PATH = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  'worklogs.json'
);

// Инициализация файла если не существует
function ensureWorklogsFile(): void {
  if (!fs.existsSync(WORKLOGS_FILE_PATH)) {
    const initialData: WorklogsData = {
      version: '1.0',
      worklogs: []
    };
    fs.writeFileSync(WORKLOGS_FILE_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

// Чтение всех worklogs
export function getWorklogs(): { success: boolean; data?: WorklogsData; error?: string } {
  try {
    ensureWorklogsFile();
    const content = fs.readFileSync(WORKLOGS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content) as WorklogsData;
    return { success: true, data };
  } catch (error) {
    console.error('Error reading worklogs:', error);
    return { success: false, error: String(error) };
  }
}

// Получить worklogs за конкретную дату
export function getWorklogsByDate(date: string): { success: boolean; worklogs?: LocalWorklog[]; error?: string } {
  try {
    const result = getWorklogs();
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    const worklogs = result.data.worklogs.filter(w => w.date === date);
    return { success: true, worklogs };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Получить pending worklogs (не синхронизированные)
export function getPendingWorklogs(): { success: boolean; worklogs?: LocalWorklog[]; error?: string } {
  try {
    const result = getWorklogs();
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    const worklogs = result.data.worklogs.filter(w => w.status === 'pending');
    return { success: true, worklogs };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Добавить новый worklog
export function addWorklog(worklogData: Omit<LocalWorklog, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'syncedAt' | 'jiraWorklogId' | 'errorMessage'>): { success: boolean; worklog?: LocalWorklog; error?: string } {
  try {
    ensureWorklogsFile();
    const content = fs.readFileSync(WORKLOGS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content) as WorklogsData;

    const now = new Date().toISOString();
    const newWorklog: LocalWorklog = {
      ...worklogData,
      id: crypto.randomUUID(),
      status: 'pending',
      syncedAt: null,
      jiraWorklogId: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now
    };

    data.worklogs.push(newWorklog);
    fs.writeFileSync(WORKLOGS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

    return { success: true, worklog: newWorklog };
  } catch (error) {
    console.error('Error adding worklog:', error);
    return { success: false, error: String(error) };
  }
}

// Обновить worklog
export function updateWorklog(id: string, updates: Partial<LocalWorklog>): { success: boolean; worklog?: LocalWorklog; error?: string } {
  try {
    ensureWorklogsFile();
    const content = fs.readFileSync(WORKLOGS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content) as WorklogsData;

    const index = data.worklogs.findIndex(w => w.id === id);
    if (index === -1) {
      return { success: false, error: 'Worklog not found' };
    }

    data.worklogs[index] = {
      ...data.worklogs[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(WORKLOGS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, worklog: data.worklogs[index] };
  } catch (error) {
    console.error('Error updating worklog:', error);
    return { success: false, error: String(error) };
  }
}

// Удалить worklog
export function deleteWorklog(id: string): { success: boolean; error?: string } {
  try {
    ensureWorklogsFile();
    const content = fs.readFileSync(WORKLOGS_FILE_PATH, 'utf-8');
    const data = JSON.parse(content) as WorklogsData;

    const index = data.worklogs.findIndex(w => w.id === id);
    if (index === -1) {
      return { success: false, error: 'Worklog not found' };
    }

    data.worklogs.splice(index, 1);
    fs.writeFileSync(WORKLOGS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

    return { success: true };
  } catch (error) {
    console.error('Error deleting worklog:', error);
    return { success: false, error: String(error) };
  }
}

// Пометить worklog как синхронизированный
export function markWorklogSynced(id: string, jiraWorklogId: string): { success: boolean; error?: string } {
  return updateWorklog(id, {
    status: 'synced',
    syncedAt: new Date().toISOString(),
    jiraWorklogId,
    errorMessage: null
  });
}

// Пометить worklog с ошибкой
export function markWorklogError(id: string, errorMessage: string): { success: boolean; error?: string } {
  return updateWorklog(id, {
    status: 'error',
    errorMessage
  });
}

// Получить путь к файлу
export function getWorklogsPath(): string {
  return WORKLOGS_FILE_PATH;
}
