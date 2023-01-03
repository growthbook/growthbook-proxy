import dotenv from "dotenv";
import { MemoryCache } from "./MemoryCache";
import { RedisCache } from "./RedisCache";
dotenv.config({ path: "./.env.local" });

export interface CacheEntry {
  payload: unknown;
  staleOn: Date;
  expiresOn: Date;
}

export interface Settings {
  staleTTL?: number;
  expiresTTL?: number;
  allowStale?: boolean;
  connectionUrl?: string;
}

let c: RedisCache | MemoryCache;
const s: Settings = {
  staleTTL: process.env?.CACHE_STALE_TTL
    ? parseInt(process.env.CACHE_STALE_TTL)
    : undefined,
  expiresTTL: process.env?.CACHE_EXPIRES_TTL
    ? parseInt(process.env.CACHE_EXPIRES_TTL)
    : undefined,
  allowStale:
    "CACHE_ALLOW_STALE" in process.env
      ? ["true", "1"].includes(process.env.CACHE_ALLOW_STALE ?? "")
      : undefined,
};
if (process.env?.CACHE_ENGINE === "redis") {
  if (process.env?.REDIS_CONNECTION_URL) {
    s.connectionUrl = process.env.REDIS_CONNECTION_URL;
  }
  c = new RedisCache(s);
  console.debug("using Redis cache");
} else {
  c = new MemoryCache(s);
  console.debug("using in-memory cache");
}
export const featuresCache = c;
