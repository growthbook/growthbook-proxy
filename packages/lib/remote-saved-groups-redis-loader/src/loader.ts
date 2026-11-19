import { randomUUID } from "crypto";
import { RemoteGroupCsvParser } from "@growthbook/remote-saved-groups-csv-parser";
import { ApiError, GrowthBookApi, LoadStatus, RemoteGroup } from "./api";
import {
  GROUP_ATTRIBUTES_KEY,
  GROUPS_KEY,
  PENDING_GROUPS_KEY,
  UPDATED_AT_FIELD,
  applyingKey,
  groupKey,
  LoaderRedis,
  lockKey,
  memberKey,
  pendingKey,
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
  /**
   * Identifies the data store in GrowthBook's load reports, such as
   * `redis-us-east`. One per Redis: loaders sharing a Redis (or a Redis
   * Cluster) use the same ID, and each Redis gets a different one.
   */
  storeId: string;
  /** How often to check for new uploads. Defaults to 5 minutes. */
  pollIntervalMs?: number;
  logger?: LoaderLogger;
};

/** A group version in Redis. */
type LoadedGroup = { version: number; attributeKey: string };

/** A load that started changing member sets but didn't finish. */
type PendingLoad = LoadedGroup & { numeric: boolean };

/** A version that failed because Redis was out of memory. */
type MemoryFailure = { version: number; failures: number; retryAt: number };

/** A set of IDs and the attribute its member sets use. */
type IdSet = { key: string; attributeKey: string };

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 60 * 1000;
const LOCK_RENEW_MS = 20 * 1000;
// Stop writing this long before the lock could expire without a renewal.
const LOCK_SAFETY_MS = 10 * 1000;
// A load that dies leaves its staging set behind until this expires.
const STAGING_TTL_SECONDS = 24 * 60 * 60;
// How long a stopped load can still be undone. The record is a few bytes.
const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;
const BATCH_SIZE = 1000;
// The longest wait before retrying a version Redis had no memory for.
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
// The version recorded for a group with no upload: loaded, with no IDs. It
// tells lookups the group was checked, unlike a group that isn't loaded yet.
const EMPTY_VERSION = 0;

// Renews or releases the lock only while this loader still holds it.
const RENEW_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
// Removes a group's attribute and records the change time in one step.
const REMOVE_ATTRIBUTE_SCRIPT = `redis.call("hdel", KEYS[1], ARGV[1]) return redis.call("hset", KEYS[1], ARGV[2], ARGV[3])`;

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
  private readonly storeId: string;
  // Versions this loader found invalid, so they're not downloaded again
  private readonly invalidVersions = new Map<string, number>();
  // Versions that failed because Redis was out of memory. Each retry fills
  // Redis again and blocks other writes, so retries wait longer each time.
  private readonly memoryFailures = new Map<string, MemoryFailure>();
  private warnedReportAccess = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private started = false;
  private stopping = false;

  constructor({
    apiHost,
    apiKey,
    redis,
    storeId,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    logger = consoleLogger,
  }: LoaderOptions) {
    this.api = new GrowthBookApi(apiHost, apiKey);
    const problem = getStoreIdProblem(storeId);
    if (problem) throw new Error(`Invalid store ID: ${problem}`);
    this.storeId = storeId;
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
    const storeId = this.storeId;
    const groups = await this.api.listRemoteGroups();
    const loaded = await this.getLoadedGroups();
    const pending = await this.getPendingGroupIds();
    const listed = new Set(groups.map((g) => g.id));

    for (const group of groups) {
      if (this.stopping) return;
      await this.syncGroup(group, loaded.get(group.id), storeId).catch((e) =>
        this.logError(e, group.id),
      );
    }

    // Groups deleted in GrowthBook, or no longer remote, including ones
    // whose loads all stopped before finishing
    for (const id of new Set([...loaded.keys(), ...pending])) {
      if (this.stopping) return;
      if (listed.has(id)) continue;
      await this.withLock(id, async (assertActive) => {
        // It may have been added back since the list was fetched.
        if (await this.api.getRemoteGroup(id)) return;
        await this.clearGroup(id, assertActive);
      }).catch((e) => this.logError(e, id));
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
    if (!needsWork(group, loaded, this.isSkipped)) return;

    await this.withLock(group.id, async (assertActive) => {
      // The list may be minutes old, and another loader may have loaded a
      // newer version since, so re-read both before changing anything.
      const latest = await this.api.getRemoteGroup(group.id);
      const recorded = (await this.getLoadedGroups()).get(group.id);
      // A version recorded without its attribute was being cleared; its
      // members are already gone.
      const current = recorded?.attributeKey ? recorded : undefined;
      if (!latest) {
        await this.clearGroup(group.id, assertActive);
        return;
      }
      if (!needsWork(latest, current, this.isSkipped)) return;
      if (!latest.currentUpload) {
        await this.clearGroup(group.id, assertActive, latest.attributeKey);
        return;
      }
      await this.loadGroup(
        latest,
        latest.currentUpload,
        current,
        storeId,
        assertActive,
      );
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
    const applying = applyingKey(id, version);
    const previous = current && {
      key: groupKey(id, current.version),
      attributeKey: current.attributeKey,
    };
    const load: PendingLoad = {
      version,
      numeric: !!upload.numeric,
      attributeKey: group.attributeKey,
    };
    // Set while only the staging set exists, then while this load adds
    // members. A failure in either step can be undone at once; later, the
    // previous version's members are being removed, so the next poll
    // finishes the load instead.
    let undoable: "staging" | "adding" | undefined = "staging";
    try {
      // Reporting can take a while, so check the lock before writing.
      assertActive();
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

      // Loads that stopped partway may have added members no version has.
      // Retrying the same version and attribute adds the same members, but
      // a different version or attribute needs them removed.
      const pending = await this.getPendingLoads(id);
      const abandoned = pending.filter(
        (p) => p.version !== version || p.attributeKey !== group.attributeKey,
      );

      // Record this load before changing member sets, so a later load can
      // undo its changes if it stops partway. Earlier stopped loads stay
      // recorded until this one finishes. The complete set moves out of
      // staging, where a retry could overwrite it, and lasts as long as
      // the record.
      assertActive();
      await this.redis.sadd(pendingKey(id), pendingValue(load));
      await this.redis.expire(pendingKey(id), PENDING_TTL_SECONDS);
      await this.redis.sadd(PENDING_GROUPS_KEY, id);
      await this.redis.rename(staging, applying);
      await this.redis.expire(applying, PENDING_TTL_SECONDS);
      undoable = "adding";
      const next = { key: applying, attributeKey: group.attributeKey };
      await this.addMembers(id, previous, next, assertActive);
      undoable = undefined;
      await this.removeMembers(id, previous, next, assertActive);
      for (const p of abandoned) {
        await this.undoLoad(id, p, next, assertActive);
      }
      const rowCount = await this.redis.scard(applying);

      // Put the set in place and make it permanent before recording the
      // version, so a recorded version always has its set. Replaces the old
      // set when only the attribute changed (same version, same IDs).
      assertActive();
      await this.redis.rename(applying, groupKey(id, version));
      await this.redis.persist(groupKey(id, version));
      // The attribute and change time go first, in one command: if this
      // stops before the version is recorded, the next poll loads it again
      // and records a new change time.
      await this.recordAttribute(id, group.attributeKey);
      await this.redis.hset(GROUPS_KEY, id, String(version));
      await this.redis.unlink(pendingKey(id));
      await this.redis.srem(PENDING_GROUPS_KEY, id);
      for (const p of pending) {
        if (p.version === version) continue;
        for (const key of pendingKeys(id, p)) await this.redis.unlink(key);
      }
      if (current && current.version !== version) {
        await this.redis.unlink(groupKey(id, current.version));
      }
      this.invalidVersions.delete(id);
      this.memoryFailures.delete(id);
      this.logger.info(
        { savedGroupId: id, version, rowCount },
        "Loaded remote group",
      );
      await this.report(id, version, storeId, { type: "loaded", rowCount });
    } catch (e) {
      if (!(e instanceof LoadAbortedError)) {
        if (undoable) {
          await this.undoFailedLoad(id, load, undoable, previous, assertActive);
        }
        if (isOutOfMemory(e)) this.delayRetry(id, version);
        await this.report(id, version, storeId, {
          type: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
      throw e;
    }
  }

  /**
   * Removes what a failed load wrote, so the memory is free again and the
   * previous version's members stay as they were. Redis allows removals
   * when it's out of memory. If this fails too, the load stays recorded and
   * a later load or clear undoes it.
   */
  private async undoFailedLoad(
    id: string,
    load: PendingLoad,
    step: "staging" | "adding",
    previous: IdSet | undefined,
    assertActive: () => void,
  ) {
    try {
      assertActive();
      if (step === "staging") {
        await this.redis.unlink(stagingKey(id, load.version));
        return;
      }
      await this.undoLoad(id, load, previous, assertActive);
      await this.redis.unlink(applyingKey(id, load.version));
      await this.redis.srem(pendingKey(id), pendingValue(load));
      if (!(await this.redis.scard(pendingKey(id)))) {
        await this.redis.srem(PENDING_GROUPS_KEY, id);
      }
      this.logger.info(
        { savedGroupId: id, version: load.version },
        "Undid a failed remote group load",
      );
    } catch (e) {
      this.logger.warn(
        { err: e, savedGroupId: id, version: load.version },
        "Could not undo a failed remote group load; the next load or clear undoes it",
      );
    }
  }

  /** Streams the upload into `staging`, which expires unless the load finishes. */
  private readUpload(
    group: RemoteGroup,
    upload: NonNullable<RemoteGroup["currentUpload"]>,
    staging: string,
    assertActive: () => void,
  ) {
    return this.readIds(
      group.id,
      { ...upload, attributeKey: group.attributeKey },
      async (ids) => {
        await this.redis.sadd(staging, ...ids);
        await this.redis.expire(staging, STAGING_TTL_SECONDS);
      },
      assertActive,
    );
  }

  /**
   * Downloads a version's file and passes its IDs, as stored, in batches.
   * The last batch only comes if the file is valid.
   */
  private async readIds(
    id: string,
    { version, attributeKey, numeric }: PendingLoad,
    onBatch: (ids: string[]) => Promise<void>,
    assertActive: () => void,
  ) {
    let batch: string[] = [];
    const parser = new RemoteGroupCsvParser({
      attributeKey,
      numeric,
      onId: (value) => batch.push(value),
    });
    const flush = async () => {
      if (!batch.length) return;
      const ids = batch;
      batch = [];
      assertActive();
      await onBatch(ids);
    };

    const body = await this.api.downloadUpload(id, version);
    try {
      for await (const chunk of body) {
        parser.push(chunk);
        if (parser.stopped) break;
        if (batch.length >= BATCH_SIZE) await flush();
      }
    } finally {
      body.destroy();
    }
    const result = parser.end();
    if (result.type === "valid") await flush();
    return result;
  }

  /**
   * Removes members a stopped load added: reads its IDs and removes the
   * group from IDs that aren't in `next` (every ID without `next`). The IDs
   * come from the version's set when it's still in Redis, else from its
   * upload. If both are gone, its members can't be found, so they stay.
   */
  private async undoLoad(
    id: string,
    stopped: PendingLoad,
    next: IdSet | undefined,
    assertActive: () => void,
  ) {
    const keep =
      next && next.attributeKey === stopped.attributeKey ? next : undefined;
    const removeIds = async (ids: string[]) => {
      const removed = keep ? await this.notIn(keep.key, ids) : ids;
      await Promise.all(
        removed.map((m) =>
          this.redis.srem(memberKey(stopped.attributeKey, m), id),
        ),
      );
    };
    const stored = await this.findStoredIds(id, stopped.version);
    if (stored) {
      await this.scan(stored, async (ids) => {
        assertActive();
        await removeIds(ids);
      });
      return;
    }
    try {
      await this.readIds(id, stopped, removeIds, assertActive);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      this.logger.error(
        { savedGroupId: id, version: stopped.version },
        "Can't undo a stopped load because its upload was deleted; members it added may remain until the group is deleted",
      );
    }
  }

  /**
   * Adds the group to the member sets of IDs in `next` but not `previous`.
   * Every ID is added when the attribute changed.
   */
  private async addMembers(
    id: string,
    previous: IdSet | undefined,
    next: IdSet,
    assertActive: () => void,
  ) {
    const unchanged = sameAttribute(previous, next);
    await this.scan(next.key, async (ids) => {
      assertActive();
      const added = unchanged ? await this.notIn(unchanged.key, ids) : ids;
      await Promise.all(
        added.map((m) => this.redis.sadd(memberKey(next.attributeKey, m), id)),
      );
    });
  }

  /**
   * Removes the group from the member sets of IDs in `previous` but not
   * `next`. Every ID is removed when the attribute changed.
   */
  private async removeMembers(
    id: string,
    previous: IdSet | undefined,
    next: IdSet,
    assertActive: () => void,
  ) {
    if (!previous) return;
    const unchanged = sameAttribute(previous, next);
    await this.scan(previous.key, async (ids) => {
      assertActive();
      const removed = unchanged ? await this.notIn(next.key, ids) : ids;
      await Promise.all(
        removed.map((m) =>
          this.redis.srem(memberKey(previous.attributeKey, m), id),
        ),
      );
    });
  }

  /**
   * Removes a group's IDs from the store, including a partial load's. With
   * `emptyAttributeKey`, records the group as loaded with no IDs (it has no
   * upload); without, removes it (it was deleted or is no longer remote).
   */
  private async clearGroup(
    id: string,
    assertActive: () => void,
    emptyAttributeKey?: string,
  ) {
    const loaded = (await this.getLoadedGroups()).get(id);
    const pending = await this.getPendingLoads(id);
    if (loaded) {
      await this.scan(groupKey(id, loaded.version), async (ids) => {
        assertActive();
        await Promise.all(
          ids.map((m) =>
            this.redis.srem(memberKey(loaded.attributeKey, m), id),
          ),
        );
      });
    }
    for (const p of pending)
      await this.undoLoad(id, p, undefined, assertActive);
    const keys = [
      ...(loaded ? [groupKey(id, loaded.version)] : []),
      ...pending.flatMap((p) => pendingKeys(id, p)),
      pendingKey(id),
    ];
    // Sets go first, so a clear that stops partway leaves no large keys,
    // and the next poll finishes it from the recorded version.
    for (const key of keys) await this.redis.unlink(key);
    await this.redis.srem(PENDING_GROUPS_KEY, id);
    if (emptyAttributeKey) {
      await this.recordAttribute(id, emptyAttributeKey);
      await this.redis.hset(GROUPS_KEY, id, String(EMPTY_VERSION));
    } else {
      await this.redis.eval(
        REMOVE_ATTRIBUTE_SCRIPT,
        1,
        GROUP_ATTRIBUTES_KEY,
        id,
        UPDATED_AT_FIELD,
        new Date().toISOString(),
      );
      await this.redis.hdel(GROUPS_KEY, id);
    }
    this.invalidVersions.delete(id);
    this.memoryFailures.delete(id);
    if (loaded || pending.length || !emptyAttributeKey) {
      this.logger.info({ savedGroupId: id }, "Cleared remote group");
    }
  }

  private readonly isSkipped = (id: string, version: number) => {
    if (this.invalidVersions.get(id) === version) return true;
    const failure = this.memoryFailures.get(id);
    return failure?.version === version && Date.now() < failure.retryAt;
  };

  private delayRetry(id: string, version: number) {
    const previous = this.memoryFailures.get(id);
    const failures = previous?.version === version ? previous.failures + 1 : 1;
    const delayMs = Math.min(
      this.pollIntervalMs * 2 ** failures,
      MAX_RETRY_DELAY_MS,
    );
    this.memoryFailures.set(id, {
      version,
      failures,
      retryAt: Date.now() + delayMs,
    });
    this.logger.warn(
      { savedGroupId: id, version, retryInMs: delayMs },
      "Redis is out of memory; retrying this remote group version later",
    );
  }

  private async getPendingGroupIds(): Promise<string[]> {
    const ids: string[] = [];
    await this.scan(PENDING_GROUPS_KEY, async (page) => {
      ids.push(...page);
    });
    return ids;
  }

  private async getPendingLoads(id: string): Promise<PendingLoad[]> {
    const pending: PendingLoad[] = [];
    await this.scan(pendingKey(id), async (values) => {
      for (const value of values) {
        // `<version>:<0|1>:<attribute>`; attributes may contain ":".
        const [version, numeric] = value.split(":", 2);
        pending.push({
          version: Number(version),
          numeric: numeric === "1",
          attributeKey: value.slice(version.length + numeric.length + 2),
        });
      }
    });
    return pending;
  }

  /**
   * A set that holds all of a version's IDs, if one is still in Redis. A
   * staging set doesn't count: a load that stops while reading leaves it
   * with only some IDs.
   */
  private async findStoredIds(id: string, version: number) {
    for (const key of [applyingKey(id, version), groupKey(id, version)]) {
      if (await this.redis.scard(key)) return key;
    }
    return undefined;
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
    let renewedAt = Date.now();
    const renew = setInterval(() => {
      const attemptedAt = Date.now();
      this.redis
        .eval(RENEW_LOCK_SCRIPT, 1, key, token, LOCK_TTL_MS)
        .then((ok) => {
          if (ok) renewedAt = attemptedAt;
          else lost = true;
        })
        .catch(() => undefined);
    }, LOCK_RENEW_MS);
    // Failed renewals don't end the lock right away, but once it could have
    // expired, another loader may hold it.
    const assertActive = () => {
      if (lost) throw new LoadAbortedError(`Lost the lock for ${id}`);
      if (Date.now() - renewedAt > LOCK_TTL_MS - LOCK_SAFETY_MS) {
        throw new LoadAbortedError(`Couldn't renew the lock for ${id}`);
      }
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

  /** Records a group's attribute and the change time in one command. */
  private async recordAttribute(id: string, attributeKey: string) {
    await this.redis.hset(
      GROUP_ATTRIBUTES_KEY,
      id,
      attributeKey,
      UPDATED_AT_FIELD,
      new Date().toISOString(),
    );
  }

  /**
   * Groups with a recorded version. One whose attribute is missing (empty)
   * stopped partway through being cleared.
   */
  private async getLoadedGroups(): Promise<Map<string, LoadedGroup>> {
    const versions = await this.redis.hgetall(GROUPS_KEY);
    const attributes = await this.redis.hgetall(GROUP_ATTRIBUTES_KEY);
    const loaded = new Map<string, LoadedGroup>();
    for (const [id, version] of Object.entries(versions)) {
      loaded.set(id, {
        version: Number(version),
        attributeKey: attributes[id] ?? "",
      });
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

/**
 * Keys a stopped load may have left: its staging or applying set, or its
 * final set if it stopped after the rename but before recording the version.
 */
function pendingKeys(id: string, { version }: LoadedGroup): string[] {
  return [
    stagingKey(id, version),
    applyingKey(id, version),
    groupKey(id, version),
  ];
}

/** A pending load as stored: `<version>:<1 if numeric else 0>:<attribute>`. */
function pendingValue({ version, numeric, attributeKey }: PendingLoad) {
  return `${version}:${numeric ? 1 : 0}:${attributeKey}`;
}

/** `previous` when its member sets use the same attribute as `next`. */
function sameAttribute(previous: IdSet | undefined, next: IdSet) {
  return previous && previous.attributeKey === next.attributeKey
    ? previous
    : undefined;
}

/** Whether the group needs loading or clearing in this store. */
function needsWork(
  group: RemoteGroup,
  loaded: LoadedGroup | undefined,
  isSkipped: (id: string, version: number) => boolean,
) {
  if (isLoaded(group, loaded)) return false;
  const upload = group.currentUpload;
  return !upload || !isSkipped(group.id, upload.version);
}

/** Whether Redis refused a write because it reached `maxmemory`. */
function isOutOfMemory(e: unknown) {
  return e instanceof Error && e.message.startsWith("OOM ");
}

/** Whether the store has the group's current version, or it as empty. */
function isLoaded(group: RemoteGroup, loaded: LoadedGroup | undefined) {
  return (
    loaded !== undefined &&
    loaded.version === (group.currentUpload?.version ?? EMPTY_VERSION) &&
    loaded.attributeKey === group.attributeKey
  );
}

/** GrowthBook's limit on a store ID's length. */
export const MAX_STORE_ID_LENGTH = 100;

/** Why `storeId` can't be used as a store ID, or null if it can. */
export function getStoreIdProblem(storeId: string | undefined): string | null {
  if (!storeId) return "it's required, such as redis-us-east";
  if (storeId.length > MAX_STORE_ID_LENGTH) {
    return `it's longer than ${MAX_STORE_ID_LENGTH} characters`;
  }
  return null;
}

export function createLoader(options: LoaderOptions): RemoteGroupsLoader {
  return new RemoteGroupsLoader(options);
}
