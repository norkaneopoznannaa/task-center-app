/**
 * Script to fetch Jira issue EGISZREMD-15309 using stored credentials
 */
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Encryption settings (same as credential-store.ts)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = 'task-center-jira-v1';

function deriveKey() {
  const machineId = `${os.userInfo().username}-${os.hostname()}-${os.platform()}`;
  return crypto.scryptSync(machineId, SALT, KEY_LENGTH);
}

function decrypt(encrypted) {
  if (!encrypted || !encrypted.includes(':')) return '';

  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return '';

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];

    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return '';
  }
}

function loadCredentials() {
  const credentialsFile = path.join(
    process.env.USERPROFILE || '',
    'Task_Center',
    'data',
    '.credentials'
  );

  if (!fs.existsSync(credentialsFile)) {
    console.error('Credentials file not found');
    return null;
  }

  const content = fs.readFileSync(credentialsFile, 'utf-8');
  const credentials = JSON.parse(content);

  return {
    username: decrypt(credentials.username || ''),
    password: decrypt(credentials.password || '')
  };
}

async function loginToJira(username, password) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ username, password });

    const options = {
      hostname: 'jira.i-novus.ru',
      port: 443,
      path: '/rest/auth/1/session',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json'
      },
      rejectUnauthorized: true
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => { data += chunk; });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cookies = res.headers['set-cookie'];
          const sessionCookie = cookies?.find(c => c.startsWith('JSESSIONID='))?.split(';')[0];
          resolve({ success: true, cookie: sessionCookie || cookies?.map(c => c.split(';')[0]).join('; ') });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.write(body);
    req.end();
  });
}

async function fetchJiraIssue(issueKey, cookie) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'jira.i-novus.ru',
      port: 443,
      path: `/rest/api/2/issue/${issueKey}?fields=summary,status,assignee,priority,issuetype,description,created,updated,duedate`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cookie': cookie
      },
      rejectUnauthorized: true
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => { data += chunk; });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ success: true, data: JSON.parse(data) });
          } catch {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.end();
  });
}

async function main() {
  console.log('=== Fetching Jira Issue EGISZREMD-15309 ===\n');

  // Load credentials
  console.log('1. Loading credentials...');
  const creds = loadCredentials();
  if (!creds || !creds.username || !creds.password) {
    console.error('Failed to load credentials');
    process.exit(1);
  }
  console.log(`   Username: ${creds.username}`);
  console.log(`   Password: ${'*'.repeat(creds.password.length)}`);

  // Login to Jira
  console.log('\n2. Logging in to Jira...');
  const loginResult = await loginToJira(creds.username, creds.password);
  if (!loginResult.success) {
    console.error(`   Login failed: ${loginResult.error}`);
    process.exit(1);
  }
  console.log('   Login successful!');

  // Fetch issue
  console.log('\n3. Fetching issue EGISZREMD-15309...');
  const issueResult = await fetchJiraIssue('EGISZREMD-15309', loginResult.cookie);
  if (!issueResult.success) {
    console.error(`   Failed to fetch issue: ${issueResult.error}`);
    process.exit(1);
  }

  const issue = issueResult.data;
  const fields = issue.fields;

  console.log('\n=== ISSUE DATA ===\n');
  console.log(`Key: ${issue.key}`);
  console.log(`Summary: ${fields.summary}`);
  console.log(`Status: ${fields.status?.name || 'N/A'}`);
  console.log(`Priority: ${fields.priority?.name || 'N/A'}`);
  console.log(`Type: ${fields.issuetype?.name || 'N/A'}`);
  console.log(`Assignee: ${fields.assignee?.displayName || 'Unassigned'}`);
  console.log(`Created: ${fields.created}`);
  console.log(`Updated: ${fields.updated}`);
  console.log(`Due date: ${fields.duedate || 'N/A'}`);
  console.log(`\nDescription:\n${fields.description || 'No description'}`);

  // Save to JSON
  const outputPath = path.join(process.env.USERPROFILE || '', 'Task_Center', 'data', 'jira-issue-EGISZREMD-15309.json');
  fs.writeFileSync(outputPath, JSON.stringify(issue, null, 2), 'utf-8');
  console.log(`\n=== Saved to: ${outputPath} ===`);
}

main().catch(console.error);
