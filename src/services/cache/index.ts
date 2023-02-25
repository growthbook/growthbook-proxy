import { Context } from "../../types";
import logger from "../logger";
import { MemoryCache } from "./MemoryCache";
import { MongoCache } from "./MongoCache";
import { RedisCache } from "./RedisCache";

export interface CacheEntry {
  payload: unknown;
  staleOn: Date;
  expiresOn: Date;
}

export interface CacheSettings {
  staleTTL?: number;
  expiresTTL?: number;
  allowStale?: boolean;
  connectionUrl?: string; // for MongoCache and RedisCache
  databaseName?: string; // for MongoCache
  collectionName?: string; // for MongoCache
  useAdditionalMemoryCache?: boolean;
  publishPayloadToChannel?: boolean; // for RedisCache pub/sub
}

export type FeaturesCache = MemoryCache | RedisCache | MongoCache | null;

export let featuresCache: FeaturesCache = null;

export const initializeCache = async (context: Context) => {
  if (context.enableCache && context.cacheSettings) {
    if (context.cacheSettings.cacheEngine === "redis") {
      logger.info("using Redis cache");
      featuresCache = new RedisCache(context.cacheSettings, context);
      await featuresCache.connect();
    } else if (context.cacheSettings.cacheEngine === "mongo") {
      logger.info("using Mongo cache");
      featuresCache = new MongoCache(context.cacheSettings);
      await featuresCache.connect();
    } else {
      logger.info("using in-memory cache");
      featuresCache = new MemoryCache(context.cacheSettings);
    }
  }
  Object.freeze(featuresCache);
};
