import Redis, { Cluster, ClusterNode, ClusterOptions } from "ioredis";

export type RedisClientSettings = {
  connectionUrl?: string;
  useCluster?: boolean;
  clusterRootNodes?: ClusterNode[];
  clusterOptions?: ClusterOptions;
};

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
