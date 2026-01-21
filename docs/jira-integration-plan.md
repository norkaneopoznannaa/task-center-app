# План интеграции Task Center с Jira

## Обновлённая концепция

**Главная цель:** Накапливать worklogs локально в Task Center, а в конце дня выгружать их в Jira одной операцией.

### Почему такой подход лучше:
- Можно редактировать записи перед отправкой
- Корректировать время, добавлять комментарии
- Группировать записи по задачам
- Отправлять всё разом в удобный момент
- Работает офлайн (накапливает, потом синхронизирует)

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Task Center App                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │   Таймер    │ -> │ Локальные    │ -> │  Выгрузка     │  │
│  │   задачи    │    │ Worklogs     │    │  в Jira       │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
│                            │                     │          │
│                            v                     v          │
│                     worklogs.json         Jira REST API     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Фаза 1: Локальное хранение Worklogs

### 1.1 Структура данных worklogs.json

```typescript
interface LocalWorklog {
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

interface WorklogsData {
  version: string;
  worklogs: LocalWorklog[];
}
```

### 1.2 Файлы для создания

```
Task_Center/
└── data/
    ├── tasks.json          # Существующий
    └── worklogs.json       # НОВЫЙ - локальные worklogs

task-center-app/
├── electron/
│   └── worklog-storage.ts  # CRUD для worklogs.json
└── src/
    └── types/
        └── worklog.ts      # TypeScript типы
```

### 1.3 Задачи

- [ ] Создать `data/worklogs.json` (пустой файл)
- [ ] Создать `electron/worklog-storage.ts` с методами:
  - `getWorklogs()` - получить все
  - `getWorklogsByDate(date)` - за день
  - `addWorklog(worklog)` - добавить
  - `updateWorklog(id, updates)` - редактировать
  - `deleteWorklog(id)` - удалить
  - `getPendingWorklogs()` - несинхронизированные
- [ ] Добавить IPC handlers в `main.ts`
- [ ] Обновить `preload.ts` с методами worklogs

---

## Фаза 2: UI для управления Worklogs

### 2.1 Автоматическое создание worklog при остановке таймера

При остановке таймера:
1. Создать запись в worklogs.json
2. Показать toast "Worklog добавлен"
3. Опционально: открыть модалку для редактирования

```typescript
// При остановке таймера
const worklog: LocalWorklog = {
  id: generateUUID(),
  taskId: task.id,
  jiraKey: task.jira_references[0]?.ticket_id || null,
  date: formatDate(new Date()),
  startTime: formatTime(timerStart),
  endTime: formatTime(new Date()),
  durationMinutes: calculatedMinutes,
  description: '', // Пользователь заполнит позже
  taskTitle: task.title,
  status: 'pending',
  // ...
};
```

### 2.2 Страница "Worklogs" / "Мой день"

Новая страница в приложении:

```
┌─────────────────────────────────────────────────────────────┐
│  Worklogs за 20.01.2026                    [< Вчера] [>]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  09:00 - 10:30  │ EGISZREMD-15263 │ Задача с ИА      │ 1ч 30м │ ✏️ 🗑️ │
│  10:45 - 12:00  │ —               │ Созвон команды   │ 1ч 15м │ ✏️ 🗑️ │
│  13:00 - 14:30  │ EGISZKUFER-2623 │ КУ ФЭР анализ    │ 1ч 30м │ ✏️ 🗑️ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Итого за день: 4ч 15м                                      │
│                                                             │
│  [ + Добавить вручную ]              [ Выгрузить в Jira ]   │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Модальное окно редактирования

```
┌─────────────────────────────────────────┐
│  Редактировать worklog            [X]   │
├─────────────────────────────────────────┤
│                                         │
│  Задача: [Dropdown с задачами      v]   │
│  Jira:   [EGISZREMD-15263         ]     │
│                                         │
│  Дата:   [20.01.2026]                   │
│  Начало: [09:00]  Конец: [10:30]        │
│  Длительность: 1ч 30м                   │
│                                         │
│  Описание:                              │
│  ┌─────────────────────────────────┐    │
│  │ Анализ требований, обсуждение   │    │
│  │ с Ильназом...                   │    │
│  └─────────────────────────────────┘    │
│                                         │
│        [Отмена]  [Сохранить]            │
└─────────────────────────────────────────┘
```

### 2.4 Файлы для создания

```
task-center-app/src/
├── pages/
│   └── WorklogsPage.tsx        # Страница worklogs
├── components/
│   ├── WorklogItem.tsx         # Строка worklog
│   ├── WorklogEditModal.tsx    # Модалка редактирования
│   └── WorklogAddModal.tsx     # Модалка добавления вручную
└── hooks/
    └── useWorklogs.ts          # Хук для работы с worklogs
```

### 2.5 Задачи

- [ ] Создать `WorklogsPage.tsx`
- [ ] Создать `WorklogItem.tsx`
- [ ] Создать `WorklogEditModal.tsx`
- [ ] Создать `WorklogAddModal.tsx`
- [ ] Добавить роутинг/навигацию на страницу Worklogs
- [ ] Интегрировать с остановкой таймера (автосоздание)
- [ ] Добавить подсчёт итого за день

---

## Фаза 3: Интеграция с Jira API

### 3.1 Настройки подключения

Страница настроек:
```
┌─────────────────────────────────────────┐
│  Настройки Jira                         │
├─────────────────────────────────────────┤
│                                         │
│  URL Jira:                              │
│  [https://jira.i-novus.ru          ]    │
│                                         │
│  Email:                                 │
│  [user@example.com                 ]    │
│                                         │
│  API Token:                             │
│  [******************************** ]    │
│                                         │
│  [Проверить подключение]                │
│  ✅ Подключение успешно                 │
│                                         │
│              [Сохранить]                │
└─────────────────────────────────────────┘
```

### 3.2 Jira API клиент

```typescript
// electron/jira-client.ts

class JiraClient {
  private baseUrl: string;
  private auth: { email: string; token: string };

  // Проверить подключение
  async testConnection(): Promise<boolean>;

  // Получить информацию о задаче
  async getIssue(key: string): Promise<JiraIssue>;

  // Добавить worklog
  async addWorklog(
    issueKey: string,
    started: string,           // ISO datetime
    timeSpentSeconds: number,
    comment: string
  ): Promise<JiraWorklogResponse>;
}
```

### 3.3 API Endpoints

```
GET  /rest/api/2/myself              # Проверка авторизации
GET  /rest/api/2/issue/{key}         # Информация о задаче
POST /rest/api/2/issue/{key}/worklog # Добавить worklog
```

### 3.4 Формат запроса worklog (Jira Server)

```json
POST /rest/api/2/issue/EGISZREMD-15263/worklog

{
  "started": "2026-01-20T09:00:00.000+0300",
  "timeSpentSeconds": 5400,
  "comment": "Анализ требований, обсуждение с Ильназом"
}
```

### 3.5 Файлы для создания

```
task-center-app/
├── electron/
│   ├── jira-client.ts      # HTTP клиент
│   ├── jira-config.ts      # Хранение credentials
│   └── jira-types.ts       # TypeScript типы
└── src/
    ├── pages/
    │   └── SettingsPage.tsx    # Страница настроек
    └── components/
        └── JiraSettings.tsx    # Форма настроек Jira
```

### 3.6 Задачи

- [ ] Создать `jira-client.ts`
- [ ] Создать `jira-config.ts` (безопасное хранение credentials)
- [ ] Создать `SettingsPage.tsx`
- [ ] Добавить проверку подключения
- [ ] Реализовать метод добавления worklog

---

## Фаза 4: Выгрузка в Jira

### 4.1 Процесс выгрузки

1. Пользователь нажимает "Выгрузить в Jira"
2. Показываем список pending worklogs с Jira ключами
3. Пользователь выбирает что выгружать
4. Для каждого worklog:
   - Отправляем в Jira API
   - При успехе: status = 'synced', сохраняем jiraWorklogId
   - При ошибке: status = 'error', сохраняем errorMessage
5. Показываем результат: "Выгружено 5 из 6, 1 ошибка"

### 4.2 UI выгрузки

```
┌─────────────────────────────────────────────────────────────┐
│  Выгрузка в Jira                                      [X]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Готовы к выгрузке: 5 записей                               │
│                                                             │
│  ☑ EGISZREMD-15263  │ 09:00-10:30 │ 1ч 30м │ Задача с ИА   │
│  ☑ EGISZKUFER-2623  │ 13:00-14:30 │ 1ч 30м │ КУ ФЭР        │
│  ☑ EGISZREMD-15284  │ 15:00-16:00 │ 1ч 00м │ СЭМД проверка │
│  ☐ —                │ 10:45-12:00 │ 1ч 15м │ Созвон (нет Jira) │
│  ☑ EGISZDEVOPS-17062│ 16:30-17:30 │ 1ч 00м │ МИС анализ    │
│                                                             │
│  Выбрано: 4 записи, 5ч 00м                                  │
│                                                             │
│              [Отмена]  [Выгрузить выбранные]                │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Задачи

- [ ] Создать `JiraSyncModal.tsx`
- [ ] Реализовать batch выгрузку
- [ ] Обработка ошибок (retry, skip)
- [ ] Обновление статусов в worklogs.json
- [ ] Показ результатов синхронизации

---

## Порядок реализации

### Этап 1: Локальные worklogs (MVP)
**Срок: 4-6 часов**

1. [ ] Создать `worklogs.json` и типы
2. [ ] Создать `worklog-storage.ts`
3. [ ] Добавить IPC handlers
4. [ ] Модифицировать остановку таймера → создание worklog
5. [ ] Создать простую страницу WorklogsPage (список за день)
6. [ ] Добавить возможность редактирования

**Результат:** Можно накапливать worklogs локально, редактировать их.

### Этап 2: Полноценный UI worklogs
**Срок: 3-4 часа**

1. [ ] Улучшить WorklogsPage (фильтры, навигация по датам)
2. [ ] Добавить ручное создание worklog
3. [ ] Добавить группировку по задачам
4. [ ] Добавить статистику (итого за день/неделю)

**Результат:** Полноценное управление worklogs.

### Этап 3: Jira интеграция
**Срок: 4-5 часов**

1. [ ] Создать страницу настроек
2. [ ] Реализовать Jira клиент
3. [ ] Добавить проверку подключения
4. [ ] Создать модалку выгрузки
5. [ ] Реализовать batch синхронизацию

**Результат:** Полная интеграция с Jira.

---

## Общая оценка

| Этап | Описание | Часы |
|------|----------|------|
| 1 | Локальные worklogs (MVP) | 4-6 |
| 2 | Полноценный UI | 3-4 |
| 3 | Jira интеграция | 4-5 |
| **Итого** | | **11-15** |

---

## Технические заметки

### Безопасное хранение credentials

Для Electron можно использовать:
- `electron-store` с шифрованием
- `keytar` (системное хранилище паролей)
- Или просто localStorage (менее безопасно, но проще)

### Часовой пояс

Jira требует время в формате ISO 8601 с timezone:
```
2026-01-20T09:00:00.000+0300
```

Нужно учитывать timezone пользователя при отправке.

### Jira Server vs Cloud

- Server: Basic Auth (email:token) или Session Auth
- Cloud: API Token обязателен

Наш Jira (jira.i-novus.ru) скорее всего Server версия.

---

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Jira API недоступен | Локальное хранение, выгрузка позже |
| Неправильный формат времени | Тесты, валидация перед отправкой |
| Дубликаты worklogs | Проверка по jiraWorklogId |
| Потеря данных | Регулярный бэкап worklogs.json |
