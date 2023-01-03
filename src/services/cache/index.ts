import { Context } from "../../app";
import { MemoryCache } from "./MemoryCache";
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
}

export let featuresCache: MemoryCache | RedisCache | null = null;

export const initializeCache = async (context: Context) => {
  if (context.cacheSettings.cacheEngine === "redis") {
    console.debug("using Redis cache");
    featuresCache = new RedisCache(context.cacheSettings);
    await featuresCache.connect();
  } else {
    console.debug("using in-memory cache");
    featuresCache = new MemoryCache(context.cacheSettings);
  }
};
