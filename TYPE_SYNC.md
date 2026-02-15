# Type Synchronization Guide

Этот документ описывает синхронизацию типов между Python (Task Center backend) и TypeScript (task-center-app frontend).

## 📋 Статус синхронизации

### ✅ Синхронизированные типы

| Тип | Python | TypeScript | Представление | Статус |
|-----|--------|-----------|----------------|--------|
| **Priority** | `Priority(Enum)` | `type Priority` | Числовые значения (5,4,3,2,1) | ✅ Синхронизирован |
| **Status** | `Status(Enum)` | `type Status` | Строки (русские) | ✅ Синхронизирован |
| **TaskType** | `TaskType(Enum)` | `type TaskType` | Строки (русские) | ✅ Синхронизирован |
| **Complexity** | `Complexity(Enum)` | `type Complexity` | Строки (русские) | ✅ Синхронизирован |
| **Task** (модель) | `@dataclass Task` | `interface Task` | Полная структура | ✅ Синхронизирован |
| **JiraReference** | `@dataclass` | `interface` | Идентичная структура | ✅ Синхронизирован |
| **Mention/Person** | `@dataclass Person` | `interface Mention` | Идентичная структура | ✅ Синхронизирован |
| **TaskContext** | `@dataclass` | `interface` | Идентичная структура | ✅ Синхронизирован |
| **TaskMetadata** | `@dataclass` | `interface` | Идентичная структура | ✅ Синхронизирован |
| **TimeTracking** | - | `interface` | Только в TS (Electron feature) | ⚠️ TS-only |

### 🔄 Преобразования при передаче данных

**Python → TypeScript (через JSON):**
```python
# Python Priority enum value
Priority.CRITICAL  # value = 5

# Сериализуется как
{"priority": 5}

# TypeScript получает
task.priority: 5  // Type Priority
```

**TypeScript → Python (через HTTP):**
```typescript
const task = {
  priority: 5,  // type Priority
  status: 'новая'  // type Status
}

// Python десериализует как
task.priority == Priority.CRITICAL  # True
task.status == Status.NEW  # True
```

---

## 📁 Расположение типов

### Python
- **Основные типы:** `Task_Center/core/models.py`
  - TaskType, Complexity, Priority, Status (Enum)
  - Task, JiraReference, Person, TaskContext, TaskMetadata (dataclass)

- **API типы:** `Task_Center/core/api.py`
  - TaskFilter, TaskCreateRequest, TaskUpdateRequest

- **AI типы:** `Task_Center/ai/claude_client.py`
  - RateLimiterConfig, CacheStats

### TypeScript
- **Основные типы:** `task-center-app/src/types/index.ts`
  - Priority, Status, TaskType, Complexity, Category (type)
  - Task, JiraReference, Mention, TaskContext, TaskMetadata (interface)
  - PRIORITY_LABELS, STATUS_LABELS, TASK_TYPE_LABELS, COMPLEXITY_LABELS (const)

- **Worklog типы:** `task-center-app/src/types/worklog.ts`
  - LocalWorklog, JiraWorklogRequest, JiraWorklogResponse

- **Electron типы:** `task-center-app/electron/preload.ts`
  - IPC типы для коммуникации между Electron процессами

---

## 🔀 Правила синхронизации

### Правило 1: Enum значения должны быть идентичны

❌ **Неправильно:**
```python
# Python
class Priority(Enum):
    CRITICAL = "CRITICAL"  # Строка!

# TypeScript
type Priority = 1 | 2 | 3 | 4 | 5  // Числа!
```

✅ **Правильно:**
```python
# Python
class Priority(Enum):
    CRITICAL = 5  # Числа

# TypeScript
type Priority = 5 | 4 | 3 | 2 | 1  // Числа
```

### Правило 2: Структуры должны иметь идентичные поля

❌ **Неправильно:** Добавить новое поле только в Python, не обновляя TypeScript

✅ **Правильно:** При добавлении поля обновить обе стороны:

```python
# Python
@dataclass
class Task:
    id: str
    title: str
    description: str
    custom_field: str = ""  # ← Новое поле
```

```typescript
// TypeScript (обновить!)
export interface Task {
  id: string;
  title: string;
  description: string;
  custom_field?: string;  // ← Добавить
}
```

### Правило 3: Используйте consistent naming

- **Field names:** snake_case везде (и Python, и TypeScript)
  - ✅ `task_type`, `jira_references`, `ai_recommendations`
  - ❌ `taskType`, `jiraReferences` в Python

- **Enum values:** Русские строки или числа (как определено)
  - Priority: числа (1-5)
  - Status, TaskType, Complexity: русские строки

### Правило 4: Labels и константы должны быть синхронизированы

```python
# Python (если будет нужно)
PRIORITY_LABELS = {
    Priority.CRITICAL: "Критично",
    Priority.HIGH: "Высокий",
    # ...
}
```

```typescript
// TypeScript
export const PRIORITY_LABELS: Record<Priority, string> = {
  5: "Критично",      // CRITICAL
  4: "Высокий",       // HIGH
  // ...
};
```

---

## 📝 Checklist для добавления нового типа

Когда нужно добавить новый тип (например, новое поле в Task):

### 1. Python (backend)
- [ ] Добавить поле в `core/models.py` в соответствующий dataclass
- [ ] Добавить метод `to_dict()` / `from_dict()` если нужна сериализация
- [ ] Обновить `tests/test_models.py` если требуется

### 2. TypeScript (frontend)
- [ ] Добавить поле в `src/types/index.ts` в соответствующий interface
- [ ] Добавить в LABELS константы если это enum
- [ ] Обновить `electron/preload.ts` если это IPC тип
- [ ] Обновить компоненты которые используют этот тип

### 3. Документация
- [ ] Обновить этот файл (TYPE_SYNC.md)
- [ ] Добавить комментарий о синхронизации если есть особенности

### 4. Тестирование
- [ ] Провести тест serialization/deserialization
- [ ] Проверить что значения корректно передаются между Python и TS

---

## 🔍 Валидация типов

### Python-side

```bash
# Запустить тесты для проверки типов
cd Task_Center
python -m pytest tests/test_models.py -v
```

### TypeScript-side

```bash
# Запустить type checking
cd task-center-app
npx tsc --noEmit

# Запустить линтер
npm run lint
```

---

## 📊 Текущее состояние (v1.2.0)

**Дата обновления:** 2026-01-21

### Общая статистика
- **Синхронизированные типы:** 10/10 ✅
- **TS-only типы:** 3 (TimeTracking, WorklogTypes, SortConfig)
- **Python-only типы:** 3 (RateLimiter, CacheStats, TaskHistory)

### Дублирование
- **Полностью устранено:** Priority, Status, Task, Mentions, Context
- **Частично (TS extensions):** TaskFilters, SortConfig (удобство UI)

### Следующие шаги
- [ ] Рассмотреть добавление TaskHistory в TypeScript для полного аудита
- [ ] Возможно создать генератор типов для автоматической синхронизации
- [ ] Добавить API documentation с примерами типов

---

## 🚨 Частые ошибки

### Ошибка 1: Забыл обновить TypeScript при изменении Python

```python
# Python - добавили новое поле
@dataclass
class Task:
    deadline: Optional[datetime] = None
    priority: Priority = Priority.MEDIUM
    project_code: str = ""  # ← Новое!
```

❌ **Забыли обновить TypeScript:**
```typescript
// TypeScript (устаревший)
interface Task {
  deadline: string | null;
  priority: Priority;
  // project_code отсутствует!
}
```

### Ошибка 2: Несовпадающие значения Priority

```python
# Python
Priority.CRITICAL = 5
```

```typescript
// TypeScript - неправильно!
type Priority = 'CRITICAL' | 'HIGH' | ...;  // ❌ Строки!
```

---

## 📞 Вопросы и помощь

При возникновении вопросов о синхронизации типов:
1. Проверьте этот документ (TYPE_SYNC.md)
2. Посмотрите примеры в `Task_Center/core/models.py`
3. Проверьте тесты в `tests/test_models.py`
4. Посмотрите как типы используются в компонентах React

---

**Maintained by:** Task Center Development Team
**Last updated:** 2026-01-21
