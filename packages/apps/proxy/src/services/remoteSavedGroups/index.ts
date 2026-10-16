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
  GROUP_ATTRIBUTES_KEY,
  RemoteGroupsLoader,
  UPDATED_AT_FIELD,
  warnIfRedisCanEvict,
} from "@growthbook/remote-saved-groups-redis-loader";
import { Context } from "../../types";
import logger from "../logger";
import {
  blockRulesUsingGroups,
  getConditionRemoteGroupIds,
  getRemoteGroupEntries,
  getUnloadedGroupIds,
  withGroupsDateUpdated,
} from "./entries";
import {
  checkRemoteSavedGroupsSettings,
  RemoteSavedGroupsSettings,
  runsLoader,
} from "./settings";

export type { RemoteSavedGroupsSettings };

/** Looks up users' remote saved groups for remote evaluation. */
export let savedGroupResolver: SavedGroupResolver | null = null;
export let remoteGroupsLoader: RemoteGroupsLoader | null = null;
let lookupClient: Redis | Cluster | null = null;
let lookupTimeoutMs = 1000;

export const initializeRemoteSavedGroups = (context: Context) => {
  const settings = context.remoteSavedGroupsSettings;
  if (!settings || settings.engine !== "redis") return;
  checkRemoteSavedGroupsSettings(settings);

  const redisSettings = {
    connectionUrl: settings.connectionUrl,
    useCluster: settings.useCluster,
    clusterRootNodes: settings.clusterRootNodesJSON,
  };
  const connect = (purpose: string) => {
    const client = createRedisClient(redisSettings);
    client.on("error", (err) =>
      logger.warn({ err }, `Remote saved groups Redis error (${purpose})`),
    );
    return client;
  };

  if (!settings.loaderOnly) {
    const redis = connect("lookups");
    lookupClient = redis;
    const resolve = redisResolver({ sMembers: (key) => redis.smembers(key) });
    lookupTimeoutMs = settings.timeoutMs ?? 1000;
    savedGroupResolver = (args) => withTimeout(resolve(args), lookupTimeoutMs);
    void warnIfRedisCanEvict(redis, logger);
    logger.info("Remote saved groups enabled");
  }

  if (runsLoader(settings)) {
    // Its own connection, so its bulk writes don't queue ahead of lookups.
    const redis = connect("loader");
    remoteGroupsLoader = createLoader({
      apiHost: context.growthbookApiHost,
      apiKey: context.secretApiKey,
      redis,
      storeId: settings.storeId ?? "",
      pollIntervalMs: settings.pollIntervalMs,
      logger,
    });
    if (settings.loaderOnly) void warnIfRedisCanEvict(redis, logger);
    remoteGroupsLoader.start();
    logger.info("Remote saved groups loader started");
  }
};

/** What the loader recorded about the groups in Redis. */
type GroupState = {
  /** Each loaded group's attribute */
  attributes: Record<string, string>;
  /** When any group's members last changed */
  updatedAt: string | null;
};

// How long the loader's group state is reused before reading it again
const GROUP_STATE_TTL_MS = 30 * 1000;
let groupState: {
  value: Promise<GroupState>;
  expires: number;
} | null = null;

function getGroupState(): Promise<GroupState> {
  const redis = lookupClient;
  if (!redis) return Promise.resolve({ attributes: {}, updatedAt: null });
  if (!groupState || groupState.expires < Date.now()) {
    // One read, so the attributes and change time always match.
    const value = redis.hgetall(GROUP_ATTRIBUTES_KEY).then((hash) => {
      const { [UPDATED_AT_FIELD]: updatedAt = null, ...attributes } = hash;
      return { attributes, updatedAt };
    });
    groupState = { value, expires: Date.now() + GROUP_STATE_TTL_MS };
    // A failed read is retried on the next request.
    value.catch(() => (groupState = null));
  }
  return groupState.value;
}

// The remote groups each payload uses: in conditions, and in v2 entries
const usedGroups = new WeakMap<
  FeatureApiResponse,
  { conditionIds: string[]; entryIds: string[] }
>();
const prepared = new WeakMap<
  FeatureApiResponse,
  { state: GroupState; payload: FeatureApiResponse }
>();

/**
 * Prepares a payload's remote groups for remote evaluation, using what the
 * loader recorded in Redis:
 * - Adds `remote` entries for groups only checked in `__gb_remoteGroupIds`
 *   conditions, so the resolver knows what to look up. Remote-eval payloads
 *   have none today: GrowthBook strips references v2 for remote evaluation.
 * - Makes rules using a group that isn't loaded in this store never match,
 *   so "not in group" can't match everyone while a group isn't loaded.
 * - Sets a `dateUpdated` that changes whenever the payload or the groups
 *   change, since SDKs ignore a refetch with an unchanged `dateUpdated`.
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

  let state: GroupState;
  try {
    state = await withTimeout(getGroupState(), lookupTimeoutMs);
  } catch (err) {
    // Treated as no group loaded, so every remote rule fails closed.
    logger.warn({ err }, "Could not read remote saved group attributes");
    return blockRulesUsingGroups(payload, ids);
  }
  const cached = prepared.get(payload);
  if (cached?.state === state) return cached.payload;

  const withEntries = used.entryIds.length
    ? payload
    : {
        ...payload,
        savedGroups: {
          ...payload.savedGroups,
          ...getRemoteGroupEntries(used.conditionIds, state.attributes),
        },
      };
  const result = withGroupsDateUpdated(
    blockRulesUsingGroups(
      withEntries,
      getUnloadedGroupIds(ids, state.attributes),
    ),
    state.updatedAt,
  );
  prepared.set(payload, { state, payload: result });
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
