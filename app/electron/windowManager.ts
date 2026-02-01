import { BrowserWindow, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import { DEV_SERVER_PORT, WINDOW_CONFIG } from './constants';
import { startFileWatcher, stopFileWatcher } from './fileWatcher';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createWindow() {
  // Путь к иконке (PNG для лучшей поддержки в Windows)
  const iconPath = path.join(__dirname, '../public/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.width,
    height: WINDOW_CONFIG.height,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    frame: false, // Кастомный заголовок
    titleBarStyle: 'hidden',
    icon: icon, // Иконка приложения
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
    mainWindow.loadURL(`http://localhost:${DEV_SERVER_PORT}`);
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
  startFileWatcher(mainWindow);
}

/**
 * Register IPC handlers for window controls
 */
export function registerWindowHandlers() {
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
}
