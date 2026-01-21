const https = require('https');

const worklog = {
  started: "2026-01-20T15:00:00.000+0300",
  timeSpentSeconds: 1800,
  comment: "Статус по проекту РЭМД - обсуждение задач с Ильназом"
};

const body = JSON.stringify(worklog);

const options = {
  hostname: 'jira.i-novus.ru',
  port: 443,
  path: '/rest/api/2/issue/MEETING-2395/worklog',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cookie': 'JSESSIONID=263459A99C6B38A41BED45E4C1B1D135'
  },
  rejectUnauthorized: false
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const result = JSON.parse(data);
      console.log('SUCCESS! Worklog ID:', result.id);
      console.log('Full response:', JSON.stringify(result, null, 2));
    } else {
      console.log('Error response:', data);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(body);
req.end();
