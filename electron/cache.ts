/**
 * In-memory cache system for tasks
 * TTL-based cache to speed up frequent reads
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class TasksCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private ttl: number;

  constructor(ttl: number = 5000) {
    this.ttl = ttl;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
