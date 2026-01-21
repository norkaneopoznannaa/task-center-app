import { z } from 'zod';

// Enum validators - synchronized with backend
// Priority uses numeric values: 5=CRITICAL, 4=HIGH, 3=MEDIUM, 2=LOW, 1=BACKLOG
const PrioritySchema = z.number().int().min(1).max(5);

const StatusSchema = z.enum([
  'новая',
  'в работе',
  'завершена',
  'заблокирована',
  'выполнена',
] as const);

const TaskTypeSchema = z.enum([
  'Анализ/Исследование',
  'Документация',
  'Разработка',
  'Координация',
  'Баг/Проблема',
  'Неизвестно',
] as const);

const ComplexitySchema = z.enum([
  'низкая',
  'средняя',
  'высокая',
] as const);

// Utility validators
const JiraKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira key format (e.g., REMD-1234)')
  .min(3)
  .max(20);

const URLSchema = z
  .string()
  .url('Invalid URL format');

const NonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, 'Cannot be empty')
  .max(1000, 'Too long (max 1000 characters)');

const TaskTitleSchema = NonEmptyStringSchema.max(200, 'Title too long (max 200 characters)');
const TaskDescriptionSchema = z
  .string()
  .max(5000, 'Description too long (max 5000 characters)');

const PositiveNumberSchema = z
  .number()
  .min(0, 'Cannot be negative')
  .finite('Must be a valid number');

const ConfidenceScoreSchema = z
  .number()
  .min(0, 'Confidence must be 0-1')
  .max(1, 'Confidence must be 0-1');

// Task-related validators
const JiraReferenceSchema = z.object({
  ticket_id: JiraKeySchema,
  url: z.string().url().optional(),
  project: z.string().optional(),
});

const MentionSchema = z.object({
  name: NonEmptyStringSchema.max(100),
  role: z.string().max(100).optional(),
  mention_context: z.string().max(500).optional(),
});

const TaskContextSchema = z.object({
  relevant_docs: z.array(z.string()).default([]),
  key_terms: z.array(z.string()).default([]),
  related_systems: z.array(z.string()).default([]),
  criticality_factors: z.record(z.string(), z.any()).default({}),
  analysis: z.record(z.string(), z.any()).optional(),
});

const TaskMetadataSchema = z.object({
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  last_status_change: z.string().datetime().nullable().optional(),
  estimated_hours: z.number().min(0).max(16).nullable().optional(),
  actual_hours: z.number().min(0).max(160).nullable().optional(),
  tags: z.array(z.string()).default([]),
});

const TimeSessionSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  duration_minutes: z.number().min(0),
});

const TimeTrackingSchema = z.object({
  sessions: z.array(TimeSessionSchema).default([]),
  total_minutes: z.number().min(0).default(0),
  current_session_start: z.string().datetime().optional(),
});

// Main Task validators
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: TaskTitleSchema,
  description: TaskDescriptionSchema,
  original_text: z.string().optional(),
  task_type: TaskTypeSchema,
  complexity: ComplexitySchema,
  priority: PrioritySchema,
  status: StatusSchema,
  category: z.string().optional(),
  jira_references: z.array(JiraReferenceSchema).default([]),
  mentions: z.array(MentionSchema).default([]),
  dependencies: z.array(z.string()).default([]),
  deadline: z.string().datetime().nullable().optional(),
  start_date: z.string().datetime().nullable().optional(),
  context: TaskContextSchema.optional(),
  metadata: TaskMetadataSchema.optional(),
  ai_classification_confidence: ConfidenceScoreSchema.optional(),
  ai_recommendations: z.object({
    reasoning: z.string().optional(),
    source: z.string().optional(),
  }).optional(),
  user_notes: z.string().default(''),
  clarifications: z.record(z.string(), z.any()).default({}),
  time_tracking: TimeTrackingSchema.optional(),
});

// Task update (partial) validator
export const TaskUpdateSchema = TaskSchema.partial().omit({
  id: true,
  metadata: true,
  time_tracking: true,
});

// IPC Handler input validators
export const UpdateTaskParamsSchema = z.object({
  taskId: z.string().min(1, 'Task ID required'),
  updates: TaskUpdateSchema,
});

export const StartTimerParamsSchema = z.object({
  taskId: z.string().min(1, 'Task ID required'),
});

export const StopTimerParamsSchema = z.object({
  taskId: z.string().min(1, 'Task ID required'),
});

// Worklog validators
export const WorklogEditSchema = z.object({
  taskId: z.string().min(1),
  jiraKey: JiraKeySchema,
  date: z.string().datetime('Invalid date format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  duration: z.number().min(15, 'Minimum 15 minutes').max(480, 'Maximum 8 hours'),
  description: z.string().min(1, 'Description required').max(500),
});

// Jira config validators (matches jiraConfig module interface)
export const JiraConfigSchema = z.object({
  baseUrl: URLSchema,
  email: z.string().min(1, 'Username required').max(255, 'Username too long'),
  apiToken: z.string().min(1, 'Password/token required').max(1000, 'Password/token too long'),
});

// Response validators
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;
export type UpdateTaskParams = z.infer<typeof UpdateTaskParamsSchema>;
export type WorklogEdit = z.infer<typeof WorklogEditSchema>;
export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
