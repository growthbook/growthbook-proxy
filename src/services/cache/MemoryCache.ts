export interface CacheEntry {
  payload: any;
  expires: Date;
}

export class MemoryCache {
  private store: Map<string, CacheEntry>;
  private readonly ttl: number;

  public constructor(
    ttl: number = 60 // 1 minute
  ) {
    this.store = new Map();
    this.ttl = ttl * 1000;
  }

  public async get(key: string, returnStale: boolean = false): Promise<CacheEntry | undefined> {
    const entry = this.store.get(key);
    if (entry && entry.expires < (new Date()) && !returnStale) {
      return undefined;
    }
    return entry;
  }

  public async set(key: string, payload: any) {
    this.store.set(key, {
      payload,
      expires: new Date(Date.now() + this.ttl),
    });
  }

  public async dangerouslySetAll(payload: any, keyedCallback?: (key: string) => void) {
    console.log("set", payload)
    if (!this.store.size) {
      // todo: set empty store
    }
    for (const [key, value] of this.store) {
      this.store.set(key, {
        payload,
        expires: new Date(Date.now() + this.ttl),
      });
      console.log('set key', key);
      if (keyedCallback !== undefined) {
        console.log("try callback")
        keyedCallback(key);
      }
    }
  }
}
