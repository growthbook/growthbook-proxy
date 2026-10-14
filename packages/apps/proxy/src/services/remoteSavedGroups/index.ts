import { Cluster, Redis } from "ioredis";
import {
  FeatureApiResponse,
  getRemoteSavedGroups,
  redisResolver,
  SavedGroupResolver,
} from "@growthbook/growthbook";
import {
  createLoader,
  createRedisClient,
  getConditionRemoteGroupIds,
  getRemoteGroupEntries,
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

const conditionGroupIds = new WeakMap<FeatureApiResponse, string[]>();
const withEntries = new WeakMap<
  FeatureApiResponse,
  { attributes: Record<string, string>; payload: FeatureApiResponse }
>();

/**
 * Remote-eval payloads have no `remote` entries today: GrowthBook strips
 * references v2 for remote evaluation, so remote groups are only checked in
 * `__gb_remoteGroupIds` conditions. This adds entries for those groups, using
 * the attributes the loader recorded in Redis, so the resolver knows what to
 * look up. Payloads that already have entries are returned as they are.
 */
export async function addRemoteGroupEntries(
  payload: FeatureApiResponse | null,
): Promise<FeatureApiResponse | null> {
  if (!payload || getRemoteSavedGroups(payload.savedGroups).length) {
    return payload;
  }
  let ids = conditionGroupIds.get(payload);
  if (!ids) {
    ids = getConditionRemoteGroupIds([payload.features, payload.experiments]);
    conditionGroupIds.set(payload, ids);
  }
  if (!ids.length) return payload;

  let attributes: Record<string, string>;
  try {
    attributes = await withTimeout(getGroupAttributes(), lookupTimeoutMs);
  } catch (err) {
    // Without entries nothing is looked up, so remote rules fail closed.
    logger.warn({ err }, "Could not read remote saved group attributes");
    return payload;
  }
  const cached = withEntries.get(payload);
  if (cached?.attributes === attributes) return cached.payload;

  const result = {
    ...payload,
    savedGroups: {
      ...payload.savedGroups,
      ...getRemoteGroupEntries(ids, attributes),
    },
  };
  withEntries.set(payload, { attributes, payload: result });
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
