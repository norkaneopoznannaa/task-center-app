import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Типы для Jira конфигурации
interface JiraConfig {
  baseUrl: string;
  username: string;
  password: string;
  isConfigured: boolean;
  sessionCookie: string | null;
}

interface JiraWorklogResponse {
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

// Путь к конфигу
const CONFIG_FILE_PATH = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  'jira-config.json'
);

// Значения по умолчанию
const DEFAULT_CONFIG: JiraConfig = {
  baseUrl: 'https://jira.i-novus.ru',
  username: '',
  password: '',
  isConfigured: false,
  sessionCookie: null
};

// In-memory session storage
let currentSession: string | null = null;

// Получить конфиг
export function getJiraConfig(): { success: boolean; config?: JiraConfig; error?: string } {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      return { success: true, config: DEFAULT_CONFIG };
    }
    const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    const config = JSON.parse(content) as JiraConfig;
    // Restore session from memory if available
    if (currentSession) {
      config.sessionCookie = currentSession;
    }
    return { success: true, config };
  } catch (error) {
    console.error('Error reading Jira config:', error);
    return { success: false, error: String(error) };
  }
}

// Сохранить конфиг (без пароля - не храним в файле)
export function saveJiraConfig(config: { baseUrl: string; email: string; apiToken: string }): { success: boolean; error?: string } {
  try {
    const fullConfig: JiraConfig = {
      baseUrl: config.baseUrl,
      username: config.email, // email field used as username
      password: config.apiToken, // apiToken field used as password
      isConfigured: !!(config.baseUrl && config.email && config.apiToken),
      sessionCookie: currentSession
    };

    // Убедимся что директория существует
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(fullConfig, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error saving Jira config:', error);
    return { success: false, error: String(error) };
  }
}

// Extract cookies from response headers
function extractCookies(headers: http.IncomingHttpHeaders): string[] {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return [];
  return setCookie.map(cookie => cookie.split(';')[0]);
}

// Login to Jira and get session cookie
export async function loginToJira(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const configResult = getJiraConfig();
    if (!configResult.success || !configResult.config) {
      resolve({ success: false, error: 'Failed to load Jira config' });
      return;
    }

    const config = configResult.config;
    const url = new URL('/rest/auth/1/session', config.baseUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const body = JSON.stringify({
      username: username,
      password: password
    });

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json'
      },
      rejectUnauthorized: false
    };

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const statusCode = res.statusCode || 0;

        if (statusCode >= 200 && statusCode < 300) {
          // Extract session cookie
          const cookies = extractCookies(res.headers);
          const sessionCookie = cookies.find(c => c.startsWith('JSESSIONID='));

          if (sessionCookie) {
            currentSession = sessionCookie;
            console.log('Jira login successful, session stored');
            resolve({ success: true });
          } else {
            // Try all cookies
            currentSession = cookies.join('; ');
            console.log('Jira login successful, cookies stored:', cookies.length);
            resolve({ success: true });
          }
        } else {
          let errorMessage = `HTTP ${statusCode}`;
          try {
            const errorData = JSON.parse(data);
            if (errorData.errorMessages) {
              errorMessage = errorData.errorMessages.join(', ');
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            errorMessage = data || `HTTP ${statusCode}`;
          }
          resolve({ success: false, error: errorMessage });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Jira login error:', error);
      resolve({ success: false, error: error.message });
    });

    req.write(body);
    req.end();
  });
}

// HTTP запрос к Jira с session cookie
function makeJiraRequest(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<{ success: boolean; data?: unknown; error?: string; statusCode?: number }> {
  return new Promise((resolve) => {
    const configResult = getJiraConfig();
    if (!configResult.success || !configResult.config) {
      resolve({ success: false, error: 'Failed to load Jira config' });
      return;
    }

    const config = configResult.config;

    // Check if we have session or try basic auth
    const hasSession = currentSession || config.sessionCookie;
    const hasCredentials = config.username && config.password;

    if (!hasSession && !hasCredentials) {
      resolve({ success: false, error: 'Not authenticated. Please login first.' });
      return;
    }

    const url = new URL(endpoint, config.baseUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Prefer session cookie over basic auth
    if (hasSession) {
      headers['Cookie'] = currentSession || config.sessionCookie || '';
    } else if (hasCredentials) {
      // Fallback to basic auth
      const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: headers,
      rejectUnauthorized: false
    };

    const req = httpModule.request(options, (res) => {
      let data = '';

      // Update session cookie if refreshed
      const cookies = extractCookies(res.headers);
      const newSession = cookies.find(c => c.startsWith('JSESSIONID='));
      if (newSession) {
        currentSession = newSession;
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const statusCode = res.statusCode || 0;

        if (statusCode >= 200 && statusCode < 300) {
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve({ success: true, data: parsed, statusCode });
          } catch {
            resolve({ success: true, data: data, statusCode });
          }
        } else if (statusCode === 401) {
          // Session expired, clear it
          currentSession = null;
          resolve({ success: false, error: 'Session expired. Please login again.', statusCode });
        } else {
          let errorMessage = `HTTP ${statusCode}`;
          try {
            const errorData = JSON.parse(data);
            if (errorData.errorMessages) {
              errorMessage = errorData.errorMessages.join(', ');
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            errorMessage = data || `HTTP ${statusCode}`;
          }
          resolve({ success: false, error: errorMessage, statusCode });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Jira request error:', error);
      resolve({ success: false, error: error.message });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Проверить подключение к Jira (с автоматическим логином)
export async function testJiraConnection(): Promise<{ success: boolean; user?: string; error?: string }> {
  const configResult = getJiraConfig();
  if (!configResult.success || !configResult.config) {
    return { success: false, error: 'Failed to load Jira config' };
  }

  const config = configResult.config;

  // Try to login first if no session
  if (!currentSession && config.username && config.password) {
    console.log('No session, attempting login...');
    const loginResult = await loginToJira(config.username, config.password);
    if (!loginResult.success) {
      return { success: false, error: `Login failed: ${loginResult.error}` };
    }
  }

  const result = await makeJiraRequest('GET', '/rest/api/2/myself');

  if (result.success && result.data) {
    const userData = result.data as { displayName?: string; name?: string };
    return {
      success: true,
      user: userData.displayName || userData.name || 'Unknown'
    };
  }

  return { success: false, error: result.error };
}

// Выйти из Jira
export async function logoutFromJira(): Promise<{ success: boolean; error?: string }> {
  if (!currentSession) {
    return { success: true };
  }

  const configResult = getJiraConfig();
  if (!configResult.success || !configResult.config) {
    currentSession = null;
    return { success: true };
  }

  const config = configResult.config;
  const url = new URL('/rest/auth/1/session', config.baseUrl);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'DELETE',
      headers: {
        'Cookie': currentSession || ''
      },
      rejectUnauthorized: false
    };

    const req = httpModule.request(options, () => {
      currentSession = null;
      resolve({ success: true });
    });

    req.on('error', () => {
      currentSession = null;
      resolve({ success: true });
    });

    req.end();
  });
}

// Добавить worklog в Jira
export async function addJiraWorklog(
  issueKey: string,
  started: string,
  timeSpentSeconds: number,
  comment: string
): Promise<{ success: boolean; worklogId?: string; error?: string }> {
  const body = {
    started: started,
    timeSpentSeconds: timeSpentSeconds,
    comment: comment
  };

  const result = await makeJiraRequest('POST', `/rest/api/2/issue/${issueKey}/worklog`, body);

  if (result.success && result.data) {
    const worklogData = result.data as JiraWorklogResponse;
    return { success: true, worklogId: worklogData.id };
  }

  return { success: false, error: result.error };
}

// Получить информацию о задаче Jira
export async function getJiraIssue(issueKey: string): Promise<{ success: boolean; issue?: unknown; error?: string }> {
  const result = await makeJiraRequest('GET', `/rest/api/2/issue/${issueKey}?fields=summary,status,assignee`);

  if (result.success) {
    return { success: true, issue: result.data };
  }

  return { success: false, error: result.error };
}

// Форматировать время для Jira (ISO 8601 с timezone)
export function formatJiraDateTime(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';

  const pad = (n: number) => n.toString().padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000` +
         `${offsetSign}${pad(offsetHours)}${pad(offsetMins)}`;
}

// Проверить есть ли активная сессия
export function hasActiveSession(): boolean {
  return !!currentSession;
}
