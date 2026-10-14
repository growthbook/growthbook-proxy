import { Cluster, Redis } from "ioredis";
import {
  FeatureApiResponse,
  getRemoteSavedGroups,
  redisResolver,
  SavedGroupResolver,
} from "@growthbook/growthbook";
import {
  createLoader,
  blockRulesUsingGroups,
  createRedisClient,
  getConditionRemoteGroupIds,
  getRemoteGroupEntries,
  getUnloadedGroupIds,
  readGroupAttributes,
  RemoteGroupsLoader,
} from "@growthbook/remote-groups-loader";
import { Context } from "../../types";
import logger from "../logger";

import {
  checkRemoteSavedGroupsSettings,
  RemoteSavedGroupsSettings,
  runsLoader,
} from "./settings";

export type { RemoteSavedGroupsSettings };

/** Looks up users' remote saved groups for remote evaluation. */
export let savedGroupResolver: SavedGroupResolver | null = null;
export let remoteGroupsLoader: RemoteGroupsLoader | null = null;
let redisClient: Redis | Cluster | null = null;
let lookupTimeoutMs = 1000;

export const initializeRemoteSavedGroups = (context: Context) => {
  const settings = context.remoteSavedGroupsSettings;
  if (!settings || settings.engine !== "redis") return;
  checkRemoteSavedGroupsSettings(settings);

  const redis = createRedisClient({
    connectionUrl: settings.connectionUrl,
    useCluster: settings.useCluster,
    clusterRootNodes: settings.clusterRootNodesJSON,
  });
  redis.on("error", (err) =>
    logger.warn({ err }, "Remote saved groups Redis error"),
  );
  redisClient = redis;

  if (!settings.loaderOnly) {
    const resolve = redisResolver({ sMembers: (key) => redis.smembers(key) });
    lookupTimeoutMs = settings.timeoutMs ?? 1000;
    savedGroupResolver = (args) => withTimeout(resolve(args), lookupTimeoutMs);
    logger.info("Remote saved groups enabled");
  }

  if (runsLoader(settings)) {
    remoteGroupsLoader = createLoader({
      apiHost: context.growthbookApiHost,
      apiKey: context.secretApiKey,
      redis,
      storeId: settings.storeId ?? "",
      pollIntervalMs: settings.pollIntervalMs,
      logger,
    });
    remoteGroupsLoader.start();
    logger.info("Remote saved groups loader started");
  }
};

// How long the loader's group attributes are reused before reading them again
const GROUP_ATTRIBUTES_TTL_MS = 30 * 1000;
let groupAttributes: {
  value: Promise<Record<string, string>>;
  expires: number;
} | null = null;

function getGroupAttributes(): Promise<Record<string, string>> {
  if (!redisClient) return Promise.resolve({});
  if (!groupAttributes || groupAttributes.expires < Date.now()) {
    const value = readGroupAttributes(redisClient);
    groupAttributes = { value, expires: Date.now() + GROUP_ATTRIBUTES_TTL_MS };
    // A failed read is retried on the next request.
    value.catch(() => (groupAttributes = null));
  }
  return groupAttributes.value;
}

// The remote groups each payload uses: in conditions, and in v2 entries
const usedGroups = new WeakMap<
  FeatureApiResponse,
  { conditionIds: string[]; entryIds: string[] }
>();
const prepared = new WeakMap<
  FeatureApiResponse,
  { attributes: Record<string, string>; payload: FeatureApiResponse }
>();

/**
 * Prepares a payload's remote groups for remote evaluation, using the groups
 * the loader recorded in Redis:
 * - Adds `remote` entries for groups only checked in `__gb_remoteGroupIds`
 *   conditions, so the resolver knows what to look up. Remote-eval payloads
 *   have none today: GrowthBook strips references v2 for remote evaluation.
 * - Makes rules using a group that isn't loaded in this store never match,
 *   so "not in group" can't match everyone while a group isn't loaded.
 */
export async function prepareRemoteGroups(
  payload: FeatureApiResponse | null,
): Promise<FeatureApiResponse | null> {
  if (!payload) return payload;
  let used = usedGroups.get(payload);
  if (!used) {
    used = {
      conditionIds: getConditionRemoteGroupIds([
        payload.features,
        payload.experiments,
      ]),
      entryIds: getRemoteSavedGroups(payload.savedGroups).map((g) => g.id),
    };
    usedGroups.set(payload, used);
  }
  const ids = [...new Set([...used.conditionIds, ...used.entryIds])];
  if (!ids.length) return payload;

  let attributes: Record<string, string>;
  try {
    attributes = await withTimeout(getGroupAttributes(), lookupTimeoutMs);
  } catch (err) {
    // Treated as no group loaded, so every remote rule fails closed.
    logger.warn({ err }, "Could not read remote saved group attributes");
    return blockRulesUsingGroups(payload, ids);
  }
  const cached = prepared.get(payload);
  if (cached?.attributes === attributes) return cached.payload;

  const withEntries = used.entryIds.length
    ? payload
    : {
        ...payload,
        savedGroups: {
          ...payload.savedGroups,
          ...getRemoteGroupEntries(used.conditionIds, attributes),
        },
      };
  const result = blockRulesUsingGroups(
    withEntries,
    getUnloadedGroupIds(ids, attributes),
  );
  prepared.set(payload, { attributes, payload: result });
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Remote saved group lookup timed out")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
