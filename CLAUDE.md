# Task Center - Полный контекст для Claude

> Этот файл читается автоматически при старте сессии Claude Code.
> Содержит исчерпывающую информацию о проекте для быстрого понимания контекста.

---

## 1. НАЗНАЧЕНИЕ ПРОЕКТА

**Task Center** — персональная система управления задачами для Виктора (системный аналитик проекта РЭМД/ЕГИСЗ).

### Что делает Claude в этом проекте:
- Управляет задачами (CRUD операции через `data/tasks.json`)
- Отслеживает время работы (time tracking с сессиями)
- Планирует рабочий день (приоритизация, рекомендации)
- Синхронизирует worklogs с Jira
- Развивает само приложение (Electron + React)

---

## 2. СТРУКТУРА ПРОЕКТА

```
Task_Center/                          # Корень проекта
├── CLAUDE.md                         # ← Этот файл (контекст для Claude)
├── .claude/
│   └── commands/                     # Slash-команды
│       ├── tasks.md                  # /tasks
│       ├── plan.md                   # /plan
│       ├── add-task.md               # /add-task
│       ├── sync-jira.md              # /sync-jira
│       ├── worklog.md                # /worklog
│       └── report.md                 # /report
│
├── data/                             # Данные (JSON)
│   ├── tasks.json                    # Основные задачи (~18 записей)
│   ├── worklogs.json                 # Локальные worklogs
│   └── jira-config.json              # Конфигурация Jira (сессия)
│
├── app/                              # Electron приложение (v1.3.0)
│   ├── package.json                  # npm dependencies
│   ├── vite.config.ts                # Vite bundler
│   ├── tsconfig.json                 # TypeScript config
│   │
│   ├── src/                          # React frontend
│   │   ├── App.tsx                   # Главный компонент
│   │   ├── types/index.ts            # TypeScript типы
│   │   ├── components/               # UI компоненты (12 файлов)
│   │   └── pages/                    # Страницы (3 файла)
│   │
│   ├── electron/                     # Electron backend
│   │   ├── main.ts                   # Точка входа (orchestrator)
│   │   ├── preload.ts                # IPC bridge (window.api)
│   │   ├── windowManager.ts          # Управление окнами
│   │   ├── appLifecycle.ts           # Жизненный цикл приложения
│   │   ├── jira-config.ts            # Jira API (session auth)
│   │   ├── ipc/                      # IPC handlers
│   │   └── utils/                    # Утилиты (fileWatcher, paths)
│   │
│   └── scripts/                      # Скрипты
│       └── fetch-jira-issue.js       # Получение задачи из Jira
│
├── core/                             # Python backend (legacy)
│   ├── models.py                     # Task, Priority, Status
│   ├── storage.py                    # SQLite хранилище
│   └── api.py                        # TaskAPI
│
├── task_manager.py                   # Python CLI
├── tests/                            # pytest тесты (45 тестов)
├── sync-worklog.ps1                  # PowerShell синхронизация
│
└── Python скрипты (34+ файлов):      # Управление задачами через JSON
    ├── add_*.py                      # Создание задач (10+ скриптов)
    ├── update_*.py                   # Обновление задач
    ├── merge_*.py                    # Объединение задач
    ├── mark_*.py                     # Изменение статусов
    ├── fetch_jira_with_credentials.js  # Получение задач из Jira (Node.js)
    └── add_jira_comment.js           # Добавление комментариев в Jira (Node.js)
```

---

## 3. ТИПЫ ДАННЫХ (TypeScript)

### 3.1 Основные типы

```typescript
// Приоритет (числовой, 5 = максимальный)
type Priority = 5 | 4 | 3 | 2 | 1;
// 5 = CRITICAL (Критично)
// 4 = HIGH (Высокий)
// 3 = MEDIUM (Средний)
// 2 = LOW (Низкий)
// 1 = BACKLOG (Бэклог)

// Статус задачи
type Status = 'новая' | 'в работе' | 'завершена' | 'заблокирована' | 'выполнена';

// Тип задачи
type TaskType = 'Анализ/Исследование' | 'Документация' | 'Разработка'
              | 'Координация' | 'Баг/Проблема' | 'Неизвестно';

// Сложность
type Complexity = 'низкая' | 'средняя' | 'высокая';

// Категория (для группировки и цветов)
type Category = 'Общие' | 'РЭМД' | 'КУ ФЭР' | 'Авто';
```

### 3.2 Цвета категорий

| Категория | Цвет HEX | Проекты Jira |
|-----------|----------|--------------|
| Общие     | `#737373` (серый) | — |
| РЭМД      | `#60a5fa` (синий) | EGISZREMD-* |
| КУ ФЭР    | `#fbbf24` (желтый) | EGISZKUFER-* |
| Авто      | `#4ade80` (зеленый) | Task Center, Claude Code |

### 3.3 Интерфейс Task

```typescript
interface Task {
  id: string;                          // UUID
  title: string;                       // Короткое название
  description: string;                 // Полное описание
  original_text?: string;              // Исходный текст от пользователя

  // Классификация
  task_type: TaskType;
  complexity: Complexity;
  priority: Priority;                  // 1-5 (5 = критичный)
  status: Status;
  category?: Category;                 // РЭМД | КУ ФЭР | Общие | Авто

  // Связи
  jira_references: JiraReference[];    // Ссылки на Jira
  mentions: Mention[];                 // Упоминания людей
  dependencies: string[];              // ID зависимых задач

  // Сроки
  deadline: string | null;             // ISO datetime
  start_date: string | null;

  // Контекст (AI-generated)
  context: TaskContext;
  ai_classification_confidence: number; // 0.0-1.0
  ai_recommendations: {
    reasoning: string;
    source: string;
  };

  // Пользовательские данные
  user_notes: string;
  clarifications: Record<string, unknown>;

  // Time tracking
  time_tracking?: TimeTracking;

  // Метаданные
  metadata: TaskMetadata;
}

interface JiraReference {
  ticket_id: string;                   // "EGISZREMD-15282"
  url: string;                         // "https://jira.i-novus.ru/browse/..."
  project: string;                     // "EGISZREMD"
}

interface TimeTracking {
  sessions: TimeSession[];
  total_minutes: number;
  current_session_start?: string;      // ISO datetime (если таймер активен)
}

interface TimeSession {
  start: string;                       // ISO datetime
  end: string;
  duration_minutes: number;
}

interface TaskMetadata {
  created_at: string;
  updated_at: string;
  last_status_change: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string[];
}
```

### 3.4 Worklogs

```typescript
interface LocalWorklog {
  id: string;                          // UUID
  taskId: string;                      // Ссылка на задачу
  jiraKey: string | null;              // "EGISZREMD-15282" или null
  date: string;                        // "2026-01-21"
  startTime: string;                   // "09:00"
  endTime: string;                     // "11:30"
  durationMinutes: number;
  description: string;
  taskTitle: string;

  // Статус синхронизации
  status: 'pending' | 'synced' | 'error';
  syncedAt: string | null;
  jiraWorklogId: string | null;        // ID worklog в Jira после синхронизации
  errorMessage: string | null;

  createdAt: string;
  updatedAt: string;
}
```

---

## 4. ELECTRON IPC API

Все методы доступны через `window.api` в renderer процессе.

### 4.1 Операции с задачами

```typescript
// Получить все задачи
window.api.getTasks(): Promise<{ success: boolean; data?: TasksData; error?: string }>

// Обновить задачу
window.api.updateTask(taskId: string, updates: Record<string, unknown>):
  Promise<{ success: boolean; error?: string }>

// Путь к файлу tasks.json
window.api.getTasksPath(): Promise<string>
```

### 4.2 Time Tracking

```typescript
// Запустить таймер
window.api.startTimeTracking(taskId: string):
  Promise<{ success: boolean; startTime?: string; error?: string }>

// Остановить таймер
window.api.stopTimeTracking(taskId: string):
  Promise<{ success: boolean; durationMinutes?: number; totalMinutes?: number; error?: string }>

// Остановить с автосозданием worklog
window.api.stopTimeTrackingWithWorklog(taskId: string, options?: {
  autoCreateWorklog?: boolean;
  suggestDescription?: boolean;
}): Promise<{ success: boolean; worklog?: LocalWorklog; ... }>
```

### 4.3 Worklogs

```typescript
window.api.getWorklogs(): Promise<{ success: boolean; data?: WorklogsData; error?: string }>
window.api.getWorklogsByDate(date: string): Promise<{ success: boolean; worklogs?: LocalWorklog[]; ... }>
window.api.getWorklogsByRange(startDate: string, endDate: string): Promise<...>
window.api.getPendingWorklogs(): Promise<{ success: boolean; worklogs?: LocalWorklog[]; ... }>
window.api.addWorklog(worklogData: WorklogInput): Promise<{ success: boolean; worklog?: LocalWorklog; ... }>
window.api.updateWorklog(id: string, updates: Record<string, unknown>): Promise<...>
window.api.deleteWorklog(id: string): Promise<{ success: boolean; error?: string }>
window.api.markWorklogSynced(id: string, jiraWorklogId: string): Promise<...>
window.api.markWorklogError(id: string, errorMessage: string): Promise<...>
```

### 4.4 Jira интеграция

```typescript
// Конфигурация
window.api.getJiraConfig(): Promise<{ success: boolean; config?: JiraConfig; ... }>
window.api.saveJiraConfig(config: JiraConfigInput): Promise<...>
window.api.testJiraConnection(): Promise<{ success: boolean; user?: string; error?: string }>

// Worklogs в Jira
window.api.addJiraWorklog(issueKey: string, started: string, timeSpentSeconds: number, comment: string):
  Promise<{ success: boolean; worklogId?: string; error?: string }>
window.api.updateJiraWorklog(issueKey, worklogId, started, timeSpentSeconds, comment): Promise<...>
window.api.deleteJiraWorklog(issueKey: string, worklogId: string): Promise<...>

// Получить задачу из Jira
window.api.getJiraIssue(issueKey: string): Promise<{ success: boolean; issue?: JiraIssue; error?: string }>
```

### 4.5 Window controls

```typescript
window.api.windowMinimize(): Promise<void>
window.api.windowMaximize(): Promise<void>
window.api.windowClose(): Promise<void>
window.api.windowIsMaximized(): Promise<boolean>

// File watcher (auto-refresh)
window.api.onTasksFileChanged(callback: () => void): () => void  // returns cleanup function
```

---

## 5. JIRA ИНТЕГРАЦИЯ

### 5.1 Аутентификация

- **Тип**: Session-based (JSESSIONID cookie)
- **Endpoint**: `https://jira.i-novus.ru`
- **Конфигурация**: `data/jira-config.json`

```json
{
  "baseUrl": "https://jira.i-novus.ru",
  "username": "login",
  "sessionCookie": "JSESSIONID=...",
  "isConfigured": true
}
```

### 5.2 Маппинг статусов Jira → Task Center

| Jira Status | Task Center Status |
|-------------|-------------------|
| Open, Reopened, Fixreq open | `новая` |
| In Progress, In Review | `в работе` |
| Resolved, Closed, Done | `завершена` |
| Blocked, On Hold | `заблокирована` |

### 5.3 Маппинг приоритетов

| Jira Priority | Task Center Priority |
|---------------|---------------------|
| Blocker, Critical | `5` (CRITICAL) |
| High, Major, Основной | `4` (HIGH) |
| Medium, Normal | `3` (MEDIUM) |
| Low, Minor | `2` (LOW) |

---

## 6. REACT КОМПОНЕНТЫ

### 6.1 Страницы (`app/src/pages/`)

| Компонент | Назначение |
|-----------|------------|
| `TasksPage.tsx` | Основная страница со списком задач |
| `WorklogsPage.tsx` | Управление worklogs, синхронизация |
| `StatusReportPage.tsx` | Отчеты по статусам |

### 6.2 Компоненты (`app/src/components/`)

| Компонент | Назначение |
|-----------|------------|
| `Sidebar.tsx` | Навигация (Tasks, Worklogs, Report) |
| `TitleBar.tsx` | Заголовок окна (drag, minimize/maximize/close) |
| `DailyPlan.tsx` | План на день с приоритизацией |
| `TaskRow.tsx` | Строка задачи в списке |
| `TaskDetails.tsx` | Детали задачи (правая панель) |
| `VirtualizedTaskList.tsx` | Виртуализированный список (react-window) |
| `JiraSettingsModal.tsx` | Настройки подключения к Jira |
| `JiraSyncModal.tsx` | Синхронизация worklogs с Jira |
| `FetchJiraIssueModal.tsx` | Загрузка задачи из Jira |
| `WorklogEditModal.tsx` | Редактирование worklog |
| `ErrorBoundary.tsx` | Обработка ошибок React |
| `ResizeHandle.tsx` | Изменение размера панелей |

---

## 7. SLASH-КОМАНДЫ

| Команда | Назначение |
|---------|------------|
| `/tasks` | Показать все задачи с приоритетами |
| `/plan` | Спланировать день — что делать сегодня |
| `/add-task` | Добавить новую задачу |
| `/sync-jira EGISZREMD-12345` | Синхронизировать задачу из Jira |
| `/worklog EGISZREMD-12345 2ч описание` | Добавить worklog |
| `/report неделя` | Сформировать отчет за период |

---

## 8. ДОМЕННЫЕ ТЕРМИНЫ

| Термин | Расшифровка |
|--------|-------------|
| **РЭМД** | Региональные электронные медицинские документы |
| **ЕГИСЗ** | Единая государственная информационная система здравоохранения |
| **ФЛК** | Формально-логический контроль |
| **СЭМД** | Структурированные электронные медицинские документы |
| **ГИСЗ** | Государственная информационная система здравоохранения |
| **МИС** | Медицинская информационная система |
| **КУ ФЭР** | Контур управления федеральными электронными ресурсами |
| **ИА** | Информационная архитектура |

---

## 9. КОМАНДЫ ЗАПУСКА

```bash
# Запуск Electron приложения (development)
cd Task_Center/app
npm run build:electron
npx cross-env NODE_ENV=development npx electron .

# Или одной командой с Vite dev server
cd Task_Center/app && npm run dev

# Python CLI (legacy)
cd Task_Center
python task_manager.py list
python task_manager.py recommend
```

---

## 10. ФАЙЛЫ ДАННЫХ

### 10.1 data/tasks.json

```json
{
  "version": "1.0",
  "updated_at": "2026-01-21T10:30:00Z",
  "tasks": [
    {
      "id": "uuid...",
      "title": "...",
      "priority": 4,
      "status": "в работе",
      "category": "РЭМД",
      "jira_references": [{"ticket_id": "EGISZREMD-15282", "url": "...", "project": "EGISZREMD"}],
      "time_tracking": {"sessions": [...], "total_minutes": 120}
    }
  ]
}
```

### 10.2 data/worklogs.json

```json
{
  "version": "1.0",
  "worklogs": [
    {
      "id": "uuid...",
      "taskId": "task-uuid...",
      "jiraKey": "EGISZREMD-15282",
      "date": "2026-01-21",
      "durationMinutes": 60,
      "description": "Анализ требований",
      "status": "pending"
    }
  ]
}
```

---

## 11. ПРЕДПОЧТЕНИЯ ПОЛЬЗОВАТЕЛЯ

### Язык общения
- **Всегда отвечать на русском языке**
- После compacting/summarization — продолжать на русском
- Технические термины можно оставлять на английском (API, JSON, TypeScript)

### Стиль кода
- Комментарии на русском — OK
- Названия переменных — английский
- Type hints обязательны (Python)
- TypeScript strict mode

### Рабочий процесс
- ОС: Windows
- IDE: VS Code
- Jira: jira.i-novus.ru
- Краткие ответы предпочтительны

---

## 12. ПРИ СТАРТЕ СЕССИИ

1. Если нет конкретной задачи → спросить "Чем помочь?"
2. Предложить `/plan` для планирования дня
3. Проверить `data/tasks.json` на активные таймеры (`current_session_start`)
4. Проверить pending worklogs для синхронизации

---

## 13. ИСТОРИЯ ВЕРСИЙ

| Версия | Изменения |
|--------|-----------|
| **v1.5.0** | TaskDetails UX overhaul: sticky header, live timer, inline notes editing, SVG icons, improved Jira export |
| **v1.4.0** | CRUD modals, action buttons, bulk edit |
| **v1.3.1** | UI fixes: TaskDetails header layout, panel width (800px), Play/Pause button toggle |
| **v1.3.0** | FetchJiraIssueModal, electron refactoring, категории |
| **v1.2.0** | Smart worklog validation, AI fallback |
| **v1.1.0** | UI improvements, Jira worklog sync, drag-and-drop |
| **v1.0.0** | Initial release — tasks, daily plan, timer, filtering |

---

## 14. РЕПОЗИТОРИЙ GIT

### GitHub Repository
- **URL**: https://github.com/norkaneopoznannaa/task-center-app
- **Основная ветка**: main
- **Remote**: origin

### Команды Git

```bash
# Проверка статуса
git status

# Создание коммита
git add .
git commit -m "Описание изменений"

# Создание тега версии
git tag -a v1.x.x -m "Release v1.x.x"

# Отправка в GitHub
git push origin main
git push origin v1.x.x  # отправка тега

# Просмотр тегов
git tag -l
```

### Структура веток
- `main` — основная стабильная ветка
- `master` — ветка для разработки (создана 2026-01-21)

### Релизы
Все версии помечаются Git тегами в формате `v1.x.x` и синхронизируются с GitHub для трекинга истории изменений.

---

## 15. ИЗВЕСТНЫЕ ОСОБЕННОСТИ

### Что работает
- CRUD задач через JSON
- Time tracking с сессиями
- Jira worklog синхронизация (session auth)
- File watcher для auto-refresh
- Виртуализированные списки (react-window)
- **Система приоритетов с обратной совместимостью** (2026-01-23):
  - Приоритеты отображаются как плашки с русскими надписями (не цифрами!)
  - Поддержка как числового формата (1-5), так и строкового ('CRITICAL', 'HIGH', etc.)
  - Автоматическая нормализация для отображения в UI
  - Файл: `app/src/components/TaskRow.tsx:20` - функция `normalizePriority()`
- **TaskDetails UX v2.0** (2026-02-01):
  - Sticky header с названием задачи и категорией
  - Live timer counter (обновляется каждую секунду)
  - Inline редактирование заметок (Ctrl+Enter для сохранения)
  - SVG иконки вместо emoji (стабильное отображение)
  - Улучшенный экспорт в Jira с preview округления
  - Группировка сессий по датам с expand/collapse
  - Keyboard navigation (Esc для закрытия)
  - ARIA labels для accessibility
  - Файлы: `app/src/components/taskDetails/*.tsx`, `app/src/components/icons/index.tsx`

### Известные проблемы (2026-01-29)
- **🔴 КРИТИЧНО: Фильтр "Авто" не работает** (case sensitivity):
  - В `data/tasks.json`: 9 задач с `"category": "авто"` (lowercase)
  - В `data/tasks.json`: 1 задача с `"category": "общие"` (lowercase)
  - В `app/src/types/index.ts`: `type Category = 'Общие' | 'РЭМД' | 'КУ ФЭР' | 'Авто'` (proper case)
  - В `app/src/pages/TasksPage.tsx:59`: строгое сравнение `task.category !== filters.category`
  - **Решение**: Исправить регистр в JSON + добавить case-insensitive сравнение
  - **План**: Создать `fix_category_case.py` для исправления данных
  - **Файл с планом**: `PLAN_DORABOTKI.md`

- **❌ Отсутствуют UI кнопки** для многих операций Claude:
  - Создать задачу, Удалить задачу, Дублировать задачу
  - Изменить приоритет, Добавить Jira комментарий
  - Открыть в Jira, Bulk operations
  - Добавить в Daily Plan вручную (сейчас только автоматический алгоритм)

### Daily Plan - автоматическая приоритизация
**Файл**: `app/src/components/DailyPlan.tsx`

**Как работает**:
- **НЕТ кнопки "Добавить в план на день"** - задачи выбираются автоматически
- Фильтруются активные задачи (исключаются `выполнена`, `завершена`, `заблокирована`)
- Рассчитывается взвешенный score для каждой задачи:
  ```typescript
  score = priority * 0.30 +        // Приоритет (30%)
          deadlineScore * 0.25 +   // Дедлайн (25%)
          statusScore * 0.20 +     // Статус "в работе" (20%)
          jiraBonus * 0.10 +       // Наличие Jira ссылки (10%)
          aiConfidence * 0.10 +    // AI уверенность (10%)
          mentionsBonus * 0.05     // Упоминания людей (5%)
  ```
- Выбираются **топ-5 задач** с максимальным score
- Пользователь может **вручную менять порядок** через drag-and-drop (@dnd-kit)
- Порядок сохраняется в localStorage (`dailyPlan_manualOrder`)
- Кнопка "Reset Order" для сброса к автоматическому порядку

**Рекомендация**: Добавить кнопку "📅 Добавить в план на день" для ручного управления списком

### Что можно улучшить
- Интеграционные тесты для Electron
- Уведомления о дедлайнах
- Оффлайн режим с очередью синхронизации
- Ручное добавление задач в Daily Plan

---

## 16. ПЛАН ДОРАБОТОК (2026-01-29)

**Файл с детальным планом**: `PLAN_DORABOTKI.md`

### Фазы разработки (6 фаз, ~10.5 дней)

#### Phase 1: Исправление фильтра "Авто" (0.5 дня) - КРИТИЧНО
- Создать `fix_category_case.py` для исправления регистра в `data/tasks.json`
- Изменить 9 задач: `"category": "авто"` → `"Авто"`
- Изменить 1 задачу: `"category": "общие"` → `"Общие"`
- Добавить case-insensitive сравнение в `TasksPage.tsx:59`
- Протестировать фильтрацию

#### Phase 2: Backend IPC handlers (2 дня)
- `create-task` - создание задачи
- `delete-task` - удаление задачи
- `duplicate-task` - дублирование задачи
- `bulk-update-tasks` - массовое обновление
- `add-to-daily-plan` - добавление в план вручную
- Обновить `electron/preload.ts` для новых методов

#### Phase 3: Modal windows (3 дня)
- `CreateTaskModal.tsx` - создание задачи
- `EditTaskModal.tsx` - редактирование задачи
- `ConfirmDeleteModal.tsx` - подтверждение удаления
- `BulkEditModal.tsx` - массовое редактирование
- Обновить `App.tsx` для управления модалками

#### Phase 4: Action buttons (2 дня)
- Добавить кнопки в `TaskRow.tsx`:
  - ✏️ Edit - редактировать
  - 🗑️ Delete - удалить
  - 📋 Duplicate - дублировать
  - 📅 Add to Daily Plan - добавить в план
- Добавить кнопки в `TaskDetails.tsx`:
  - 🔗 Open in Jira - открыть в Jira
  - 💬 Add Jira Comment - добавить комментарий
  - 🔄 Change Priority - изменить приоритет
- Добавить toolbar в `TasksPage.tsx`:
  - ➕ Create Task - создать задачу
  - ✅ Bulk Select - массовый выбор
  - 🔄 Bulk Update - массовое обновление

#### Phase 5: Jira integration UI (2 дня)
- Добавить `AddJiraCommentModal.tsx`
- Обновить `JiraSyncModal.tsx` для улучшенного UX
- Добавить "Open in Jira" кнопку с прямой ссылкой
- Добавить индикаторы синхронизации

#### Phase 6: Документация и тестирование (1 день)
- Обновить `README.md` с новыми функциями
- Создать `CHANGELOG.md` для v1.4.0
- Ручное тестирование всех новых функций
- Обновить screenshots для документации

### Примечания к плану
- **Приоритет #1**: Phase 1 (исправление фильтра "Авто")
- **Зависимости**: Phase 2 → Phase 3 → Phase 4
- **Параллельно**: Phase 5 можно делать параллельно с Phase 4
- **Версия после завершения**: v1.4.0

---

## 17. PYTHON СКРИПТЫ УПРАВЛЕНИЯ ЗАДАЧАМИ

### Назначение
34+ Python и Node.js скрипта для быстрого управления задачами через `data/tasks.json` без запуска Electron приложения.

### Основные типы скриптов

#### Создание задач (`add_*.py`)
```bash
python add_author_control_task.py           # Авторский контроль Jira задач
python add_remd_searchregistry_news_task.py # Проверка новости с коллегой
python add_flc_checker_lag_task.py          # Критическая проблема FLC чекера
python add_guc_certificate_research.py      # Исследование сертификатов УЦ
```

**Структура**: Каждый скрипт создает UUID, заполняет метаданные, добавляет в `tasks.json`

#### Обновление задач (`update_*.py`, `mark_*.py`)
```bash
python mark_kufer_task_done.py              # Изменить статус на "завершена"
python update_soap_rest_task_with_comments.py # Добавить комментарии к задаче
```

#### Объединение задач (`merge_*.py`)
```bash
python merge_registry_tasks.py              # Объединить 7 связанных задач в одну
```

#### Jira интеграция (Node.js)
```bash
node fetch_jira_with_credentials.js         # Получить задачу из Jira (Basic Auth + Session)
node add_jira_comment.js                    # Добавить комментарий в Jira
```

**Особенности**:
- Basic Auth fallback при истечении session cookie
- Маппинг статусов Jira → Task Center
- Автоматическое заполнение `jira_references`

### Примеры использования

#### Создание задачи
```python
#!/usr/bin/env python3
import json, uuid
from datetime import datetime
from pathlib import Path

tasks_file = Path(__file__).parent / "data" / "tasks.json"

with open(tasks_file, "r", encoding="utf-8") as f:
    data = json.load(f)

new_task = {
    "id": str(uuid.uuid4()),
    "title": "Название задачи",
    "priority": 4,
    "status": "новая",
    "category": "РЭМД",
    "metadata": {
        "created_at": datetime.now().isoformat() + "Z"
    }
}

data["tasks"].append(new_task)
data["updated_at"] = datetime.now().isoformat() + "Z"

with open(tasks_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
```

#### Обновление статуса
```python
task = next((t for t in data["tasks"] if t["id"] == task_id), None)
if task:
    task["status"] = "завершена"
    task["metadata"]["updated_at"] = datetime.now().isoformat() + "Z"
```

### Консольный вывод
**Проблема**: Windows console (cp1251) не поддерживает UTF-8/emoji

**Решение**: ASCII-only output в консоль, UTF-8 в файлы
```python
# Консоль (может быть gibberish)
print(f"Zadacha dobavlena: {task['title']}")

# Файл (корректная кириллица)
json.dump(data, f, ensure_ascii=False, indent=2)
```

---

## 18. ИСТОРИЯ СЕССИЙ

### Сессия 2026-01-29 (текущая)

#### Выполнено за сессию
1. ✅ Отмечена задача КУ ФЭР как завершённая
2. ✅ Выгружены 2 задачи из Jira (EGISZDEVOPS-17233, EGISZREMD-15344)
3. ✅ Создана задача по исследованию сертификатов 4 УЦ
4. ✅ Обновлена задача SOAP→REST с комментариями Марии Покачёвой
5. ✅ Объединены 7 задач о registry_item_warning в одну
6. ✅ Добавлен комментарий в Jira EGISZREMD-15300 (ID: 817217)
7. ✅ Создана срочная задача FLC чекер (лаг 2,703,161)
8. ✅ Создана задача по проверке новости searchRegistryItem РЭМД
9. ✅ Создана задача авторского контроля (EGISZREMD-14862, EGISZREMD-14858)
10. ✅ Проведён анализ приложения и создан PLAN_DORABOTKI.md
11. ✅ Обновлён CLAUDE.md с полной документацией

#### Обнаруженные проблемы
- **🔴 КРИТИЧНО**: Фильтр "Авто" не работает (case sensitivity)
- **❌ Отсутствуют** UI кнопки для многих операций Claude
- **ℹ️ Нет кнопки** "Добавить в Daily Plan" (только автоматический алгоритм)

#### Следующие шаги
1. Исправить фильтр "Авто" (Phase 1 из PLAN_DORABOTKI.md)
2. Добавить недостающие UI кнопки (Phase 2-5)
3. Обновить документацию и создать релиз v1.4.0 (Phase 6)

### Сессия 2026-02-01

#### Выполнено за сессию - TaskDetails UX Overhaul (v1.5.0)

**Анализ UI/UX и создание плана:**
1. ✅ Изучены все компоненты TaskDetails (4 файла + CSS)
2. ✅ Создан детальный план улучшений: `TASK_DETAILS_UX_PLAN.md`

**Phase 1: Структурные изменения**
- ✅ Sticky header с названием задачи как главным элементом
- ✅ Индикатор категории (цветная точка + label)
- ✅ SVG иконка закрытия вместо символа "✕"
- ✅ Keyboard navigation (Esc для закрытия панели)
- ✅ ARIA labels для accessibility

**Phase 2: Улучшение таймера**
- ✅ Live timer counter (обновляется каждую секунду, формат HH:MM:SS)
- ✅ Раздельные кнопки Play/Stop вместо toggle
- ✅ Пульсирующий индикатор активного таймера
- ✅ Progress bar при наличии оценки времени

**Phase 3: Inline редактирование заметок**
- ✅ Кликабельная область для редактирования
- ✅ Текстовая область с автофокусом
- ✅ Кнопки Сохранить/Отмена с иконками
- ✅ Keyboard shortcuts (Ctrl+Enter сохранить, Esc отмена)
- ✅ Подсказка о клавишах

**Phase 4: Улучшение Jira интеграции**
- ✅ Кнопка "Открыть в Jira" (external link icon)
- ✅ Preview экспорта с отображением округления времени
- ✅ Информационная подсказка об округлении до 30 минут
- ✅ Улучшенные состояния кнопки (loading, success, error)

**Phase 5: Visual polish**
- ✅ Создана библиотека SVG иконок: `app/src/components/icons/index.tsx`
  - 16 иконок: Close, Play, Stop, ExternalLink, Link, User, Edit, Upload, Clipboard, Info, Check, Alert, Clock, Calendar, ChevronDown/Up, Loader
- ✅ Обновлён CSS с анимациями (pulse, spin, fadeIn)
- ✅ Улучшенная типография (увеличенные шрифты)
- ✅ Группировка сессий по датам с expand/collapse

**Phase 6: Accessibility**
- ✅ ARIA labels для всех интерактивных элементов
- ✅ role="complementary" для панели
- ✅ tabIndex для фокусировки
- ✅ title атрибуты для tooltips

**Технические изменения:**
- Обновлён `TaskHeader.tsx` - sticky header, категория, SVG иконки
- Обновлён `TaskContent.tsx` - inline editing, улучшенные Jira ссылки
- Обновлён `TaskTimeTracking.tsx` - live timer, группировка сессий
- Обновлён `TaskDetails.tsx` - keyboard navigation, ARIA
- Обновлён `TaskDetails.css` - полный рефакторинг стилей v2.0
- Создан `app/src/components/icons/index.tsx` - библиотека SVG иконок
- Обновлён `App.tsx` - передача onUpdateTask в TaskDetails
- Версия приложения: `1.4.0` → `1.5.0`

#### Файлы изменены
```
app/src/components/TaskDetails.tsx
app/src/components/TaskDetails.css
app/src/components/taskDetails/TaskHeader.tsx
app/src/components/taskDetails/TaskContent.tsx
app/src/components/taskDetails/TaskTimeTracking.tsx
app/src/components/icons/index.tsx (новый)
app/src/App.tsx
app/package.json
CLAUDE.md
TASK_DETAILS_UX_PLAN.md (новый)
```
