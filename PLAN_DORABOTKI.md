# План доработки Task Center App

**Дата создания**: 2026-01-29
**Версия**: 1.0
**Статус исследования**: Завершено

---

## КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. ❌ ФИЛЬТР "АВТО" НЕ РАБОТАЕТ

**Проблема**: Несоответствие регистра (case sensitivity)

**Локация ошибки**:
- Данные: `C:\Users\vignatov\Task_Center\data\tasks.json`
- Код фильтрации: `C:\Users\vignatov\task-center-app\src\pages\TasksPage.tsx:59`

**Причина**:
```typescript
// В types/index.ts ПРАВИЛЬНО определено:
export type Category = 'Общие' | 'РЭМД' | 'КУ ФЭР' | 'Авто';  // ← "Авто" с большой буквы

// В data/tasks.json НЕПРАВИЛЬНО хранится:
"category": "авто"    // ❌ 9 задач с малой буквы
"category": "общие"   // ❌ 1 задача с малой буквы

// Фильтр в TasksPage.tsx сравнивает строго:
if (task.category !== filters.category) return false;
// "авто" !== "Авто" → false → задачи не отображаются
```

**Пострадавшие задачи**:
- 9 задач с `category: "авто"` (вместо "Авто")
- 1 задача с `category: "общие"` (вместо "Общие")

**Решение #1: Исправить данные (быстрое)**
```python
# Файл: C:\Users\vignatov\Task_Center\fix_category_case.py
import json
from pathlib import Path

def fix_category_case():
    tasks_file = Path(__file__).parent / "data" / "tasks.json"

    with open(tasks_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    fixed_count = 0
    for task in data["tasks"]:
        if task.get("category") == "авто":
            task["category"] = "Авто"
            fixed_count += 1
        elif task.get("category") == "общие":
            task["category"] = "Общие"
            fixed_count += 1

    with open(tasks_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Исправлено задач: {fixed_count}")

if __name__ == "__main__":
    fix_category_case()
```

**Решение #2: Case-insensitive фильтрация (долгосрочное)**
```typescript
// В TasksPage.tsx:59 изменить на:
if (filters.category !== 'all' &&
    task.category?.toLowerCase() !== filters.category.toLowerCase()) {
  return false;
}
```

**Приоритет**: 🔴 КРИТИЧЕСКИЙ
**Время на исправление**: 5 минут
**Рекомендация**: Сделать оба решения

---

## НЕДОСТАЮЩИЕ UI КНОПКИ

### 2. ✅ РЕАЛИЗОВАННЫЕ ДЕЙСТВИЯ (УЖЕ ЕСТЬ В UI)

| Действие | Компонент | Локация |
|----------|-----------|---------|
| ✅ Запуск таймера | TaskRow | `src/components/TaskRow.tsx:186` |
| ✅ Остановка таймера | TaskRow | `src/components/TaskRow.tsx:182` |
| ✅ Изменение статуса | TaskRow | `src/components/TaskRow.tsx:160` |
| ✅ Просмотр деталей | TasksPage | Клик по строке |
| ✅ Фильтрация | Sidebar | `src/components/Sidebar.tsx:38-99` |
| ✅ Сортировка | TasksPage | `src/pages/TasksPage.tsx:26-35` |
| ✅ Поиск | TasksPage | `src/pages/TasksPage.tsx:54-57` |
| ✅ Загрузка из Jira | FetchJiraIssueModal | `src/components/FetchJiraIssueModal.tsx` |
| ✅ Синхронизация Jira | JiraSyncModal | `src/components/JiraSyncModal.tsx` |

### 3. ❌ НЕДОСТАЮЩИЕ КНОПКИ ДЛЯ CLAUDE-ДЕЙСТВИЙ

#### 3.1. В TaskDetails (правая панель)

**Что добавить**:
```typescript
// Новая секция "Claude Actions" в TaskDetails
<div className="task-claude-actions">
  <h3>Действия Claude</h3>

  {/* Группа 1: Управление задачей */}
  <div className="action-group">
    <h4>Управление</h4>
    <button onClick={() => handleEditTask()}>
      ✏️ Редактировать описание
    </button>
    <button onClick={() => handleChangePriority()}>
      🔺 Изменить приоритет
    </button>
    <button onClick={() => handleDuplicateTask()}>
      📋 Дублировать задачу
    </button>
    <button onClick={() => handleDeleteTask()} className="danger">
      🗑️ Удалить задачу
    </button>
  </div>

  {/* Группа 2: Jira интеграция */}
  <div className="action-group">
    <h4>Jira</h4>
    <button onClick={() => handleAddJiraComment()}>
      💬 Добавить комментарий в Jira
    </button>
    <button onClick={() => handleSyncFromJira()}>
      🔄 Синхронизировать с Jira
    </button>
    {task.jira_references?.length > 0 && (
      <button onClick={() => handleOpenInJira()}>
        🔗 Открыть в Jira
      </button>
    )}
  </div>

  {/* Группа 3: Отчеты */}
  <div className="action-group">
    <h4>Отчеты</h4>
    <button onClick={() => handleGenerateReport()}>
      📊 Создать отчет по задаче
    </button>
    <button onClick={() => handleExportTask()}>
      💾 Экспортировать задачу (JSON)
    </button>
  </div>
</div>
```

**Файлы для изменения**:
- `src/components/TaskDetails.tsx` - добавить секцию Actions
- `src/components/taskDetails/TaskActions.tsx` (новый файл)

#### 3.2. В TasksPage (верхняя панель)

**Что добавить**:
```typescript
// В шапке страницы (над таблицей)
<div className="tasks-toolbar">
  <div className="toolbar-left">
    {/* Существующие фильтры */}
  </div>

  <div className="toolbar-right">
    {/* НОВЫЕ КНОПКИ */}
    <button className="btn-primary" onClick={() => handleCreateTask()}>
      ➕ Создать задачу
    </button>
    <button className="btn-secondary" onClick={() => handleImportFromJira()}>
      📥 Импорт из Jira
    </button>
    <button className="btn-secondary" onClick={() => handleBulkActions()}>
      ⚙️ Массовые операции
    </button>
  </div>
</div>
```

#### 3.3. Модальное окно "Создать задачу"

**Новый компонент**: `src/components/CreateTaskModal.tsx`

```typescript
interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: Partial<Task>) => Promise<void>;
}

// Форма с полями:
- Название (обязательное)
- Описание (textarea)
- Категория (dropdown: Общие/РЭМД/КУ ФЭР/Авто)
- Приоритет (dropdown: 5-CRITICAL / 4-HIGH / 3-MEDIUM / 2-LOW / 1-BACKLOG)
- Тип задачи (dropdown: Анализ/Исследование / Документация / Разработка / Координация / Баг/Проблема)
- Сложность (dropdown: низкая / средняя / высокая)
- Jira ссылки (опционально, можно добавлять несколько)
- Deadline (date picker)
```

#### 3.4. Модальное окно "Редактировать задачу"

**Новый компонент**: `src/components/EditTaskModal.tsx`

```typescript
// Аналогично CreateTaskModal, но с предзаполненными данными
// + возможность изменить все поля задачи
```

#### 3.5. Context Menu для TaskRow

**Добавить**: Правый клик по строке задачи

```typescript
// src/components/TaskRowContextMenu.tsx
const contextMenuItems = [
  { icon: '▶️', label: 'Запустить таймер', action: () => onStartTracking(task.id) },
  { icon: '⏹️', label: 'Остановить таймер', action: () => onStopTracking(task.id) },
  { divider: true },
  { icon: '✏️', label: 'Редактировать', action: () => onEdit(task) },
  { icon: '📋', label: 'Дублировать', action: () => onDuplicate(task) },
  { divider: true },
  { icon: '🔗', label: 'Открыть в Jira', action: () => openJira(task), disabled: !hasJiraRef },
  { icon: '💬', label: 'Добавить комментарий в Jira', action: () => addJiraComment(task) },
  { divider: true },
  { icon: '🗑️', label: 'Удалить', action: () => onDelete(task), className: 'danger' },
];
```

---

## НОВЫЕ IPC HANDLERS

### 4. BACKEND (Electron) - Новые IPC методы

**Файл**: `C:\Users\vignatov\task-center-app\electron\appLifecycle.ts`

```typescript
// 1. Создание задачи
ipcMain.handle('create-task', async (event, taskData) => {
  const tasksPath = getTasksPath();
  const data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));

  const now = new Date().toISOString();
  const newTask = {
    id: crypto.randomUUID(),
    ...taskData,
    time_tracking: { sessions: [], total_minutes: 0 },
    metadata: {
      created_at: now,
      updated_at: now,
      last_status_change: null,
      estimated_hours: taskData.estimated_hours || null,
      actual_hours: null,
      tags: taskData.tags || []
    }
  };

  data.tasks.push(newTask);
  data.updated_at = now;

  fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
  cache.invalidate('tasks');

  return { success: true, task: newTask };
});

// 2. Удаление задачи
ipcMain.handle('delete-task', async (event, taskId) => {
  const tasksPath = getTasksPath();
  const data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));

  const taskIndex = data.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return { success: false, error: 'Task not found' };
  }

  data.tasks.splice(taskIndex, 1);
  data.updated_at = new Date().toISOString();

  fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
  cache.invalidate('tasks');

  return { success: true };
});

// 3. Дублирование задачи
ipcMain.handle('duplicate-task', async (event, taskId) => {
  const tasksPath = getTasksPath();
  const data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));

  const originalTask = data.tasks.find(t => t.id === taskId);
  if (!originalTask) {
    return { success: false, error: 'Task not found' };
  }

  const now = new Date().toISOString();
  const duplicatedTask = {
    ...JSON.parse(JSON.stringify(originalTask)), // deep clone
    id: crypto.randomUUID(),
    title: `${originalTask.title} (копия)`,
    status: 'новая',
    time_tracking: { sessions: [], total_minutes: 0 },
    metadata: {
      ...originalTask.metadata,
      created_at: now,
      updated_at: now,
      last_status_change: null,
      actual_hours: null
    }
  };

  data.tasks.push(duplicatedTask);
  data.updated_at = now;

  fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
  cache.invalidate('tasks');

  return { success: true, task: duplicatedTask };
});

// 4. Массовое обновление задач
ipcMain.handle('bulk-update-tasks', async (event, taskIds, updates) => {
  const tasksPath = getTasksPath();
  const data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));

  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const taskId of taskIds) {
    const task = data.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      task.metadata.updated_at = now;
      updatedCount++;
    }
  }

  data.updated_at = now;
  fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
  cache.invalidate('tasks');

  return { success: true, updatedCount };
});
```

**Добавить в preload.ts**:
```typescript
createTask: (taskData: Partial<Task>) => ipcRenderer.invoke('create-task', taskData),
deleteTask: (taskId: string) => ipcRenderer.invoke('delete-task', taskId),
duplicateTask: (taskId: string) => ipcRenderer.invoke('duplicate-task', taskId),
bulkUpdateTasks: (taskIds: string[], updates: Partial<Task>) =>
  ipcRenderer.invoke('bulk-update-tasks', taskIds, updates),
```

---

## ДЕТАЛЬНЫЙ ПЛАН РЕАЛИЗАЦИИ

### PHASE 1: Исправление критических багов (1 день)

**Задачи**:
1. ✅ Исследовать проблему фильтра "Авто" (ВЫПОЛНЕНО)
2. ⏳ Создать скрипт `fix_category_case.py` для исправления данных
3. ⏳ Запустить скрипт и проверить результат
4. ⏳ Добавить case-insensitive сравнение в TasksPage.tsx
5. ⏳ Протестировать фильтр "Авто"
6. ⏳ Коммит: "Fix: category case sensitivity in filters"

**Файлы для изменения**:
- `C:\Users\vignatov\Task_Center\data\tasks.json` (автоматически через скрипт)
- `C:\Users\vignatov\task-center-app\src\pages\TasksPage.tsx` (строка 59)

---

### PHASE 2: Backend IPC handlers (2 дня)

**Задачи**:
1. ⏳ Добавить `create-task` handler
2. ⏳ Добавить `delete-task` handler
3. ⏳ Добавить `duplicate-task` handler
4. ⏳ Добавить `bulk-update-tasks` handler
5. ⏳ Обновить `preload.ts` с новыми методами
6. ⏳ Обновить TypeScript типы в `src/types/index.ts`
7. ⏳ Написать юнит-тесты для handlers
8. ⏳ Коммит: "feat: add CRUD IPC handlers for tasks"

**Файлы для создания/изменения**:
- `electron/appLifecycle.ts` (+150 строк)
- `electron/preload.ts` (+4 метода)
- `src/types/index.ts` (обновить WindowAPI interface)

---

### PHASE 3: UI компоненты - Модальные окна (3 дня)

**Задачи**:
1. ⏳ Создать `CreateTaskModal.tsx` с формой
2. ⏳ Создать `EditTaskModal.tsx` (переиспользовать форму)
3. ⏳ Создать `DeleteConfirmationModal.tsx`
4. ⏳ Создать `BulkActionsModal.tsx`
5. ⏳ Добавить валидацию форм (required fields)
6. ⏳ Добавить date picker для deadline
7. ⏳ Стилизовать модальные окна (CSS)
8. ⏳ Коммит: "feat: add task management modals (create/edit/delete)"

**Файлы для создания**:
- `src/components/CreateTaskModal.tsx` (новый, ~200 строк)
- `src/components/EditTaskModal.tsx` (новый, ~150 строк)
- `src/components/DeleteConfirmationModal.tsx` (новый, ~50 строк)
- `src/components/BulkActionsModal.tsx` (новый, ~100 строк)
- `src/components/modals/TaskForm.tsx` (shared form, ~250 строк)
- `src/styles/modals.css` (новый, ~100 строк)

---

### PHASE 4: UI компоненты - Action buttons (2 дня)

**Задачи**:
1. ⏳ Добавить секцию Claude Actions в TaskDetails
2. ⏳ Создать `TaskActions.tsx` компонент
3. ⏳ Добавить кнопки в toolbar TasksPage
4. ⏳ Создать `TaskRowContextMenu.tsx` (правый клик)
5. ⏳ Интегрировать context menu с react-contexify
6. ⏳ Добавить иконки для действий (SVG или emoji)
7. ⏳ Стилизовать кнопки и context menu
8. ⏳ Коммит: "feat: add action buttons and context menu"

**Файлы для создания/изменения**:
- `src/components/TaskDetails.tsx` (+секция actions)
- `src/components/taskDetails/TaskActions.tsx` (новый, ~150 строк)
- `src/components/TaskRowContextMenu.tsx` (новый, ~100 строк)
- `src/pages/TasksPage.tsx` (обновить toolbar)
- `src/styles/actions.css` (новый, ~80 строк)

**Библиотеки для установки**:
```bash
npm install react-contexify
```

---

### PHASE 5: Интеграция с Jira (2 дня)

**Задачи**:
1. ⏳ Добавить метод `add-jira-comment` в appLifecycle.ts
2. ⏳ Создать `AddJiraCommentModal.tsx`
3. ⏳ Добавить кнопку "Открыть в Jira" с открытием браузера
4. ⏳ Улучшить FetchJiraIssueModal (автозаполнение полей)
5. ⏳ Добавить статус синхронизации задач с Jira
6. ⏳ Коммит: "feat: enhance Jira integration"

**Файлы для создания/изменения**:
- `electron/appLifecycle.ts` (+50 строк для comment)
- `src/components/AddJiraCommentModal.tsx` (новый, ~120 строк)
- `src/components/FetchJiraIssueModal.tsx` (улучшить)

---

### PHASE 6: Документация и тестирование (1 день)

**Задачи**:
1. ✅ Создать `PLAN_DORABOTKI.md` (ВЫПОЛНЕНО)
2. ⏳ Обновить `CLAUDE.md` с полной документацией
3. ⏳ Добавить screenshots новых UI компонентов
4. ⏳ Написать User Guide для новых функций
5. ⏳ Протестировать все новые функции
6. ⏳ Создать changelog для v1.4.0
7. ⏳ Коммит: "docs: update documentation for v1.4.0"

**Файлы для создания/изменения**:
- `C:\Users\vignatov\Task_Center\CLAUDE.md` (обновить)
- `C:\Users\vignatov\Task_Center\CHANGELOG.md` (новый)
- `C:\Users\vignatov\Task_Center\USER_GUIDE.md` (новый)

---

## ИТОГОВАЯ ТАБЛИЦА КНОПОК

| Действие | Где кнопка | Реализовано | Приоритет |
|----------|-----------|-------------|-----------|
| Создать задачу | TasksPage toolbar | ❌ | 🔴 HIGH |
| Редактировать задачу | TaskDetails / Context menu | ❌ | 🔴 HIGH |
| Удалить задачу | TaskDetails / Context menu | ❌ | 🟡 MEDIUM |
| Дублировать задачу | TaskDetails / Context menu | ❌ | 🟡 MEDIUM |
| Изменить приоритет | EditTaskModal | ❌ | 🟡 MEDIUM |
| Запуск таймера | TaskRow | ✅ | — |
| Остановка таймера | TaskRow | ✅ | — |
| Изменение статуса | TaskRow dropdown | ✅ | — |
| Загрузка из Jira | TasksPage toolbar | ✅ | — |
| Синхронизация worklogs | WorklogsPage | ✅ | — |
| Добавить комментарий в Jira | TaskDetails | ❌ | 🟢 LOW |
| Открыть задачу в Jira | TaskDetails / Context menu | ❌ | 🟢 LOW |
| Экспорт задачи (JSON) | TaskDetails | ❌ | 🟢 LOW |
| Массовые операции | TasksPage toolbar | ❌ | 🟢 LOW |
| Создать отчет | TaskDetails | ❌ | 🟢 LOW |

---

## ТЕХНИЧЕСКИЕ ДЕТАЛИ

### Используемые технологии

**Frontend**:
- React 18.2.0
- TypeScript 5.x
- Vite 5.4.21
- CSS Modules

**Backend**:
- Electron 28.0.0
- Node.js IPC
- fs (file system)
- crypto (UUID generation)

**Дополнительные библиотеки (планируется установить)**:
```bash
npm install react-contexify         # Context menu
npm install react-datepicker        # Date picker для deadline
npm install @types/react-datepicker # TypeScript types
```

### Структура файлов после изменений

```
task-center-app/
├── electron/
│   ├── appLifecycle.ts         ← +200 строк (новые IPC handlers)
│   └── preload.ts              ← +4 метода
│
├── src/
│   ├── components/
│   │   ├── TaskDetails.tsx     ← +секция Claude Actions
│   │   ├── TaskRow.tsx         ← +context menu trigger
│   │   ├── CreateTaskModal.tsx      (НОВЫЙ, ~200 строк)
│   │   ├── EditTaskModal.tsx        (НОВЫЙ, ~150 строк)
│   │   ├── DeleteConfirmationModal.tsx (НОВЫЙ, ~50 строк)
│   │   ├── BulkActionsModal.tsx     (НОВЫЙ, ~100 строк)
│   │   ├── AddJiraCommentModal.tsx  (НОВЫЙ, ~120 строк)
│   │   ├── TaskRowContextMenu.tsx   (НОВЫЙ, ~100 строк)
│   │   │
│   │   ├── taskDetails/
│   │   │   └── TaskActions.tsx      (НОВЫЙ, ~150 строк)
│   │   │
│   │   └── modals/
│   │       └── TaskForm.tsx         (НОВЫЙ, ~250 строк, shared)
│   │
│   ├── pages/
│   │   └── TasksPage.tsx       ← обновить toolbar
│   │
│   ├── styles/
│   │   ├── modals.css          (НОВЫЙ, ~100 строк)
│   │   └── actions.css         (НОВЫЙ, ~80 строк)
│   │
│   └── types/
│       └── index.ts            ← обновить WindowAPI interface
│
└── data/
    └── tasks.json              ← исправить регистр категорий
```

---

## TIMELINE (Оценка)

| Phase | Задача | Время | Дата старта | Дата финиша |
|-------|--------|-------|-------------|-------------|
| 1 | Исправление фильтра "Авто" | 0.5 дня | 2026-01-29 | 2026-01-29 |
| 2 | Backend IPC handlers | 2 дня | 2026-01-30 | 2026-01-31 |
| 3 | UI модальные окна | 3 дня | 2026-02-01 | 2026-02-03 |
| 4 | UI action buttons | 2 дня | 2026-02-04 | 2026-02-05 |
| 5 | Jira интеграция | 2 дня | 2026-02-06 | 2026-02-07 |
| 6 | Документация и тесты | 1 день | 2026-02-08 | 2026-02-08 |
| **ИТОГО** | **Все доработки** | **10.5 дней** | — | **2026-02-08** |

---

## ПРИОРИТИЗАЦИЯ

### 🔴 КРИТИЧНО (делать сейчас)
1. Исправить фильтр "Авто" (регистр категорий)
2. Добавить IPC handlers (create/edit/delete task)
3. Создать CreateTaskModal
4. Создать EditTaskModal

### 🟡 ВАЖНО (делать после критичного)
5. Добавить DeleteConfirmationModal
6. Добавить TaskActions в TaskDetails
7. Обновить toolbar в TasksPage
8. Добавить context menu для TaskRow

### 🟢 ЖЕЛАТЕЛЬНО (делать в последнюю очередь)
9. Добавить AddJiraCommentModal
10. Добавить BulkActionsModal
11. Добавить экспорт задачи
12. Добавить генерацию отчетов

---

## РИСКИ И ОГРАНИЧЕНИЯ

### Технические риски
1. **Двойная структура данных**: Есть 2 директории с tasks.json (Electron app vs Python scripts)
   - **Решение**: Всегда использовать `C:\Users\vignatov\Task_Center\data\tasks.json` как единый источник правды

2. **Смешанные форматы приоритетов**: Числовой (5) и строковой ("CRITICAL")
   - **Решение**: Нормализовать при чтении, конвертировать в числовой формат

3. **Case sensitivity**: Проблемы с регистром могут возникнуть снова
   - **Решение**: Везде использовать case-insensitive сравнение

### UX риски
1. **Перегруженность UI**: Слишком много кнопок может запутать пользователя
   - **Решение**: Группировать действия по смыслу, использовать context menu для редких действий

2. **Конфликты синхронизации**: Jira может быть недоступна
   - **Решение**: Добавить retry logic и offline queue

---

## СЛЕДУЮЩИЕ ШАГИ

1. ✅ Исследование завершено
2. ⏳ Создать скрипт `fix_category_case.py`
3. ⏳ Запустить скрипт и проверить фильтр
4. ⏳ Обновить `CLAUDE.md` с полной документацией
5. ⏳ Начать Phase 2: Backend IPC handlers

---

**Автор плана**: Claude (Sonnet 4.5)
**Дата последнего обновления**: 2026-01-29
**Версия документа**: 1.0
