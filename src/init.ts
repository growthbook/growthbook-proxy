import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { Context } from "./types";
dotenv.config({ path: "./.env.local" });

export default async () => {
  const context: Partial<Context> = {
    apiHost: process.env?.API_HOST,
    authenticatedApiHost:
      process.env?.AUTHENTICATED_API_HOST ?? process.env?.API_HOST,
    authenticatedApiSigningKey: process.env?.AUTHENTICATED_API_SIGNING_KEY,
    enableAdmin: ["true", "1"].includes(process.env?.ENABLE_ADMIN ?? ""),
    adminKey: process.env?.ADMIN_KEY,
    cacheSettings: {
      cacheEngine: (process.env?.CACHE_ENGINE || "memory") as
        | "memory"
        | "redis"
        | "mongo",
      connectionUrl: process.env?.CACHE_CONNECTION_URL,
      staleTTL: process.env?.CACHE_STALE_TTL
        ? parseInt(process.env.CACHE_STALE_TTL)
        : 60,
      expiresTTL: process.env?.CACHE_EXPIRES_TTL
        ? parseInt(process.env.CACHE_EXPIRES_TTL)
        : 60 * 10,
      allowStale:
        "CACHE_ALLOW_STALE" in process.env
          ? ["true", "1"].includes(process.env.CACHE_ALLOW_STALE ?? "")
          : true,
      useAdditionalMemoryCache: true,
    },
  };

  // Proxy configuration consts:
  const USE_HTTP2 = process.env?.USE_HTTP2 ?? false;
  const HTTPS_CERT = process.env?.HTTPS_CERT ?? "";
  const HTTPS_KEY = process.env?.HTTPS_KEY ?? "";
  const PROXY_PORT = process.env?.PORT ?? 3200;

  // Start express
  const app = express();

  // Start app
  if (USE_HTTP2) {
    const server = spdy.createServer(
      {
        key: HTTPS_KEY,
        cert: HTTPS_CERT,
      },
      app
    );
    server.listen(PROXY_PORT, () => {
      console.debug(`GrowthBook proxy running over HTTP2, port ${PROXY_PORT}`);
    });
  } else {
    app.listen(PROXY_PORT, () => {
      console.debug(
        `GrowthBook proxy running over HTTP1.1, port ${PROXY_PORT}`
      );
    });
  }

  return { app, context };
};
