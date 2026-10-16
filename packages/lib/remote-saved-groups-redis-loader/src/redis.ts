/**
 * The Redis commands the loader uses. An ioredis `Redis` or `Cluster` client
 * fits. Commands run one key at a time, so they work on Redis Cluster.
 * `SMISMEMBER` needs Redis 6.2 or later.
 */
export interface LoaderRedis {
  set(key: string, value: string): Promise<"OK" | null>;
  set(
    key: string,
    value: string,
    px: "PX",
    milliseconds: number,
    nx: "NX",
  ): Promise<"OK" | null>;
  eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<number>;
  hdel(key: string, field: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  sscan(
    key: string,
    cursor: string,
    countToken: "COUNT",
    count: number,
  ): Promise<[cursor: string, elements: string[]]>;
  smismember(key: string, ...members: string[]): Promise<number[]>;
  scard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  persist(key: string): Promise<number>;
  rename(key: string, newKey: string): Promise<"OK">;
  unlink(key: string): Promise<number>;
}

/** Each loaded group's version. */
export const GROUPS_KEY = "gb:groups";
/**
 * When any group's members last changed (ISO date). Lookups report it as the
 * evaluated payload's `dateUpdated`, so SDKs don't discard changed results.
 */
export const UPDATED_AT_KEY = "gb:updated-at";
/** Each loaded group's attribute, to find its member sets when it changes. */
export const GROUP_ATTRIBUTES_KEY = "gb:group-attributes";

// `{id}` is a hash tag, so a group's sets and lock share a Cluster slot.
export const groupKey = (id: string, version: number) =>
  `gb:group:{${id}}:${version}`;
export const stagingKey = (id: string, version: number) =>
  `${groupKey(id, version)}:loading`;
export const lockKey = (id: string) => `gb:lock:{${id}}`;
/**
 * Loads of the group that started changing member sets but didn't finish,
 * as `<version>:<1 if numeric else 0>:<attribute>`. A later load or clear
 * of the group re-reads each one's upload to undo its changes. Expires, so
 * nothing is left behind if no load ever comes.
 */
export const pendingKey = (id: string) => `gb:group-pending:{${id}}`;
export const memberKey = (attributeKey: string, id: string) =>
  `gb:member:${attributeKey}:${id}`;
