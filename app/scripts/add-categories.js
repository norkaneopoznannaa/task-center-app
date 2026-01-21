/**
 * Script to add category field to all tasks
 */
const fs = require('fs');

const path = 'C:/Users/vignatov/Task_Center/data/tasks.json';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));

function determineCategory(task) {
  // Проверяем jira_references
  if (task.jira_references && task.jira_references.length > 0) {
    const project = task.jira_references[0].project;
    if (project && project.includes('REMD')) return 'РЭМД';
    if (project && project.includes('KUFER')) return 'КУ ФЭР';
  }

  // Проверяем теги
  const tags = task.metadata?.tags || [];
  if (tags.includes('РЭМД') || tags.includes('СЭМД')) return 'РЭМД';
  if (tags.includes('КУ ФЭР')) return 'КУ ФЭР';
  if (tags.includes('автоматизация')) return 'авто';

  // Проверяем related_systems
  const systems = task.context?.related_systems || [];
  if (systems.includes('РЭМД') || systems.includes('СЭМД') || systems.includes('ЕГИСЗ')) return 'РЭМД';
  if (systems.includes('КУ ФЭР')) return 'КУ ФЭР';
  if (systems.includes('Task Center') || systems.includes('Claude Code')) return 'авто';

  return 'общие';
}

data.tasks = data.tasks.map(task => {
  if (!task.category) {
    task.category = determineCategory(task);
  }
  return task;
});

fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
console.log('Categories added to all tasks');

// Выводим результат
data.tasks.forEach(t => {
  console.log(`${t.id.substring(0, 25).padEnd(25)} -> ${t.category}`);
});
