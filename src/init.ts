import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { featuresCache } from "./services/cache";
import { RedisCache } from "./services/cache/RedisCache";
dotenv.config({ path: "./.env.local" });

export default async () => {
  // Set up cache:
  if (featuresCache instanceof RedisCache) {
    await featuresCache.connect();
  }

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

  return { app };
};
