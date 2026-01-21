#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Jira конфигурация
const JIRA_CONFIG = {
  baseUrl: 'https://jira.i-novus.ru',
  username: 'vignatov',
  apiToken: 'Mjc0NDYwNDU4Njc3Ov3tSqTunDRroIqGbZ9t4byVHX1E',
  issueKey: 'EGISZREMD-15282'
};

// Функция для создания base64 auth
function getBasicAuth() {
  const auth = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.apiToken}`).toString('base64');
  return `Basic ${auth}`;
}

// Функция для HTTP запроса
function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, JIRA_CONFIG.baseUrl);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': getBasicAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    console.log(`📡 Запрос к: ${url.href}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve({ success: true, data: parsed, statusCode: res.statusCode });
          } catch (e) {
            resolve({ success: true, data: data, statusCode: res.statusCode });
          }
        } else {
          console.error(`❌ HTTP ${res.statusCode}`);
          resolve({ success: false, error: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Ошибка запроса: ${error.message}`);
      reject(error);
    });

    req.end();
  });
}

// Главная функция
async function main() {
  try {
    console.log('\n🚀 Запуск Jira синхронизации...\n');

    // 1. Проверка подключения
    console.log('1️⃣  Проверка подключения к Jira...');
    const selfResult = await makeRequest('/rest/api/2/myself');

    if (!selfResult.success) {
      console.error('❌ Ошибка подключения:', selfResult.error);
      process.exit(1);
    }

    const user = selfResult.data;
    console.log(`✅ Подключено! Пользователь: ${user.displayName} (${user.emailAddress})\n`);

    // 2. Получение информации о задаче
    console.log(`2️⃣  Загрузка задачи ${JIRA_CONFIG.issueKey}...`);
    const issueResult = await makeRequest(
      `/rest/api/2/issue/${JIRA_CONFIG.issueKey}?fields=summary,description,status,priority,assignee,created,updated,issuetype,project`
    );

    if (!issueResult.success) {
      console.error(`❌ Ошибка загрузки задачи:`, issueResult.error);
      process.exit(1);
    }

    const issue = issueResult.data;
    console.log(`✅ Задача загружена!\n`);

    // 3. Парсинг данных
    const fields = issue.fields;
    const taskData = {
      id: issue.key,
      title: fields.summary || issue.key,
      description: fields.description || 'Нет описания',
      jira_key: issue.key,
      issue_type: fields.issuetype?.name || 'Unknown',
      priority: fields.priority?.name || 'Medium',
      status: fields.status?.name || 'Unknown',
      assignee: fields.assignee?.displayName || 'Не назначена',
      assignee_email: fields.assignee?.emailAddress || null,
      project: fields.project?.key || 'EGISZREMD',
      created: fields.created,
      updated: fields.updated,
      url: `${JIRA_CONFIG.baseUrl}/browse/${issue.key}`
    };

    // 4. Вывод информации
    console.log('📋 Информация о задаче:');
    console.log('═'.repeat(60));
    console.log(`Ключ:          ${taskData.id}`);
    console.log(`Название:      ${taskData.title}`);
    console.log(`Описание:       ${taskData.description.substring(0, 100)}...`);
    console.log(`Тип:           ${taskData.issue_type}`);
    console.log(`Приоритет:     ${taskData.priority}`);
    console.log(`Статус:        ${taskData.status}`);
    console.log(`Ответственный: ${taskData.assignee}`);
    console.log(`Проект:        ${taskData.project}`);
    console.log(`Создана:       ${new Date(taskData.created).toLocaleString('ru-RU')}`);
    console.log(`Обновлена:     ${new Date(taskData.updated).toLocaleString('ru-RU')}`);
    console.log(`URL:           ${taskData.url}`);
    console.log('═'.repeat(60));

    // 5. Обновление tasks.json
    console.log('\n3️⃣  Обновление tasks.json...');
    const tasksFile = path.join(__dirname, 'data', 'tasks.json');

    let tasksData = {
      version: '1.0.0',
      updated_at: new Date().toISOString(),
      tasks: []
    };

    if (fs.existsSync(tasksFile)) {
      tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
    } else {
      // Создать директорию если не существует
      const dataDir = path.dirname(tasksFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    }

    // Найти или создать задачу
    let existingTask = tasksData.tasks.find(t => t.id === JIRA_CONFIG.issueKey);

    const updatedTask = {
      id: JIRA_CONFIG.issueKey,
      title: taskData.title,
      description: taskData.description,
      original_text: `EGISZREMD-15282 - ${taskData.title}`,
      task_type: 'Анализ/Исследование',
      complexity: 'средняя',
      priority: taskData.priority === 'Highest' ? 5 : taskData.priority === 'High' ? 4 : taskData.priority === 'Medium' ? 3 : taskData.priority === 'Low' ? 2 : 1,
      status: taskData.status === 'Done' ? 'завершена' : taskData.status === 'In Progress' ? 'в работе' : 'новая',
      category: 'РЭМД',
      jira_references: [
        {
          ticket_id: taskData.id,
          url: taskData.url,
          project: taskData.project
        }
      ],
      mentions: taskData.assignee ? [{
        name: taskData.assignee,
        role: 'Ответственный',
        mention_context: 'Назначен на эту задачу'
      }] : [],
      dependencies: [],
      deadline: null,
      start_date: taskData.created,
      context: {
        relevant_docs: [
          'EGISZREMD - Государственная информационная система здравоохранения',
          `Тип задачи: ${taskData.issue_type}`
        ],
        key_terms: [
          'EGISZREMD',
          'РЭМД',
          taskData.issue_type
        ],
        related_systems: [
          'Jira',
          'EGISZREMD'
        ],
        criticality_factors: {
          is_jira_linked: true,
          priority: taskData.priority,
          status: taskData.status,
          issue_type: taskData.issue_type
        }
      },
      metadata: {
        created_at: taskData.created,
        updated_at: taskData.updated,
        last_status_change: taskData.updated,
        estimated_hours: null,
        actual_hours: null,
        tags: [
          'jira',
          taskData.issue_type.toLowerCase(),
          taskData.priority.toLowerCase()
        ]
      },
      ai_classification_confidence: 0.95,
      ai_recommendations: {
        reasoning: `Задача успешно загружена из Jira ${JIRA_CONFIG.baseUrl}. Тип: ${taskData.issue_type}, Приоритет: ${taskData.priority}, Ответственный: ${taskData.assignee}`,
        source: 'jira_api_integration'
      },
      user_notes: `Синхронизирована с Jira в ${new Date().toLocaleString('ru-RU')}. Ответственный: ${taskData.assignee}`,
      clarifications: {
        jira_api_endpoint: `/rest/api/2/issue/${JIRA_CONFIG.issueKey}`,
        jira_server: JIRA_CONFIG.baseUrl,
        authentication_status: 'authenticated',
        synced_at: new Date().toISOString()
      }
    };

    if (existingTask) {
      // Обновить существующую
      const index = tasksData.tasks.indexOf(existingTask);
      tasksData.tasks[index] = updatedTask;
      console.log('✅ Задача обновлена');
    } else {
      // Добавить новую
      tasksData.tasks.push(updatedTask);
      console.log('✅ Задача добавлена');
    }

    tasksData.updated_at = new Date().toISOString();
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2));
    console.log(`✅ Файл сохранен: ${tasksFile}\n`);

    // 6. Вывод результата
    console.log('4️⃣  Результат синхронизации:');
    console.log('═'.repeat(60));
    console.log(`✅ Подключение: УСПЕШНО`);
    console.log(`✅ Загрузка данных: УСПЕШНО`);
    console.log(`✅ Обновление tasks.json: УСПЕШНО`);
    console.log('═'.repeat(60));
    console.log('\n🎉 Синхронизация завершена!\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  }
}

main();
