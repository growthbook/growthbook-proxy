import { createClient } from "redis";
import { CacheEntry, Settings } from "./index";

export class RedisCache {
  private client: ReturnType<typeof createClient> | undefined;
  private readonly connectionUrl: string | undefined;
  private readonly staleTTL: number;
  private readonly expiresTTL: number;
  public readonly allowStale: boolean;

  public constructor({
    staleTTL = 60, // 1 minute
    expiresTTL = 10 * 60, // 10 minutes
    allowStale = true,
    connectionUrl,
  }: Settings = {}) {
    this.connectionUrl = connectionUrl;
    this.staleTTL = staleTTL * 1000;
    this.expiresTTL = expiresTTL * 1000;
    this.allowStale = allowStale;
  }

  public async connect() {
    this.client = this.connectionUrl
      ? createClient({ url: this.connectionUrl })
      : createClient();
    if (this.client) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      this.client.on("error", (e: any) => {
        console.error("Error connecting to redis client", e);
      });
      await this.client.connect();
    }
  }

  public async get(key: string): Promise<CacheEntry | undefined> {
    if (!this.client) {
      throw new Error("No redis client");
    }
    const entryRaw = await this.client.get(key);
    if (!entryRaw) {
      return undefined;
    }
    let entry = undefined;
    try {
      entry = JSON.parse(entryRaw);
    } catch (e) {
      console.error("unable to parse cache json");
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
    if (!this.client) {
      throw new Error("No redis client");
    }
    const entry = {
      payload,
      staleOn: new Date(Date.now() + this.staleTTL),
      expiresOn: new Date(Date.now() + this.expiresTTL),
    };
    await this.client.set(key, JSON.stringify(entry), {
      EX: this.expiresTTL / 1000,
    });
  }
}
