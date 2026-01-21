import * as path from 'path';

/**
 * Shared constants for electron main process
 */

// Путь к tasks.json
export const TASKS_FILE_PATH = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  'tasks.json'
);

// Cache TTL в миллисекундах
export const CACHE_TTL = 5000; // 5 секунд

// File watcher configuration
export const FILE_WATCHER_CONFIG = {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
  usePolling: true,      // Более надёжно на Windows
  interval: 500,         // Интервал polling
} as const;

// Window dimensions
export const WINDOW_CONFIG = {
  width: 1400,
  height: 900,
  minWidth: 800,
  minHeight: 600,
} as const;

// Dev server port
export const DEV_SERVER_PORT = 5176;
