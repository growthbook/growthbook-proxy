import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { CacheEngine, Context, StickyBucketEngine } from "./types";
dotenv.config({ path: "./.env.local" });

export const MAX_PAYLOAD_SIZE = "2mb";

export default async () => {
  const context: Partial<Context> = {
    growthbookApiHost: (process.env.GROWTHBOOK_API_HOST ?? "").replace(
      /\/*$/,
      "",
    ),
    secretApiKey: process.env.SECRET_API_KEY,
    environment: process.env.NODE_ENV as Context["environment"],
    enableAdmin: ["true", "1"].includes(process.env.ENABLE_ADMIN ?? "0"),
    adminKey: process.env.ADMIN_KEY,
    multiOrg: ["true", "1"].includes(process.env.MULTI_ORG ?? "0"),
    verboseDebugging: ["true", "1"].includes(
      process.env.VERBOSE_DEBUGGING ?? "0",
    ),
    maxPayloadSize: process.env.MAX_PAYLOAD_SIZE ?? MAX_PAYLOAD_SIZE,
    // SDK Connections settings:
    createConnectionsFromEnv: ["true", "1"].includes(
      process.env.CREATE_CONNECTIONS_FROM_ENV ?? "1",
    ),
    pollForConnections: ["true", "1"].includes(
      process.env.POLL_FOR_CONNECTIONS ?? "1",
    ),
    connectionPollingFrequency: parseInt(
      process.env.CONNECTION_POLLING_FREQUENCY ?? "60000",
    ),
    // Cache settings:
    cacheSettings: {
      cacheEngine: (process.env.CACHE_ENGINE || "memory") as CacheEngine,
      staleTTL: parseInt(process.env.CACHE_STALE_TTL || "60"),
      expiresTTL: parseInt(process.env.CACHE_EXPIRES_TTL || "3600"),
      allowStale: ["true", "1"].includes(process.env.CACHE_ALLOW_STALE ?? "1"),
      connectionUrl: process.env.CACHE_CONNECTION_URL,
      useAdditionalMemoryCache: true,
      // Mongo only:
      databaseName: process.env.CACHE_DATABASE_NAME || undefined,
      collectionName: process.env.CACHE_COLLECTION_NAME || undefined,
      // Redis only - pub/sub:
      publishPayloadToChannel: ["true", "1"].includes(
        process.env.PUBLISH_PAYLOAD_TO_CHANNEL ?? "0",
      ),
      // Redis only - cluster:
      useCluster: ["true", "1"].includes(process.env.USE_CLUSTER ?? "0"),
      clusterRootNodesJSON: process.env.CLUSTER_ROOT_NODES_JSON
        ? JSON.parse(process.env.CLUSTER_ROOT_NODES_JSON)
        : undefined,
      clusterOptionsJSON: process.env.CLUSTER_OPTIONS_JSON
        ? JSON.parse(process.env.CLUSTER_OPTIONS_JSON)
        : undefined,
      // Redis only - sentinel:
      useSentinel: ["true", "1"].includes(process.env.USE_SENTINEL ?? "0"),
      sentinelConnectionOptionsJSON: process.env.SENTINEL_CONNECTION_OPTIONS_JSON
        ? JSON.parse(process.env.SENTINEL_CONNECTION_OPTIONS_JSON)
        : undefined,
    },
    // SSE settings:
    enableEventStream: ["true", "1"].includes(
      process.env.ENABLE_EVENT_STREAM ?? "1",
    ),
    enableEventStreamHeaders: ["true", "1"].includes(
      process.env.ENABLE_EVENT_STREAM_HEADERS ?? "1",
    ),
    eventStreamMaxDurationMs: parseInt(
      process.env.EVENT_STREAM_MAX_DURATION_MS ?? "60000",
    ),
    eventStreamPingIntervalMs: parseInt(
      process.env.EVENT_STREAM_PING_INTERVAL_MS ?? "30000",
    ),
    // Remote eval settings:
    enableRemoteEval: ["true", "1"].includes(
      process.env.ENABLE_REMOTE_EVAL ?? "1",
    ),
    // Sticky Bucket settings (for remote eval):
    enableStickyBucketing: ["true", "1"].includes(
      process.env.ENABLE_STICKY_BUCKETING ?? "0",
    ),
    stickyBucketSettings: {
      engine: (process.env.STICKY_BUCKET_ENGINE ||
        "none") as StickyBucketEngine,
      connectionUrl: process.env.STICKY_BUCKET_CONNECTION_URL,
      // Redis only - cluster:
      useCluster: ["true", "1"].includes(
        process.env.STICKY_BUCKET_USE_CLUSTER ?? "0",
      ),
      clusterRootNodesJSON: process.env.STICKY_BUCKET_CLUSTER_ROOT_NODES_JSON
        ? JSON.parse(process.env.STICKY_BUCKET_CLUSTER_ROOT_NODES_JSON)
        : undefined,
      clusterOptionsJSON: process.env.STICKY_BUCKET_CLUSTER_OPTIONS_JSON
        ? JSON.parse(process.env.STICKY_BUCKET_CLUSTER_OPTIONS_JSON)
        : undefined,
      ttl: process.env.STICKY_BUCKET_TTL
        ? parseInt(process.env.STICKY_BUCKET_TTL)
        : undefined,
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
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let server: any = null;

  // Start app
  if (USE_HTTP2) {
    server = spdy.createServer(
      {
        key: HTTPS_KEY,
        cert: HTTPS_CERT,
      },
      app,
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
