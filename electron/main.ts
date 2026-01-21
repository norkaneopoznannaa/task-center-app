/**
 * Main Electron process entry point (Orchestrator)
 *
 * This file has been refactored into modular components:
 * - constants.ts: Shared configuration
 * - cache.ts: In-memory cache management
 * - windowManager.ts: BrowserWindow lifecycle
 * - fileWatcher.ts: File system monitoring
 * - appLifecycle.ts: IPC handlers and app events
 */

import { createWindow, registerWindowHandlers } from './windowManager';
import { registerIpcHandlers, registerAppLifecycleEvents } from './appLifecycle';

// Initialize all systems
function initializeApp() {
  // Register window control handlers
  registerWindowHandlers();

  // Register all IPC handlers for task management, worklogs, and Jira
  registerIpcHandlers();

  // Register app lifecycle events
  registerAppLifecycleEvents();

  console.log('✅ Electron main process initialized successfully');
}

// Start the app
initializeApp();
