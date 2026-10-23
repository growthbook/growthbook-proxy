import Redis, { Cluster, ClusterNode, ClusterOptions } from "ioredis";

export type RedisClientSettings = {
  connectionUrl?: string;
  useCluster?: boolean;
  clusterRootNodes?: ClusterNode[];
  clusterOptions?: ClusterOptions;
};

/**
 * Why the settings don't name a Redis, or null if they do. There's no
 * default: remote saved groups need their own Redis with `noeviction`,
 * rather than a cache's.
 */
export function getRedisSettingsProblem({
  connectionUrl,
  useCluster = false,
  clusterRootNodes,
}: RedisClientSettings): string | null {
  if (useCluster) {
    return clusterRootNodes?.length
      ? null
      : "REMOTE_SAVED_GROUPS_CLUSTER_ROOT_NODES_JSON is required with REMOTE_SAVED_GROUPS_USE_CLUSTER";
  }
  return connectionUrl
    ? null
    : "REMOTE_SAVED_GROUPS_CONNECTION_URL is required: a Redis with maxmemory-policy noeviction, separate from caches";
}

/** An ioredis client for the loader and `redisResolver`. */
export function createRedisClient({
  connectionUrl,
  useCluster = false,
  clusterRootNodes,
  clusterOptions,
}: RedisClientSettings): Redis | Cluster {
  if (!useCluster) {
    return connectionUrl ? new Redis(connectionUrl) : new Redis();
  }
  if (!clusterRootNodes) throw new Error("No cluster root nodes");
  return new Redis.Cluster(clusterRootNodes, clusterOptions);
}
