---
description: Синхронизировать задачу из Jira по ключу
---

Пользователь укажет ключ Jira задачи (например EGISZREMD-15282).

Действия:
1. Запусти скрипт `node app/scripts/fetch-jira-issue.js` с нужным ключом
   (или используй существующий API в приложении)

2. Если скрипт отработал - прочитай созданный файл `data/jira-issue-{KEY}.json`

3. Создай или обнови задачу в `data/tasks.json`:
   - id: сгенерируй UUID если новая задача
   - title: из summary
   - description: из description
   - status: маппинг статуса Jira → (новая/в работе/завершена/заблокирована)
   - priority: из priority.name → (CRITICAL/HIGH/MEDIUM/LOW)
   - category: определи по проекту (EGISZREMD → РЭМД, KUFER → КУ ФЭР)
   - jira_references: [{ key, url, project, status }]

4. Покажи результат синхронизации.

Маппинг статусов Jira:
- "Open", "Reopened", "Fixreq open" → "новая"
- "In Progress", "In Review" → "в работе"
- "Resolved", "Closed", "Done" → "завершена"
- "Blocked", "On Hold" → "заблокирована"

Маппинг приоритетов:
- "Blocker", "Critical" → "CRITICAL"
- "High", "Major", "Основной" → "HIGH"
- "Medium", "Normal" → "MEDIUM"
- "Low", "Minor" → "LOW"
