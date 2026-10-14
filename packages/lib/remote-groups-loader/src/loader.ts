import { randomUUID } from "crypto";
import { RemoteGroupCsvParser } from "@growthbook/remote-saved-groups";
import { ApiError, GrowthBookApi, LoadStatus, RemoteGroup } from "./api";
import {
  GROUP_ATTRIBUTES_KEY,
  GROUPS_KEY,
  groupKey,
  LoaderRedis,
  lockKey,
  memberKey,
  STORE_ID_KEY,
  stagingKey,
} from "./redis";

/** A pino-style logger. */
export type LoaderLogger = {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
};

export type LoaderOptions = {
  /** GrowthBook's API host, like `https://api.growthbook.io`. */
  apiHost: string;
  /** A GrowthBook secret API key. Reporting loads needs publish access. */
  apiKey: string;
  redis: LoaderRedis;
  /** How often to check for new uploads. Defaults to 5 minutes. */
  pollIntervalMs?: number;
  logger?: LoaderLogger;
};

/** A group as loaded into Redis. */
type LoadedGroup = { version: number; attributeKey: string };

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 60 * 1000;
const LOCK_RENEW_MS = 20 * 1000;
// A load that dies leaves its staging set behind until this expires.
const STAGING_TTL_SECONDS = 24 * 60 * 60;
const BATCH_SIZE = 1000;

// Renews or releases the lock only while this loader still holds it.
const RENEW_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

class LoadAbortedError extends Error {}

const consoleLogger: LoaderLogger = {
  info: (obj, msg) => console.info(msg, obj),
  warn: (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

/**
 * Keeps Redis in step with GrowthBook's remote saved groups: polls for each
 * group's current upload, loads it, and clears groups that have none. Loaders
 * sharing a Redis take turns per group with a lock.
 */
export class RemoteGroupsLoader {
  private readonly api: GrowthBookApi;
  private readonly redis: LoaderRedis;
  private readonly pollIntervalMs: number;
  private readonly logger: LoaderLogger;
  private storeId: string | null = null;
  // Versions this loader found invalid, so they're not downloaded again
  private readonly invalidVersions = new Map<string, number>();
  private warnedReportAccess = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private started = false;
  private stopping = false;

  constructor({
    apiHost,
    apiKey,
    redis,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    logger = consoleLogger,
  }: LoaderOptions) {
    this.api = new GrowthBookApi(apiHost, apiKey);
    this.redis = redis;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger;
  }

  /** Polls now, then every `pollIntervalMs` after each poll finishes. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    this.schedule(0);
  }

  /** Stops polling. A load in progress stops at its next batch. */
  async stop(): Promise<void> {
    this.started = false;
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
  }

  /** Brings every group up to date once. */
  async poll(): Promise<void> {
    const storeId = await this.getStoreId();
    const groups = await this.api.listRemoteGroups();
    const loaded = await this.getLoadedGroups();
    const listed = new Set(groups.map((g) => g.id));

    for (const group of groups) {
      if (this.stopping) return;
      await this.syncGroup(group, loaded.get(group.id), storeId).catch((e) =>
        this.logError(e, group.id),
      );
    }

    // Groups deleted in GrowthBook, or no longer remote
    for (const id of loaded.keys()) {
      if (listed.has(id)) continue;
      await this.withLock(id, () => this.clearGroup(id)).catch((e) =>
        this.logError(e, id),
      );
    }
  }

  private schedule(delayMs: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.running = this.poll()
        .catch((e) =>
          this.logger.error({ err: e }, "Remote groups poll failed"),
        )
        .finally(() => {
          this.running = null;
          if (this.started) this.schedule(this.pollIntervalMs);
        });
    }, delayMs);
  }

  private async syncGroup(
    group: RemoteGroup,
    loaded: LoadedGroup | undefined,
    storeId: string,
  ) {
    const upload = group.currentUpload;
    if (!upload) {
      if (loaded)
        await this.withLock(group.id, () => this.clearGroup(group.id));
      return;
    }
    if (isLoaded(group, loaded)) return;
    if (this.invalidVersions.get(group.id) === upload.version) return;

    await this.withLock(group.id, async (assertActive) => {
      // Another loader may have loaded it before this one took the lock.
      const current = (await this.getLoadedGroups()).get(group.id);
      if (isLoaded(group, current)) return;
      await this.loadGroup(group, upload, current, storeId, assertActive);
    });
  }

  private async loadGroup(
    group: RemoteGroup,
    upload: NonNullable<RemoteGroup["currentUpload"]>,
    current: LoadedGroup | undefined,
    storeId: string,
    assertActive: () => void,
  ) {
    const { id } = group;
    const { version } = upload;
    this.logger.info({ savedGroupId: id, version }, "Loading remote group");
    await this.report(id, version, storeId, { type: "loading" });

    const staging = stagingKey(id, version);
    try {
      await this.redis.unlink(staging);
      const result = await this.readUpload(
        group,
        upload,
        staging,
        assertActive,
      );
      if (result.type === "invalid") {
        await this.redis.unlink(staging);
        this.invalidVersions.set(id, version);
        this.logger.warn(
          { savedGroupId: id, version, errors: result.errors },
          "Remote group upload is invalid; keeping the previous version",
        );
        await this.report(id, version, storeId, {
          type: "invalid",
          invalidLineCount: result.invalidLineCount,
          errors: result.errors,
        });
        return;
      }

      await this.updateMembers(
        id,
        current && {
          key: groupKey(id, current.version),
          attributeKey: current.attributeKey,
        },
        { key: staging, attributeKey: group.attributeKey },
        assertActive,
      );
      const rowCount = await this.redis.scard(staging);
      await this.redis.hset(GROUPS_KEY, id, String(version));
      await this.redis.hset(GROUP_ATTRIBUTES_KEY, id, group.attributeKey);
      // Replaces the old set when only the attribute changed.
      await this.redis.rename(staging, groupKey(id, version));
      await this.redis.persist(groupKey(id, version));
      if (current && current.version !== version) {
        await this.redis.unlink(groupKey(id, current.version));
      }
      this.invalidVersions.delete(id);
      this.logger.info(
        { savedGroupId: id, version, rowCount },
        "Loaded remote group",
      );
      await this.report(id, version, storeId, { type: "loaded", rowCount });
    } catch (e) {
      if (!(e instanceof LoadAbortedError)) {
        await this.report(id, version, storeId, {
          type: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
      throw e;
    }
  }

  /** Streams the upload into `staging`, which expires unless the load finishes. */
  private async readUpload(
    group: RemoteGroup,
    upload: NonNullable<RemoteGroup["currentUpload"]>,
    staging: string,
    assertActive: () => void,
  ) {
    let batch: string[] = [];
    const parser = new RemoteGroupCsvParser({
      attributeKey: group.attributeKey,
      numeric: upload.numeric,
      onId: (id) => batch.push(id),
    });
    const flush = async () => {
      if (!batch.length) return;
      const ids = batch;
      batch = [];
      await this.redis.sadd(staging, ...ids);
      await this.redis.expire(staging, STAGING_TTL_SECONDS);
    };

    const body = await this.api.downloadUpload(group.id, upload.version);
    try {
      for await (const chunk of body) {
        parser.push(chunk);
        if (parser.stopped) break;
        if (batch.length >= BATCH_SIZE) {
          assertActive();
          await flush();
        }
      }
    } finally {
      body.destroy();
    }
    const result = parser.end();
    if (result.type === "valid") await flush();
    return result;
  }

  /**
   * Adds the group to the member sets of IDs only in `next`, and removes it
   * from those only in `previous`. Every ID moves when the attribute changed.
   */
  private async updateMembers(
    id: string,
    previous: { key: string; attributeKey: string } | undefined,
    next: { key: string; attributeKey: string },
    assertActive: () => void,
  ) {
    const sameAttribute = previous?.attributeKey === next.attributeKey;

    await this.scan(next.key, async (ids) => {
      assertActive();
      const added =
        previous && sameAttribute ? await this.notIn(previous.key, ids) : ids;
      await Promise.all(
        added.map((m) => this.redis.sadd(memberKey(next.attributeKey, m), id)),
      );
    });

    if (!previous) return;
    await this.scan(previous.key, async (ids) => {
      assertActive();
      const removed = sameAttribute ? await this.notIn(next.key, ids) : ids;
      await Promise.all(
        removed.map((m) =>
          this.redis.srem(memberKey(previous.attributeKey, m), id),
        ),
      );
    });
  }

  /** Removes a group's IDs from the store. */
  private async clearGroup(id: string) {
    const loaded = (await this.getLoadedGroups()).get(id);
    if (!loaded) return;
    const key = groupKey(id, loaded.version);
    await this.scan(key, (ids) =>
      Promise.all(
        ids.map((m) => this.redis.srem(memberKey(loaded.attributeKey, m), id)),
      ).then(() => undefined),
    );
    await this.redis.hdel(GROUPS_KEY, id);
    await this.redis.hdel(GROUP_ATTRIBUTES_KEY, id);
    await this.redis.unlink(key);
    this.invalidVersions.delete(id);
    this.logger.info({ savedGroupId: id }, "Cleared remote group");
  }

  private async notIn(key: string, ids: string[]) {
    const found = await this.redis.smismember(key, ...ids);
    return ids.filter((_, i) => !found[i]);
  }

  // SSCAN can return an ID twice; adding and removing are idempotent.
  private async scan(key: string, onIds: (ids: string[]) => Promise<void>) {
    let cursor = "0";
    do {
      const [next, ids] = await this.redis.sscan(
        key,
        cursor,
        "COUNT",
        BATCH_SIZE,
      );
      if (ids.length) await onIds(ids);
      cursor = next;
    } while (cursor !== "0");
  }

  /**
   * Runs `fn` while holding the group's lock, renewing it as it goes. Skips
   * the group when another loader holds it.
   */
  private async withLock(
    id: string,
    fn: (assertActive: () => void) => Promise<void>,
  ) {
    const key = lockKey(id);
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    if (!acquired) return;

    let lost = false;
    const renew = setInterval(() => {
      this.redis
        .eval(RENEW_LOCK_SCRIPT, 1, key, token, LOCK_TTL_MS)
        .then((ok) => {
          if (!ok) lost = true;
        })
        .catch(() => undefined);
    }, LOCK_RENEW_MS);
    const assertActive = () => {
      if (lost) throw new LoadAbortedError(`Lost the lock for ${id}`);
      if (this.stopping) throw new LoadAbortedError("The loader stopped");
    };
    try {
      await fn(assertActive);
    } finally {
      clearInterval(renew);
      await this.redis
        .eval(RELEASE_LOCK_SCRIPT, 1, key, token)
        .catch(() => undefined);
    }
  }

  private async getStoreId() {
    if (!this.storeId) {
      await this.redis.set(STORE_ID_KEY, randomUUID(), "NX");
      this.storeId = await this.redis.get(STORE_ID_KEY);
      if (!this.storeId) throw new Error(`Could not read ${STORE_ID_KEY}`);
    }
    return this.storeId;
  }

  private async getLoadedGroups(): Promise<Map<string, LoadedGroup>> {
    const versions = await this.redis.hgetall(GROUPS_KEY);
    const attributes = await this.redis.hgetall(GROUP_ATTRIBUTES_KEY);
    const loaded = new Map<string, LoadedGroup>();
    for (const [id, version] of Object.entries(versions)) {
      const attributeKey = attributes[id];
      if (attributeKey) {
        loaded.set(id, { version: Number(version), attributeKey });
      }
    }
    return loaded;
  }

  private async report(
    id: string,
    version: number,
    storeId: string,
    status: LoadStatus,
  ) {
    try {
      await this.api.reportLoad(id, version, storeId, status);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        if (!this.warnedReportAccess) {
          this.warnedReportAccess = true;
          this.logger.warn(
            { err: e },
            "The API key can't report remote group loads to GrowthBook (needs publish access); loading continues",
          );
        }
        return;
      }
      this.logger.warn(
        { err: e, savedGroupId: id, version },
        "Could not report a remote group load",
      );
    }
  }

  private logError(e: unknown, id: string) {
    if (e instanceof LoadAbortedError) {
      this.logger.warn({ savedGroupId: id, reason: e.message }, "Load stopped");
    } else {
      this.logger.error(
        { err: e, savedGroupId: id },
        "Could not load remote group",
      );
    }
  }
}

function isLoaded(group: RemoteGroup, loaded: LoadedGroup | undefined) {
  return (
    loaded !== undefined &&
    loaded.version === group.currentUpload?.version &&
    loaded.attributeKey === group.attributeKey
  );
}

export function createLoader(options: LoaderOptions): RemoteGroupsLoader {
  return new RemoteGroupsLoader(options);
}
