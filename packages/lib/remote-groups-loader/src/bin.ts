#!/usr/bin/env node
import { createLoader, getStoreIdProblem } from "./loader";
import { createRedisClient } from "./client";

// Runs the loader on its own, with the same settings as the GrowthBook Proxy.
const env = process.env;
const apiHost = env.GROWTHBOOK_API_HOST;
const apiKey = env.SECRET_API_KEY;
if (!apiHost || !apiKey) {
  console.error("GROWTHBOOK_API_HOST and SECRET_API_KEY are required");
  process.exit(1);
}
const storeId = env.REMOTE_SAVED_GROUPS_STORE_ID ?? "";
const storeIdProblem = getStoreIdProblem(storeId);
if (storeIdProblem) {
  console.error(`REMOTE_SAVED_GROUPS_STORE_ID: ${storeIdProblem}`);
  process.exit(1);
}

const redis = createRedisClient({
  connectionUrl: env.REMOTE_SAVED_GROUPS_CONNECTION_URL,
  useCluster: ["true", "1"].includes(
    (env.REMOTE_SAVED_GROUPS_USE_CLUSTER ?? "").toLowerCase(),
  ),
  clusterRootNodes: env.REMOTE_SAVED_GROUPS_CLUSTER_ROOT_NODES_JSON
    ? JSON.parse(env.REMOTE_SAVED_GROUPS_CLUSTER_ROOT_NODES_JSON)
    : undefined,
});
const loader = createLoader({
  apiHost,
  apiKey,
  redis,
  storeId,
  pollIntervalMs: env.REMOTE_SAVED_GROUPS_POLL_INTERVAL_MS
    ? parseInt(env.REMOTE_SAVED_GROUPS_POLL_INTERVAL_MS)
    : undefined,
});
loader.start();

const shutdown = async () => {
  await loader.stop();
  redis.disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
