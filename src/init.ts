import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { CacheEngine, Context } from "./types";
import logger from "./services/logger";
dotenv.config({ path: "./.env.local" });

export default async () => {
  const context: Partial<Context> = {
    growthbookApiHost: process.env.GROWTHBOOK_API_HOST,
    secretApiKey: process.env.SECRET_API_KEY,
    enableAdmin: ["true", "1"].includes(process.env.ENABLE_ADMIN ?? ""),
    adminKey: process.env.ADMIN_KEY,
    environment: process.env.NODE_ENV as Context["environment"],
    cacheSettings: {
      cacheEngine: (process.env.CACHE_ENGINE || "memory") as CacheEngine,
      connectionUrl: process.env.CACHE_CONNECTION_URL,
      staleTTL: parseInt(process.env.CACHE_STALE_TTL || "60"),
      expiresTTL: parseInt(process.env.CACHE_EXPIRES_TTL || "600"),
      allowStale: ["true", "1"].includes(process.env.CACHE_ALLOW_STALE ?? ""),
      useAdditionalMemoryCache: true,
    },
  };

  // Express configuration consts:
  const USE_HTTP2 = process.env.USE_HTTP2;
  const HTTPS_CERT = process.env.HTTPS_CERT;
  const HTTPS_KEY = process.env.HTTPS_KEY;

  function getPort() {
    if (process.env.PORT) {
      const port = parseInt(process.env.PORT);
      if (!isNaN(port) && port > 0) {
        return port;
      }
    }
    return 3300;
  }
  const PROXY_PORT = getPort();

  // Start Express
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
      logger.info(`GrowthBook proxy running over HTTP2, port ${PROXY_PORT}`);
    });
  } else {
    app.listen(PROXY_PORT, () => {
      logger.info(`GrowthBook proxy running over HTTP1.1, port ${PROXY_PORT}`);
    });
  }

  return { app, context };
};
