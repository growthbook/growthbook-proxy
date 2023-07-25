import express, {Request, Response} from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { CacheEngine, Context } from "./types";
dotenv.config({ path: "./.env.local" });

export default async () => {
  const context: Partial<Context> = {
    growthbookApiHost: process.env.GROWTHBOOK_API_HOST,
    secretApiKey: process.env.SECRET_API_KEY,
    environment: process.env.NODE_ENV as Context["environment"],
    enableAdmin: ["true", "1"].includes(process.env.ENABLE_ADMIN ?? "0"),
    adminKey: process.env.ADMIN_KEY,
    verboseDebugging: ["true", "1"].includes(
      process.env.VERBOSE_DEBUGGING ?? "0"
    ),
    // SSE settings:
    enableEventStream: ["true", "1"].includes(
      process.env.ENABLE_EVENT_STREAM ?? "1"
    ),
    enableEventStreamHeaders: ["true", "1"].includes(
      process.env.ENABLE_EVENT_STREAM_HEADERS ?? "1"
    ),
    eventStreamMaxDurationMs: parseInt(
      process.env.EVENT_STREAM_MAX_DURATION_MS ?? "60000"
    ),
    eventStreamPingIntervalMs: parseInt(
      process.env.EVENT_STREAM_PING_INTERVAL_MS ?? "30000"
    ),
    // Cache settings:
    cacheSettings: {
      cacheEngine: (process.env.CACHE_ENGINE || "memory") as CacheEngine,
      staleTTL: parseInt(process.env.CACHE_STALE_TTL || "60"),
      expiresTTL: parseInt(process.env.CACHE_EXPIRES_TTL || "600"),
      allowStale: ["true", "1"].includes(process.env.CACHE_ALLOW_STALE ?? "1"),
      connectionUrl: process.env.CACHE_CONNECTION_URL,
      useAdditionalMemoryCache: true,
      // Mongo only:
      databaseName: process.env.CACHE_DATABASE_NAME || undefined,
      collectionName: process.env.CACHE_COLLECTION_NAME || undefined,
      // Redis only - pub/sub:
      publishPayloadToChannel: ["true", "1"].includes(
        process.env.PUBLISH_PAYLOAD_TO_CHANNEL ?? "0"
      ),
      // Redis only - cluster:
      useCluster: ["true", "1"].includes(process.env.USE_CLUSTER ?? "0"),
      clusterRootNodes: process.env.CLUSTER_ROOT_NODES
        ? process.env.CLUSTER_ROOT_NODES.replace(" ", "").split(",")
        : undefined,
      clusterRootNodesJSON: process.env.CLUSTER_ROOT_NODES_JSON
        ? JSON.parse(process.env.CLUSTER_ROOT_NODES_JSON)
        : undefined,
      clusterOptionsJSON: process.env.CLUSTER_OPTIONS_JSON
        ? JSON.parse(process.env.CLUSTER_OPTIONS_JSON)
        : undefined,
    },
  };

  // Express configuration consts:
  const USE_HTTP2 = process.env.USE_HTTP2;
  const HTTPS_CERT = process.env.HTTPS_CERT;
  const HTTPS_KEY = process.env.HTTPS_KEY;
  const PAYLOAD_SIZE_LIMIT = process.env.PAYLOAD_SIZE_LIMIT || "50mb";

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

  app.use(express.json({
    limit: PAYLOAD_SIZE_LIMIT,
    verify: (req: Request, res: Response, buf) => {
      res.locals.rawBody = buf
    }
  }));
  
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let server: any = null;

  // Start app
  if (USE_HTTP2) {
    server = spdy.createServer(
      {
        key: HTTPS_KEY,
        cert: HTTPS_CERT,
      },
      app
    );
    server.listen(PROXY_PORT, () => {
      console.info(`GrowthBook proxy running over HTTP2, port ${PROXY_PORT}`);
    });
  } else {
    server = app.listen(PROXY_PORT, () => {
      console.info(`GrowthBook proxy running over HTTP1.1, port ${PROXY_PORT}`);
    });
  }

  return { app, server, context };
};
