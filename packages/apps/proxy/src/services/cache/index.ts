import { ClusterNode, ClusterOptions, SentinelConnectionOptions } from "ioredis";

import { Context } from "../../types";
import logger from "../logger";
import type { MemoryCache } from "./MemoryCache";
import type { RedisCache } from "./RedisCache";
import type { MongoCache } from "./MongoCache";

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
  useCluster?: boolean; // for RedisCache
  clusterRootNodesJSON?: ClusterNode[]; // for RedisCache
  clusterOptionsJSON?: ClusterOptions; // for RedisCache
  useSentinel?: boolean; // for RedisCache
  sentinelConnectionOptionsJSON?: SentinelConnectionOptions; // for RedisCache
}

export type FeaturesCache = MemoryCache | RedisCache | MongoCache | null;

export let featuresCache: FeaturesCache = null;

export const initializeCache = async (context: Context) => {
  if (context.enableCache && context.cacheSettings) {
    if (context.cacheSettings.cacheEngine === "redis") {
      logger.info("using Redis cache");
      const { RedisCache } = await import("./RedisCache");
      featuresCache = new RedisCache(context.cacheSettings, context);
      await featuresCache?.connect?.();
    } else if (context.cacheSettings.cacheEngine === "mongo") {
      logger.info("using Mongo cache");
      const { MongoCache } = await import("./MongoCache");
      featuresCache = new MongoCache(context.cacheSettings);
      await featuresCache?.connect?.();
    } else {
      logger.info("using in-memory cache");
      const { MemoryCache } = await import("./MemoryCache");
      featuresCache = new MemoryCache(context.cacheSettings);
    }
  }
  Object.freeze(featuresCache);
};
