import { CacheEntry, CacheSettings } from "./index";
import { CacheRefreshStrategy } from "../../types";

export class MemoryCache {
  private readonly store: Map<string, CacheEntry>;
  private readonly staleTTL: number;
  private readonly expiresTTL: number | "never";
  public readonly allowStale: boolean;
  public readonly cacheRefreshStrategy: CacheRefreshStrategy;

  public constructor({
    staleTTL = 60, // 1 minute
    expiresTTL = 10 * 60, // 10 minutes
    allowStale = true,
    cacheRefreshStrategy,
  }: CacheSettings = {}) {
    this.store = new Map();
    this.staleTTL = staleTTL * 1000;
    this.expiresTTL = expiresTTL === "never" ? "never" : expiresTTL * 1000;
    this.allowStale = allowStale;
    this.cacheRefreshStrategy = cacheRefreshStrategy!;
  }

  public async get(key: string): Promise<CacheEntry | undefined> {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    entry.staleOn = new Date(entry.staleOn);
    if (entry.expiresOn) {
      entry.expiresOn = new Date(entry.expiresOn);
    }

    // With "none" strategy, never eject based on staleness or expiration
    if (this.cacheRefreshStrategy === "none") {
      return entry;
    }

    // With "stale-while-revalidate" strategy, allowStale controls whether we return stale but not-yet-expired entries
    if (this.cacheRefreshStrategy === "stale-while-revalidate" && !this.allowStale && entry.staleOn < new Date()) {
      return undefined;
    }
    if (entry.expiresOn && entry.expiresOn < new Date()) {
      return undefined;
    }
    return entry;
  }

  public async set(key: string, payload: unknown) {
    this.store.set(key, {
      payload,
      staleOn: new Date(Date.now() + this.staleTTL),
      expiresOn: this.expiresTTL === "never" 
        ? undefined 
        : new Date(Date.now() + this.expiresTTL),
    });
  }

  public async getStatus() {
    return "up";
  }
}
