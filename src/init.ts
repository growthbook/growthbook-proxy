import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { Context } from "./app";
dotenv.config({ path: "./.env.local" });

export default async () => {
  const context: Partial<Context> = {
    cacheSettings: {
      cacheEngine: process.env?.CACHE_ENGINE === "redis" ? "redis" : "memory",
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
