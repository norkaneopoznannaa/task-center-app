import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // Tasks operations
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  updateTask: (taskId: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('update-task', taskId, updates),
  getTasksPath: () => ipcRenderer.invoke('get-tasks-path'),
  createTask: (taskData: Record<string, unknown>) =>
    ipcRenderer.invoke('create-task', taskData),
  deleteTask: (taskId: string) => ipcRenderer.invoke('delete-task', taskId),
  duplicateTask: (taskId: string) => ipcRenderer.invoke('duplicate-task', taskId),
  bulkUpdateTasks: (taskIds: string[], updates: Record<string, unknown>) =>
    ipcRenderer.invoke('bulk-update-tasks', taskIds, updates),

  // Time tracking
  startTimeTracking: (taskId: string) => ipcRenderer.invoke('start-time-tracking', taskId),
  stopTimeTracking: (taskId: string) => ipcRenderer.invoke('stop-time-tracking', taskId),
  stopTimeTrackingWithWorklog: (taskId: string, options?: {
    autoCreateWorklog?: boolean;
    suggestDescription?: boolean;
  }) => ipcRenderer.invoke('stop-time-tracking-with-worklog', taskId, options),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // File change listener (auto-refresh)
  onTasksFileChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('tasks-file-changed', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('tasks-file-changed', handler);
    };
  },

  // Worklog operations
  getWorklogs: () => ipcRenderer.invoke('get-worklogs'),
  getWorklogsByDate: (date: string) => ipcRenderer.invoke('get-worklogs-by-date', date),
  getWorklogsByRange: (startDate: string, endDate: string) => ipcRenderer.invoke('get-worklogs-by-range', startDate, endDate),
  getPendingWorklogs: () => ipcRenderer.invoke('get-pending-worklogs'),
  addWorklog: (worklogData: WorklogInput) => ipcRenderer.invoke('add-worklog', worklogData),
  updateWorklog: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('update-worklog', id, updates),
  deleteWorklog: (id: string) => ipcRenderer.invoke('delete-worklog', id),
  markWorklogSynced: (id: string, jiraWorklogId: string) =>
    ipcRenderer.invoke('mark-worklog-synced', id, jiraWorklogId),
  markWorklogError: (id: string, errorMessage: string) =>
    ipcRenderer.invoke('mark-worklog-error', id, errorMessage),
  getWorklogsPath: () => ipcRenderer.invoke('get-worklogs-path'),
  resetWorklogErrors: () => ipcRenderer.invoke('reset-worklog-errors'),

  // Jira config operations
  getJiraConfig: () => ipcRenderer.invoke('get-jira-config'),
  saveJiraConfig: (config: JiraConfigInput) => ipcRenderer.invoke('save-jira-config', config),
  testJiraConnection: () => ipcRenderer.invoke('test-jira-connection'),
  addJiraWorklog: (issueKey: string, started: string, timeSpentSeconds: number, comment: string) =>
    ipcRenderer.invoke('add-jira-worklog', issueKey, started, timeSpentSeconds, comment),
  updateJiraWorklog: (issueKey: string, worklogId: string, started: string, timeSpentSeconds: number, comment: string) =>
    ipcRenderer.invoke('update-jira-worklog', issueKey, worklogId, started, timeSpentSeconds, comment),
  deleteJiraWorklog: (issueKey: string, worklogId: string) =>
    ipcRenderer.invoke('delete-jira-worklog', issueKey, worklogId),
  getJiraIssue: (issueKey: string) =>
    ipcRenderer.invoke('get-jira-issue', issueKey),
});

// Input types for API calls
interface WorklogInput {
  taskId: string;
  jiraKey: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  taskTitle: string;
}

interface JiraConfigInput {
  baseUrl: string;
  email: string;
  apiToken: string;
}

interface LocalWorklog extends WorklogInput {
  id: string;
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

interface JiraConfig extends JiraConfigInput {
  isConfigured: boolean;
}

// Type declarations for window.api
declare global {
  interface Window {
    api: {
      getTasks: () => Promise<{
        success: boolean;
        data?: TasksData;
        error?: string;
      }>;
      updateTask: (
        taskId: string,
        updates: Record<string, unknown>
      ) => Promise<{ success: boolean; error?: string }>;
      getTasksPath: () => Promise<string>;
      createTask: (taskData: Record<string, unknown>) => Promise<{
        success: boolean;
        task?: Task;
        error?: string;
      }>;
      deleteTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
      duplicateTask: (taskId: string) => Promise<{
        success: boolean;
        task?: Task;
        error?: string;
      }>;
      bulkUpdateTasks: (taskIds: string[], updates: Record<string, unknown>) => Promise<{
        success: boolean;
        updatedCount?: number;
        error?: string;
      }>;
      startTimeTracking: (taskId: string) => Promise<{
        success: boolean;
        startTime?: string;
        error?: string;
      }>;
      stopTimeTracking: (taskId: string) => Promise<{
        success: boolean;
        durationMinutes?: number;
        totalMinutes?: number;
        error?: string;
      }>;
      stopTimeTrackingWithWorklog: (taskId: string, options?: {
        autoCreateWorklog?: boolean;
        suggestDescription?: boolean;
      }) => Promise<{
        success: boolean;
        durationMinutes?: number;
        totalMinutes?: number;
        worklog?: LocalWorklog;
        error?: string;
      }>;
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      onTasksFileChanged: (callback: () => void) => () => void;

      // Worklog operations
      getWorklogs: () => Promise<{ success: boolean; data?: WorklogsData; error?: string }>;
      getWorklogsByDate: (date: string) => Promise<{ success: boolean; worklogs?: LocalWorklog[]; error?: string }>;
      getWorklogsByRange: (startDate: string, endDate: string) => Promise<{ success: boolean; worklogs?: LocalWorklog[]; error?: string }>;
      getPendingWorklogs: () => Promise<{ success: boolean; worklogs?: LocalWorklog[]; error?: string }>;
      addWorklog: (worklogData: WorklogInput) => Promise<{ success: boolean; worklog?: LocalWorklog; error?: string }>;
      updateWorklog: (id: string, updates: Record<string, unknown>) => Promise<{ success: boolean; worklog?: LocalWorklog; error?: string }>;
      deleteWorklog: (id: string) => Promise<{ success: boolean; error?: string }>;
      markWorklogSynced: (id: string, jiraWorklogId: string) => Promise<{ success: boolean; error?: string }>;
      markWorklogError: (id: string, errorMessage: string) => Promise<{ success: boolean; error?: string }>;
      getWorklogsPath: () => Promise<string>;
      resetWorklogErrors: () => Promise<{ success: boolean; resetCount: number; error?: string }>;

      // Jira config operations
      getJiraConfig: () => Promise<{ success: boolean; config?: JiraConfig; error?: string }>;
      saveJiraConfig: (config: JiraConfigInput) => Promise<{ success: boolean; error?: string }>;
      testJiraConnection: () => Promise<{ success: boolean; user?: string; error?: string }>;
      addJiraWorklog: (issueKey: string, started: string, timeSpentSeconds: number, comment: string) => Promise<{ success: boolean; worklogId?: string; error?: string }>;
      updateJiraWorklog: (issueKey: string, worklogId: string, started: string, timeSpentSeconds: number, comment: string) => Promise<{ success: boolean; error?: string }>;
      deleteJiraWorklog: (issueKey: string, worklogId: string) => Promise<{ success: boolean; error?: string }>;
      getJiraIssue: (issueKey: string) => Promise<{ success: boolean; issue?: JiraIssue; error?: string }>;
    };
  }
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
      name: string;
    };
  };
}

interface TasksData {
  version: string;
  updated_at: string;
  tasks: Task[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: string;
  complexity: string;
  priority: string;
  status: string;
  jira_references: JiraReference[];
  mentions: Mention[];
  deadline: string | null;
  metadata: TaskMetadata;
  time_tracking?: TimeTracking;
}

interface JiraReference {
  ticket_id: string;
  url: string;
  project: string;
}

interface Mention {
  name: string;
  role: string;
}

interface TaskMetadata {
  created_at: string;
  updated_at: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string[];
}

interface TimeTracking {
  sessions: TimeSession[];
  total_minutes: number;
  current_session_start?: string;
}

interface TimeSession {
  start: string;
  end: string;
  duration_minutes: number;
}

export {};
