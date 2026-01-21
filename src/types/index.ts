// Task Center Types

// Enums synchronized with Python (core/models.py)
export type Priority = 5 | 4 | 3 | 2 | 1; // CRITICAL | HIGH | MEDIUM | LOW | BACKLOG
export type Status = 'новая' | 'в работе' | 'завершена' | 'заблокирована' | 'выполнена';
export type TaskType = 'Анализ/Исследование' | 'Документация' | 'Разработка' | 'Координация' | 'Баг/Проблема' | 'Неизвестно';
export type Complexity = 'низкая' | 'средняя' | 'высокая';
export type Category = 'Общие' | 'РЭМД' | 'КУ ФЭР' | 'Авто';

export interface Task {
  id: string;
  title: string;
  description: string;
  original_text?: string;
  task_type: TaskType;
  complexity: Complexity;
  priority: Priority;
  status: Status;
  category?: Category;
  jira_references: JiraReference[];
  mentions: Mention[];
  dependencies: string[];
  deadline: string | null;
  start_date: string | null;
  context: TaskContext;
  metadata: TaskMetadata;
  ai_classification_confidence: number;
  ai_recommendations: {
    reasoning: string;
    source: string;
  };
  user_notes: string;
  clarifications: Record<string, unknown>;
  time_tracking?: TimeTracking;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  'Общие': 'Общие',
  'РЭМД': 'РЭМД',
  'КУ ФЭР': 'КУ ФЭР',
  'Авто': 'Авто',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  'Общие': '#737373',
  'РЭМД': '#60a5fa',
  'КУ ФЭР': '#fbbf24',
  'Авто': '#4ade80',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  5: 'Критично',      // CRITICAL
  4: 'Высокий',       // HIGH
  3: 'Средний',       // MEDIUM
  2: 'Низкий',        // LOW
  1: 'Бэклог',        // BACKLOG
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  'Анализ/Исследование': 'Анализ',
  'Документация': 'Документация',
  'Разработка': 'Разработка',
  'Координация': 'Координация',
  'Баг/Проблема': 'Баг',
  'Неизвестно': 'Неизвестно',
};

export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  'низкая': 'Низкая',
  'средняя': 'Средняя',
  'высокая': 'Высокая',
};

export const STATUS_LABELS: Record<string, string> = {
  'новая': 'Новая',
  'в работе': 'В работе',
  'завершена': 'Завершена',
  'выполнена': 'Выполнена',
  'заблокирована': 'Заблокирована',
};

export interface JiraReference {
  ticket_id: string;
  url: string;
  project: string;
}

export interface Mention {
  name: string;
  role: string;
  mention_context?: string;
}

export interface TaskContext {
  relevant_docs: string[];
  key_terms: string[];
  related_systems: string[];
  criticality_factors: Record<string, unknown>;
  analysis?: Record<string, unknown>;
}

export interface TaskMetadata {
  created_at: string;
  updated_at: string;
  last_status_change: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string[];
}

export interface TimeTracking {
  sessions: TimeSession[];
  total_minutes: number;
  current_session_start?: string;
}

export interface TimeSession {
  start: string;
  end: string;
  duration_minutes: number;
}

export interface TasksData {
  version: string;
  updated_at: string;
  tasks: Task[];
}

// Filters
export interface TaskFilters {
  status: Status | 'all';
  priority: Priority | 'all';
  category: Category | 'all';
  search: string;
}

// Sorting
export type SortField = 'priority' | 'deadline' | 'created_at' | 'title' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}
