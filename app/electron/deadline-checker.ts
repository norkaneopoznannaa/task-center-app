/**
 * Deadline Checker - Проверка приближающихся дедлайнов и отправка уведомлений
 */

import { Notification, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Интерфейс задачи (минимальный набор полей)
interface TaskWithDeadline {
  id: string;
  title: string;
  deadline: string | null;
  status: string;
  priority: string;
}

interface TasksData {
  tasks: TaskWithDeadline[];
}

// Путь к tasks.json
const TASKS_FILE_PATH = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  'tasks.json'
);

// Хранилище уже показанных уведомлений (чтобы не спамить)
const notifiedTasks = new Set<string>();

// Интервал проверки (1 час в миллисекундах)
const CHECK_INTERVAL = 60 * 60 * 1000;

// За сколько дней до дедлайна уведомлять
const NOTIFY_DAYS_BEFORE = 1;

let checkInterval: NodeJS.Timeout | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * Инициализация системы проверки дедлайнов
 */
export function initDeadlineChecker(window: BrowserWindow): void {
  mainWindow = window;

  // Проверка при запуске (с небольшой задержкой, чтобы окно успело загрузиться)
  setTimeout(() => {
    checkDeadlines();
  }, 5000);

  // Периодическая проверка каждый час
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  checkInterval = setInterval(checkDeadlines, CHECK_INTERVAL);

  console.log('Deadline checker initialized');
}

/**
 * Остановка проверки дедлайнов
 */
export function stopDeadlineChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  console.log('Deadline checker stopped');
}

/**
 * Получить задачи с приближающимися дедлайнами
 */
export function getUpcomingDeadlines(): { success: boolean; tasks?: TaskWithDeadline[]; error?: string } {
  try {
    if (!fs.existsSync(TASKS_FILE_PATH)) {
      return { success: false, error: 'tasks.json not found' };
    }

    const content = fs.readFileSync(TASKS_FILE_PATH, 'utf-8');
    const data: TasksData = JSON.parse(content);

    const now = new Date();
    const upcomingTasks: TaskWithDeadline[] = [];

    data.tasks.forEach(task => {
      if (!task.deadline) return;

      // Пропускаем завершённые задачи
      if (task.status === 'завершена' || task.status === 'выполнена') return;

      const deadline = new Date(task.deadline);
      const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Задачи с дедлайном в ближайшие N дней или просроченные
      if (daysUntilDeadline <= NOTIFY_DAYS_BEFORE) {
        upcomingTasks.push({
          ...task,
          // Добавляем информацию о днях до дедлайна для сортировки
        });
      }
    });

    // Сортируем по дедлайну (ближайшие сначала)
    upcomingTasks.sort((a, b) => {
      const dateA = new Date(a.deadline!).getTime();
      const dateB = new Date(b.deadline!).getTime();
      return dateA - dateB;
    });

    return { success: true, tasks: upcomingTasks };
  } catch (error) {
    console.error('Error getting upcoming deadlines:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Проверить дедлайны и отправить уведомления
 */
export function checkDeadlines(): void {
  try {
    if (!fs.existsSync(TASKS_FILE_PATH)) {
      console.log('Deadline check: tasks.json not found');
      return;
    }

    const content = fs.readFileSync(TASKS_FILE_PATH, 'utf-8');
    const data: TasksData = JSON.parse(content);

    const now = new Date();
    const tasksToNotify: { task: TaskWithDeadline; daysLeft: number; isOverdue: boolean }[] = [];

    data.tasks.forEach(task => {
      if (!task.deadline) return;

      // Пропускаем завершённые задачи
      if (task.status === 'завершена' || task.status === 'выполнена') return;

      const deadline = new Date(task.deadline);
      const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntilDeadline < 0;

      // Уведомляем о задачах с дедлайном через 1 день или просроченных
      if (daysUntilDeadline <= NOTIFY_DAYS_BEFORE) {
        // Формируем уникальный ключ для уведомления (задача + дата)
        const notificationKey = `${task.id}-${deadline.toDateString()}`;

        // Проверяем, не уведомляли ли мы уже об этой задаче сегодня
        const todayKey = `${task.id}-${now.toDateString()}`;
        if (!notifiedTasks.has(todayKey)) {
          tasksToNotify.push({
            task,
            daysLeft: daysUntilDeadline,
            isOverdue
          });
        }
      }
    });

    // Отправляем уведомления
    tasksToNotify.forEach(({ task, daysLeft, isOverdue }) => {
      showDeadlineNotification(task, daysLeft, isOverdue);

      // Запоминаем, что уведомили
      const todayKey = `${task.id}-${now.toDateString()}`;
      notifiedTasks.add(todayKey);
    });

    // Очищаем старые записи (старше 7 дней)
    const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    notifiedTasks.forEach(key => {
      const dateStr = key.split('-').slice(-3).join('-'); // Извлекаем дату из ключа
      try {
        const keyDate = new Date(dateStr);
        if (keyDate < cutoffDate) {
          notifiedTasks.delete(key);
        }
      } catch {
        // Игнорируем невалидные ключи
      }
    });

    console.log(`Deadline check: found ${tasksToNotify.length} tasks to notify`);
  } catch (error) {
    console.error('Error checking deadlines:', error);
  }
}

/**
 * Показать уведомление о дедлайне
 */
function showDeadlineNotification(task: TaskWithDeadline, daysLeft: number, isOverdue: boolean): void {
  // Проверяем поддержку уведомлений
  if (!Notification.isSupported()) {
    console.log('Notifications not supported');
    return;
  }

  let title: string;
  let body: string;
  let urgency: 'low' | 'normal' | 'critical' = 'normal';

  if (isOverdue) {
    const daysOverdue = Math.abs(daysLeft);
    title = '⚠️ Просроченный дедлайн!';
    body = `${task.title}\nПросрочено на ${daysOverdue} ${getDaysWord(daysOverdue)}`;
    urgency = 'critical';
  } else if (daysLeft === 0) {
    title = '🔥 Дедлайн сегодня!';
    body = task.title;
    urgency = 'critical';
  } else if (daysLeft === 1) {
    title = '⏰ Дедлайн завтра';
    body = task.title;
    urgency = 'normal';
  } else {
    title = `📅 Дедлайн через ${daysLeft} ${getDaysWord(daysLeft)}`;
    body = task.title;
    urgency = 'low';
  }

  // Добавляем приоритет к телу уведомления
  const priorityLabel = getPriorityLabel(task.priority);
  if (priorityLabel) {
    body += `\nПриоритет: ${priorityLabel}`;
  }

  const notification = new Notification({
    title,
    body,
    urgency,
    silent: false,
  });

  // Клик по уведомлению - открываем окно и показываем задачу
  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      // Отправляем событие в renderer для выделения задачи
      mainWindow.webContents.send('focus-task', task.id);
    }
  });

  notification.show();
}

/**
 * Склонение слова "день"
 */
function getDaysWord(days: number): string {
  const abs = Math.abs(days);
  if (abs % 10 === 1 && abs % 100 !== 11) {
    return 'день';
  } else if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) {
    return 'дня';
  } else {
    return 'дней';
  }
}

/**
 * Получить читаемую метку приоритета
 */
function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    'CRITICAL': '🔴 Критический',
    'HIGH': '🟠 Высокий',
    'MEDIUM': '🟡 Средний',
    'LOW': '🟢 Низкий',
    'BACKLOG': '⚪ Бэклог',
  };
  return labels[priority] || '';
}

/**
 * Принудительная проверка дедлайнов (для вызова из UI)
 */
export function forceCheckDeadlines(): { notified: number } {
  // Очищаем историю уведомлений за сегодня для повторной проверки
  const now = new Date();
  const todayStr = now.toDateString();

  notifiedTasks.forEach(key => {
    if (key.includes(todayStr)) {
      notifiedTasks.delete(key);
    }
  });

  const beforeCount = notifiedTasks.size;
  checkDeadlines();
  const afterCount = notifiedTasks.size;

  return { notified: afterCount - beforeCount };
}
