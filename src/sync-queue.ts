// Obsidian is a trademark of Dynalist Inc. RustShare is not affiliated with, endorsed by, or sponsored by Obsidian.
// This file is part of RustShare Vault Sync.

export type SyncOperationType = 'create' | 'modify' | 'delete' | 'rename';

export interface SyncOperation {
  path: string;
  type: SyncOperationType;
  oldPath?: string;
}

export interface SyncQueueOptions {
  debounceMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  /** Persist the currently queued ops so they survive a plugin reload. */
  saveQueue?: (ops: SyncOperation[]) => void | Promise<void>;
  /** Restore previously persisted ops on startup. */
  loadQueue?: () => SyncOperation[] | Promise<SyncOperation[]>;
}

export class SyncQueue {
  private pending = new Map<string, SyncOperation>();
  private offlineQueue: SyncOperation[] = [];
  private debounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;
  private isRunning = false;
  private online = true;
  private active = false;
  private lastRetryAfterMs?: number;

  constructor(
    private options: SyncQueueOptions,
    private onSync: (ops: SyncOperation[]) => Promise<SyncOperation[] | void>,
  ) {}

  add(op: SyncOperation): void {
    if (op.type === 'rename' && op.oldPath) {
      const existing = this.pending.get(op.oldPath);
      if (existing) {
        this.pending.delete(op.oldPath);
        const updatedOp: SyncOperation = {
          path: op.path,
          type: existing.type === 'create' ? 'create' : 'rename',
          oldPath: existing.type === 'create' ? undefined : op.oldPath,
        };
        this.pending.set(op.path, updatedOp);
        this.scheduleRun();
        return;
      }
    }

    this.pending.set(op.path, op);
    this.scheduleRun();
    void this.persistQueue();
  }

  flush(): void {
    this.clearDebounceTimer();
    void this.runSync();
  }

  start(): void {
    this.active = true;
    void this.loadPersistedQueue();
  }

  stop(): void {
    this.active = false;
    this.clearTimers();
  }

  isOnline(): boolean {
    return this.online;
  }

  setOnline(online: boolean): void {
    const wasOffline = !this.online;
    this.online = online;
    if (online && wasOffline) {
      this.retryCount = 0;
      this.clearRetryTimer();
      for (const op of this.offlineQueue) {
        this.pending.set(op.path, op);
      }
      this.offlineQueue = [];
      void this.persistQueue();
      this.flush();
    }
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getOfflineQueueCount(): number {
    return this.offlineQueue.length;
  }

  private scheduleRun(): void {
    if (!this.active) return;
    this.clearDebounceTimer();
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.runSync();
    }, this.options.debounceMs);
  }

  private async runSync(): Promise<void> {
    if (this.isRunning) return;

    const ops = Array.from(this.pending.values());
    if (ops.length === 0) return;

    this.pending.clear();
    this.isRunning = true;
    void this.persistQueue();

    try {
      // onSync resolves with the ops that did not complete; only those are
      // replayed so already-succeeded ops (e.g. an uploaded create) are
      // never re-executed against the server.
      const failedOps = (await this.onSync(ops)) ?? [];
      this.retryCount = 0;
      if (failedOps.length > 0) {
        this.enqueueRetry(failedOps, true);
      }
    } catch (error) {
      const apiError = error as { status?: number; retry_after?: number } | null;
      if (apiError?.status === 429 && typeof apiError.retry_after === 'number' && !Number.isNaN(apiError.retry_after)) {
        this.lastRetryAfterMs = apiError.retry_after * 1000;
      }
      if (this.isServerError(error)) {
        // Transient server errors (5xx/429) are not "offline": keep retrying
        // with bounded backoff that resets after success, without the
        // maxRetries stop.
        this.enqueueRetry(ops, true);
      } else if (this.isNetworkError(error)) {
        // Genuinely offline: mark it so window.online can also recover the
        // queue, and cap retries at maxRetries.
        this.online = false;
        this.enqueueRetry(ops, false);
      } else {
        console.error('Sync queue error (non-retryable):', error);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private enqueueRetry(ops: SyncOperation[], serverError: boolean): void {
    const maxOfflineQueue = 1000;
    if (this.offlineQueue.length + ops.length > maxOfflineQueue) {
      const toDrop = this.offlineQueue.length + ops.length - maxOfflineQueue;
      this.offlineQueue = this.offlineQueue.slice(toDrop);
      console.warn(`Dropped ${toDrop} oldest operations from offline queue (max ${maxOfflineQueue})`);
    }
    this.offlineQueue.push(...ops);
    void this.persistQueue();
    this.scheduleRetry(serverError);
  }

  private scheduleRetry(serverError: boolean): void {
    if (!this.active) return;
    if (!serverError && this.retryCount >= this.options.maxRetries) return;
    this.clearRetryTimer();
    let delay: number;
    if (this.lastRetryAfterMs !== undefined && !Number.isNaN(this.lastRetryAfterMs)) {
      delay = Math.min(this.lastRetryAfterMs, this.options.retryMaxDelayMs) + Math.floor(Math.random() * 500);
    } else {
      delay = Math.min(this.options.retryBaseDelayMs * Math.pow(2, this.retryCount) + Math.floor(Math.random() * 1000), this.options.retryMaxDelayMs);
    }
    this.lastRetryAfterMs = undefined; // consume it
    this.retryCount++;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      for (const op of this.offlineQueue) {
        this.pending.set(op.path, op);
      }
      this.offlineQueue = [];
      void this.persistQueue();
      void this.runSync();
    }, delay);
  }

  private clearTimers(): void {
    this.clearDebounceTimer();
    this.clearRetryTimer();
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async persistQueue(): Promise<void> {
    if (!this.options.saveQueue) return;
    try {
      await this.options.saveQueue([...this.pending.values(), ...this.offlineQueue]);
    } catch (error) {
      console.error('Sync queue: failed to persist queue:', error);
    }
  }

  private async loadPersistedQueue(): Promise<void> {
    if (!this.options.loadQueue) return;
    try {
      const loaded = await this.options.loadQueue();
      if (!loaded || loaded.length === 0) return;
      this.offlineQueue.push(...loaded);
      this.scheduleRetry(false);
    } catch (error) {
      console.error('Sync queue: failed to load persisted queue:', error);
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof TypeError) return true;
    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('offline') ||
        msg.includes('Failed to fetch')
      ) {
        return true;
      }
      // 429 Too Many Requests is a retryable network condition
      const status = (error as { status?: number }).status;
      if (status === 429) {
        return true;
      }
    }
    return false;
  }

  private isServerError(error: unknown): boolean {
    const apiError = error as { status?: number; message?: string } | null;
    const status = apiError?.status;
    if (status === 429) return true;
    if (typeof status === 'number' && status >= 500 && status < 600) return true;
    // Also check message prefix for HTTP status codes
    const msg = apiError?.message || '';
    if (/^HTTP 429:/.test(msg)) return true;
    if (/^HTTP 5\d\d:/.test(msg)) return true;
    return false;
  }
}
