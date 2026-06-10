export type RateLimitRequest = {
  ip?: string | null;
  socket?: {
    remoteAddress?: string | null;
  };
  header(name: string): string | undefined;
};

export type RateLimitResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): RateLimitResponse;
  json(body: unknown): unknown;
};

export type RateLimitStoreEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = Map<string, RateLimitStoreEntry>;

export type RateLimitOptions = {
  windowMs: number;
  limit: number;
  keyFn: (req: RateLimitRequest) => string;
  message: string;
};

export type RateLimitDependencies = {
  now?: () => number;
  store?: RateLimitStore;
  sweepIntervalMs?: number;
};

export type RateLimiter = {
  handle(req: RateLimitRequest, res: RateLimitResponse, next: () => void): void;
  getEntryCount(): number;
  clear(): void;
};

function sweepExpiredEntries(store: RateLimitStore, now: number, lastSweepAt: { value: number }, sweepIntervalMs: number) {
  if (now - lastSweepAt.value < sweepIntervalMs) return;
  lastSweepAt.value = now;

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function createRateLimiter(options: RateLimitOptions, dependencies: RateLimitDependencies = {}): RateLimiter {
  const store = dependencies.store ?? new Map<string, RateLimitStoreEntry>();
  const now = dependencies.now ?? (() => Date.now());
  const sweepIntervalMs = dependencies.sweepIntervalMs ?? options.windowMs;
  const lastSweepAt = { value: 0 };

  function handle(req: RateLimitRequest, res: RateLimitResponse, next: () => void) {
    const currentTime = now();
    sweepExpiredEntries(store, currentTime, lastSweepAt, sweepIntervalMs);

    const key = options.keyFn(req);
    const current = store.get(key);

    if (!current || current.resetAt <= currentTime) {
      store.set(key, { count: 1, resetAt: currentTime + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.limit) {
      const retryAfterSeconds = Math.ceil((current.resetAt - currentTime) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      res.status(429).json({ error: options.message });
      return;
    }

    current.count += 1;
    store.set(key, current);
    next();
  }

  return {
    handle,
    getEntryCount: () => store.size,
    clear: () => store.clear()
  };
}

export function getClientRateLimitKey(req: RateLimitRequest, trustProxy: boolean | number) {
  const remoteAddress = req.socket?.remoteAddress ?? null;
  if (trustProxy) return req.ip ?? remoteAddress ?? 'unknown-ip';
  return remoteAddress ?? 'unknown-ip';
}
