import { createClient, type RedisClientType } from "redis";

export type AttemptState = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
};

export interface LoginAttemptStore {
  initialize(): Promise<void>;
  get(key: string): Promise<AttemptState | null>;
  set(key: string, state: AttemptState, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}

class InMemoryLoginAttemptStore implements LoginAttemptStore {
  private readonly entries = new Map<string, { state: AttemptState; expiresAt: number }>();

  async initialize(): Promise<void> {}

  async get(key: string): Promise<AttemptState | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.state;
  }

  async set(key: string, state: AttemptState, ttlSeconds: number): Promise<void> {
    const safeTtlSeconds = Math.max(1, Math.floor(ttlSeconds));
    this.entries.set(key, {
      state,
      expiresAt: Date.now() + safeTtlSeconds * 1000
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

class RedisLoginAttemptStore implements LoginAttemptStore {
  private readonly prefix = "auth:attempts:";
  private readonly client: RedisClientType;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
  }

  async initialize(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async get(key: string): Promise<AttemptState | null> {
    const raw = await this.client.get(this.redisKey(key));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as AttemptState;
      if (
        typeof parsed.failures !== "number" ||
        typeof parsed.firstFailureAt !== "number" ||
        typeof parsed.lockedUntil !== "number"
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async set(key: string, state: AttemptState, ttlSeconds: number): Promise<void> {
    const safeTtlSeconds = Math.max(1, Math.floor(ttlSeconds));
    await this.client.set(this.redisKey(key), JSON.stringify(state), { EX: safeTtlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.redisKey(key));
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private redisKey(key: string) {
    return `${this.prefix}${key}`;
  }
}

export function createInMemoryLoginAttemptStore(): LoginAttemptStore {
  return new InMemoryLoginAttemptStore();
}

export function createRedisLoginAttemptStore(redisUrl: string): LoginAttemptStore {
  return new RedisLoginAttemptStore(redisUrl);
}
