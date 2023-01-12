import { Context } from "../../types";
import { MemoryCache } from "./MemoryCache";
import { MongoCache } from "./MongoCache";
import { RedisCache } from "./RedisCache";

export interface CacheEntry {
  payload: unknown;
  staleOn: Date;
  expiresOn: Date;
}

export interface Settings {
  staleTTL?: number;
  expiresTTL?: number;
  allowStale?: boolean;
  connectionUrl?: string;
  databaseName?: string;
  collectionName?: string;
  useAdditionalMemoryCache?: boolean;
}

export type FeaturesCache = MemoryCache | RedisCache | MongoCache | null;

export let featuresCache: FeaturesCache = null;

export const initializeCache = async (context: Context) => {
  if (context.cacheSettings.cacheEngine === "redis") {
    console.debug("using Redis cache");
    featuresCache = new RedisCache(context.cacheSettings);
    await featuresCache.connect();
  } else if (context.cacheSettings.cacheEngine === "mongo") {
    console.debug("using Mongo cache");
    featuresCache = new MongoCache(context.cacheSettings);
    await featuresCache.connect();
  } else {
    console.debug("using in-memory cache");
    featuresCache = new MemoryCache(context.cacheSettings);
  }

  Object.freeze(featuresCache);
};
