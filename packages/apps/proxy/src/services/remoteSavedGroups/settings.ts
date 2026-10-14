import { ClusterNode } from "ioredis";
import { getStoreIdProblem } from "@growthbook/remote-groups-loader";

export interface RemoteSavedGroupsSettings {
  connectionUrl?: string;
  useCluster?: boolean;
  clusterRootNodesJSON?: ClusterNode[];
  /** How long a lookup may take before the user is evaluated as in no remote groups. */
  timeoutMs?: number;
  /** Whether this instance runs the loader. */
  runLoader?: boolean;
  pollIntervalMs?: number;
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

/** Throws at startup when the loader would run with an invalid store ID. */
export function checkRemoteSavedGroupsSettings(
  settings: RemoteSavedGroupsSettings,
): void {
  if (!runsLoader(settings)) return;
  const problem = getStoreIdProblem(settings.storeId);
  if (problem) {
    throw new Error(
      `REMOTE_SAVED_GROUPS_STORE_ID: ${problem}. The remote saved groups loader needs one ID per Redis; set REMOTE_SAVED_GROUPS_LOADER=false on instances that don't load.`,
    );
  }
}
