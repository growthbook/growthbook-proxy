import { LoaderLogger } from "./loader";

/** A Redis client that can read its config, like an ioredis client. */
export type ConfigRedis = {
  config(subcommand: "GET", parameter: string): Promise<unknown>;
};

/**
 * Warns when Redis can evict keys: an evicted member set silently drops a
 * user from a group, and "not in group" then matches them. Remote saved
 * groups need `maxmemory-policy noeviction`. Managed Redis services may not
 * allow reading the config; then nothing is checked.
 */
export async function warnIfRedisCanEvict(
  redis: ConfigRedis,
  logger: LoaderLogger,
): Promise<void> {
  let policy: unknown;
  try {
    const result = await redis.config("GET", "maxmemory-policy");
    policy = Array.isArray(result) ? result[1] : undefined;
  } catch {
    return;
  }
  if (typeof policy === "string" && policy !== "noeviction") {
    logger.warn(
      { maxmemoryPolicy: policy },
      "Redis can evict keys (maxmemory-policy is not noeviction), which would silently remove users from remote saved groups. Use a Redis with noeviction, separate from caches.",
    );
  }
}
