import { Collection, MongoClient } from "mongodb";
import logger from "../logger";
import { MemoryCache } from "./MemoryCache";
import { CacheEntry, CacheSettings } from "./index";

export class MongoCache {
  private client: MongoClient | undefined;
  private collection: Collection | undefined;
  private readonly memoryCacheClient: MemoryCache | undefined;
  private readonly connectionUrl: string | undefined;
  private readonly databaseName: string | undefined;
  private readonly collectionName: string | undefined;
  private readonly staleTTL: number;
  private readonly expiresTTL: number;
  public readonly allowStale: boolean;

  public constructor({
    staleTTL = 60, //         1 minute
    expiresTTL = 10 * 60, //  10 minutes
    allowStale = true,
    connectionUrl,
    databaseName = "proxy",
    collectionName = "cache",
    useAdditionalMemoryCache,
  }: CacheSettings = {}) {
    this.connectionUrl = connectionUrl;
    this.databaseName = databaseName;
    this.collectionName = collectionName;
    this.staleTTL = staleTTL * 1000;
    this.expiresTTL = expiresTTL * 1000;
    this.allowStale = allowStale;

    // wrap the RedisCache in a MemoryCache to avoid hitting Redis on every request
    if (useAdditionalMemoryCache) {
      this.memoryCacheClient = new MemoryCache({
        expiresTTL: 1, //  1 second,
        allowStale: false,
      });
    }
  }

  public async connect() {
    if (!this.databaseName || !this.collectionName) {
      throw new Error("No database or collection name");
    }
    this.client = new MongoClient(this.connectionUrl ?? "");
    if (this.client) {
      this.client.on("error", (e: Error) => {
        logger.error(e, "Error connecting to mongo client");
      });
      await this.client.connect();
      const db = this.client.db(this.databaseName);
      this.collection = db.collection(this.collectionName);
      await this.collection.createIndex({ key: 1 }, { unique: true });
      await this.collection.createIndex(
        { "entry.expiresOn": 1 },
        { expireAfterSeconds: this.expiresTTL / 1000 }
      );
    }
  }

  public async get(key: string): Promise<CacheEntry | undefined> {
    if (!this.collection) {
      throw new Error("No mongo collection");
    }
    let entry = undefined;

    // try fetching from MemoryCache first
    if (this.memoryCacheClient) {
      const memoryCacheEntry = await this.memoryCacheClient.get(key);
      if (memoryCacheEntry && memoryCacheEntry.expiresOn > new Date()) {
        entry = memoryCacheEntry.payload as CacheEntry;
      }
    }

    // if cache miss from MemoryCache, fetch from Mongo
    if (!entry) {
      const doc = await this.collection.findOne({ key });
      if (!doc) {
        return undefined;
      }
      if (!doc.entry) {
        logger.error("MongoCache: unable to parse doc");
        return undefined;
      }
      try {
        const docEntry = doc.entry;
        docEntry.payload = JSON.parse(docEntry.payload as string);
        entry = docEntry;
      } catch (e) {
        logger.error("MongoCache: unable to parse doc entry payload");
      }
    }

    if (!entry) {
      return undefined;
    }
    if (!this.allowStale && entry.staleOn < new Date()) {
      return undefined;
    }
    if (entry.expiresOn < new Date()) {
      return undefined;
    }

    // refresh MemoryCache
    if (this.memoryCacheClient) {
      await this.memoryCacheClient.set(key, entry);
    }
    return entry;
  }

  public async set(key: string, payload: unknown) {
    if (!this.collection) {
      throw new Error("No mongo client");
    }
    const entry = {
      payload,
      staleOn: new Date(Date.now() + this.staleTTL),
      expiresOn: new Date(Date.now() + this.expiresTTL),
    };
    const docEntry = { ...entry };
    docEntry.payload = JSON.stringify(docEntry.payload) as string;
    const doc = { key, entry: docEntry };
    await this.collection.replaceOne({ key }, doc, {
      upsert: true,
    });

    // refresh MemoryCache
    if (this.memoryCacheClient) {
      await this.memoryCacheClient.set(key, entry);
    }
  }

  public getClient() {
    return this.client;
  }
}
