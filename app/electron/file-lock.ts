/**
 * Async mutex for serializing file read-modify-write operations.
 * Prevents race conditions when multiple IPC handlers access the same file concurrently.
 *
 * All handlers run in the same Electron main process, so a simple in-process
 * queue is sufficient (no need for OS-level file locks).
 */

type QueueItem = {
  resolve: () => void;
};

const locks = new Map<string, QueueItem[]>();
const held = new Set<string>();

/**
 * Acquire exclusive lock for a file path.
 * If the lock is already held, waits until it's released.
 */
async function acquire(filePath: string): Promise<void> {
  if (!held.has(filePath)) {
    held.add(filePath);
    return;
  }

  return new Promise<void>((resolve) => {
    if (!locks.has(filePath)) {
      locks.set(filePath, []);
    }
    locks.get(filePath)!.push({ resolve });
  });
}

/**
 * Release the lock for a file path.
 * If other operations are waiting, the next one proceeds.
 */
function release(filePath: string): void {
  const queue = locks.get(filePath);
  if (queue && queue.length > 0) {
    const next = queue.shift()!;
    if (queue.length === 0) {
      locks.delete(filePath);
    }
    next.resolve();
  } else {
    held.delete(filePath);
  }
}

/**
 * Execute a callback with exclusive file access.
 * Serializes all read-modify-write operations on the same file.
 *
 * Usage:
 *   const result = await withFileLock(TASKS_FILE_PATH, async () => {
 *     const data = JSON.parse(await fs.readFile(path, 'utf-8'));
 *     data.tasks.push(newTask);
 *     await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
 *     return data;
 *   });
 */
export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await acquire(filePath);
  try {
    return await fn();
  } finally {
    release(filePath);
  }
}
