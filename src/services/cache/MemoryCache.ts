import {CacheEntry, Settings} from "./index";

export class MemoryCache {
  private readonly store: Map<string, CacheEntry>;
  private readonly staleTTL: number;
  private readonly expiresTTL: number;
  public readonly allowStale: boolean;

  public constructor({
    staleTTL = 60, // 1 minute
    expiresTTL = 10 * 60, // 10 minutes
    allowStale = true,
  }: Settings = {}) {
    this.store = new Map();
    this.staleTTL = staleTTL * 1000;
    this.expiresTTL = expiresTTL * 1000;
    this.allowStale = allowStale;
  }

  public async get(key: string): Promise<CacheEntry | undefined> {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (!this.allowStale && entry.staleOn < new Date()) {
      return undefined;
    }
    if (entry.expiresOn < new Date()) {
      return undefined;
    }
    return entry;
  }

  public async set(key: string, payload: unknown) {
    this.store.set(key, {
      payload,
      staleOn: new Date(Date.now() + this.staleTTL),
      expiresOn: new Date(Date.now() + this.expiresTTL),
    });
  }

  public async dangerouslySetAll(
    payload: unknown,
    keyedCallback?: (key: string) => void
  ) {
    for (const [key] of this.store) {
      this.store.set(key, {
        payload,
        staleOn: new Date(Date.now() + this.staleTTL),
        expiresOn: new Date(Date.now() + this.expiresTTL),
      });
      if (keyedCallback !== undefined) {
        keyedCallback(key);
      }
    }
  }
}
