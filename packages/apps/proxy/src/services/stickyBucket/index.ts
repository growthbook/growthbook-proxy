import { ClusterNode, ClusterOptions } from "ioredis";
import { StickyBucketService } from "@growthbook/growthbook";
import { Context } from "../../types";
import logger from "../logger";
import { RedisStickyBucketService } from "./RedisStickyBucketService";

// enhanced StickyBucketService, optimized for opening connections and listening to remote eval lifecycle events
export let stickyBucketService:
  | (StickyBucketService & {
      connect: () => Promise<void>;
      onEvaluate?: () => Promise<void>;
    })
  | null = null;

export interface StickyBucketSettings {
  connectionUrl?: string;
  useCluster?: boolean; // for RedisCache
  clusterRootNodesJSON?: ClusterNode[]; // for RedisCache
  clusterOptionsJSON?: ClusterOptions; // for RedisCache
  ttl?: number;
}

export const initializeStickyBucketService = async (context: Context) => {
  if (
    context.stickyBucketSettings &&
    context.stickyBucketSettings.engine !== "none"
  ) {
    if (context.stickyBucketSettings.engine === "redis") {
      logger.info("using Redis sticky bucketing");
      stickyBucketService = new RedisStickyBucketService(context.stickyBucketSettings);
      await stickyBucketService.connect();
    }
  }
};
