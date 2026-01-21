/**
 * Скрипт для получения информации о задаче из Jira
 * Использование: node scripts/jira-fetch.js EGISZREMD-12345
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Путь к конфигу Jira
const CONFIG_PATH = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  'jira-config.json'
);

// Получить конфиг
function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Jira config not found:', CONFIG_PATH);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// HTTP запрос к Jira
function jiraRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const config = getConfig();
    const url = new URL(endpoint, config.baseUrl);

    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      rejectUnauthorized: false,
    };

    if (config.sessionCookie) {
      options.headers['Cookie'] = config.sessionCookie;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Получить задачу
async function getIssue(issueKey) {
  const fields = 'summary,status,assignee,priority,created,updated,description,issuetype,components,labels';
  const issue = await jiraRequest('GET', `/rest/api/2/issue/${issueKey}?fields=${fields}`);
  return issue;
}

// Получить worklogs задачи
async function getWorklogs(issueKey) {
  const worklogs = await jiraRequest('GET', `/rest/api/2/issue/${issueKey}/worklog`);
  return worklogs;
}

// Форматировать вывод
function formatIssue(issue) {
  const f = issue.fields;
  console.log('\n=== JIRA ISSUE ===');
  console.log(`Key:         ${issue.key}`);
  console.log(`Summary:     ${f.summary}`);
  console.log(`Status:      ${f.status?.name || 'N/A'}`);
  console.log(`Priority:    ${f.priority?.name || 'N/A'}`);
  console.log(`Type:        ${f.issuetype?.name || 'N/A'}`);
  console.log(`Assignee:    ${f.assignee?.displayName || 'Не назначен'}`);
  console.log(`Created:     ${f.created}`);
  console.log(`Updated:     ${f.updated}`);
  if (f.components?.length > 0) {
    console.log(`Components:  ${f.components.map(c => c.name).join(', ')}`);
  }
  if (f.labels?.length > 0) {
    console.log(`Labels:      ${f.labels.join(', ')}`);
  }
  if (f.description) {
    console.log(`\nDescription:\n${f.description.substring(0, 500)}${f.description.length > 500 ? '...' : ''}`);
  }
  console.log('==================\n');
}

function formatWorklogs(worklogs) {
  if (!worklogs.worklogs || worklogs.worklogs.length === 0) {
    console.log('No worklogs found.');
    return;
  }

  console.log('\n=== WORKLOGS ===');
  let totalSeconds = 0;
  worklogs.worklogs.forEach((w, i) => {
    totalSeconds += w.timeSpentSeconds;
    console.log(`${i + 1}. ${w.author.displayName} - ${w.timeSpent} (${new Date(w.started).toLocaleDateString('ru-RU')})`);
    if (w.comment) {
      console.log(`   Comment: ${w.comment.substring(0, 100)}${w.comment.length > 100 ? '...' : ''}`);
    }
  });
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  console.log(`\nTotal logged: ${hours}h ${minutes}m`);
  console.log('================\n');
}

// Main
async function main() {
  const issueKey = process.argv[2];

  if (!issueKey) {
    console.log('Usage: node scripts/jira-fetch.js <ISSUE-KEY> [--worklogs]');
    console.log('Example: node scripts/jira-fetch.js EGISZREMD-12345');
    console.log('         node scripts/jira-fetch.js EGISZREMD-12345 --worklogs');
    process.exit(1);
  }

  try {
    const issue = await getIssue(issueKey);
    formatIssue(issue);

    if (process.argv.includes('--worklogs')) {
      const worklogs = await getWorklogs(issueKey);
      formatWorklogs(worklogs);
    }

    // Вывод JSON для парсинга
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(issue, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
