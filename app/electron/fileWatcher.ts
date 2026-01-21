import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { BrowserWindow } from 'electron';
import { TASKS_FILE_PATH, FILE_WATCHER_CONFIG } from './constants';

let fileWatcher: chokidar.FSWatcher | null = null;

export function startFileWatcher(mainWindow: BrowserWindow | null) {
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
  fileWatcher = chokidar.watch(TASKS_FILE_PATH, FILE_WATCHER_CONFIG);

  fileWatcher.on('change', (filePath) => {
    console.log('tasks.json changed (chokidar):', filePath);
    mainWindow?.webContents.send('tasks-file-changed');
  });

  fileWatcher.on('error', (error) => {
    console.error('File watcher error:', error);
  });
}

export function stopFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}
