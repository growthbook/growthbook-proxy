import { ClusterNode } from "ioredis";
import {
  getRedisSettingsProblem,
  getStoreIdProblem,
} from "@growthbook/remote-saved-groups-redis-loader";

export interface RemoteSavedGroupsSettings {
  connectionUrl?: string;
  useCluster?: boolean;
  clusterRootNodesJSON?: ClusterNode[];
  /** How long a lookup may take before the user is evaluated as in no remote groups. */
  timeoutMs?: number;
  /** Whether this instance runs the loader. */
  runLoader?: boolean;
  pollIntervalMs?: number;
  /**
   * How often to check Redis for member changes, to tell streaming
   * remote-eval clients to refetch. 0 turns the check off.
   */
  updateCheckIntervalMs?: number;
  /** Only run the loader: no proxying or evaluation. */
  loaderOnly?: boolean;
  /**
   * The data store's ID in load reports, such as `redis-us-east`. One per
   * Redis. Required when this instance runs the loader.
   */
  storeId?: string;
}

/** Whether this instance runs the loader. */
export function runsLoader(settings: RemoteSavedGroupsSettings): boolean {
  return !!(settings.runLoader || settings.loaderOnly);
}

/**
 * Throws at startup when settings are missing: the Redis to use, and the
 * store ID when this instance runs the loader.
 */
export function checkRemoteSavedGroupsSettings(
  settings: RemoteSavedGroupsSettings,
): void {
  const redisProblem = getRedisSettingsProblem({
    connectionUrl: settings.connectionUrl,
    useCluster: settings.useCluster,
    clusterRootNodes: settings.clusterRootNodesJSON,
  });
  if (redisProblem) throw new Error(redisProblem);
  const interval = settings.updateCheckIntervalMs;
  if (interval !== undefined && !(interval >= 0)) {
    throw new Error(
      "REMOTE_SAVED_GROUPS_UPDATE_CHECK_INTERVAL_MS: expected milliseconds, or 0 to turn it off",
    );
  }
  if (!runsLoader(settings)) return;
  const problem = getStoreIdProblem(settings.storeId);
  if (problem) {
    throw new Error(
      `REMOTE_SAVED_GROUPS_STORE_ID: ${problem}. The remote saved groups loader needs one ID per Redis; set REMOTE_SAVED_GROUPS_LOADER=false on instances that don't load.`,
    );
  }
}
