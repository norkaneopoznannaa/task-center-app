// Типы для локальных worklogs

export interface LocalWorklog {
  id: string;                    // UUID
  taskId: string;                // ID задачи в Task Center
  jiraKey: string | null;        // EGISZREMD-15263 (может быть null)

  // Время
  date: string;                  // "2026-01-20"
  startTime: string;             // "09:00"
  endTime: string;               // "10:30"
  durationMinutes: number;       // 90

  // Описание
  description: string;           // Что делал
  taskTitle: string;             // Название задачи (для отображения)

  // Статус синхронизации
  status: 'pending' | 'synced' | 'error';
  syncedAt: string | null;       // Когда отправлено в Jira
  jiraWorklogId: string | null;  // ID worklog в Jira после синхронизации
  errorMessage: string | null;   // Ошибка при синхронизации

  // Метаданные
  createdAt: string;
  updatedAt: string;
}

export interface WorklogsData {
  version: string;
  worklogs: LocalWorklog[];
}

// Типы для Jira API
export interface JiraConfig {
  baseUrl: string;           // https://jira.i-novus.ru
  email: string;             // user@example.com
  apiToken: string;          // API токен или пароль
  isConfigured: boolean;
}

export interface JiraWorklogRequest {
  started: string;           // ISO datetime с timezone: "2026-01-20T09:00:00.000+0300"
  timeSpentSeconds: number;
  comment: string;
}

export interface JiraWorklogResponse {
  id: string;
  issueId: string;
  author: {
    name: string;
    displayName: string;
  };
  created: string;
  updated: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
  comment?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    };
  };
}

// Типы для UI
export interface WorklogFormData {
  taskId: string;
  jiraKey: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
}

export interface WorklogDaySummary {
  date: string;
  worklogs: LocalWorklog[];
  totalMinutes: number;
  pendingCount: number;
  syncedCount: number;
  errorCount: number;
}
