import { Express } from "express";
import { HttpLogger } from "pino-http";
import { Connection, Registrar } from "./services/registrar";
import { EventStreamManager } from "./services/eventStreamManager";
import { FeaturesCache, CacheSettings } from "./services/cache";
import { StickyBucketSettings } from "./services/stickyBucket";

export interface GrowthBookProxy {
  app: Express;
  context: Context;
  services: {
    featuresCache: FeaturesCache;
    registrar: Registrar;
    eventStreamManager: EventStreamManager;
    logger: HttpLogger["logger"];
  };
  version: string;
}

export interface Context {
  growthbookApiHost: string;
  secretApiKey: string;
  connections?: Connection[];
  pollForConnections?: boolean;
  connectionPollingFrequency?: number;
  createConnectionsFromEnv?: boolean;
  enableCache: boolean;
  cacheSettings?: {
    cacheEngine: CacheEngine;
  } & CacheSettings;
  stickyBucketSettings?: {
    engine: StickyBucketEngine;
  } & StickyBucketSettings;
  enableHealthCheck?: boolean;
  enableCors?: boolean;
  enableAdmin?: boolean;
  adminKey?: string;
  multiOrg?: boolean;
  enableEventStream?: boolean;
  enableEventStreamHeaders?: boolean;
  eventStreamMaxDurationMs?: number;
  eventStreamPingIntervalMs?: number;
  enableRemoteEval?: boolean;
  enableStickyBucketing?: boolean;
  proxyAllRequests?: boolean;
  environment?: "development" | "production";
  verboseDebugging?: boolean;
  maxPayloadSize?: string;
}

export type CacheEngine = "memory" | "redis" | "mongo";
export type StickyBucketEngine = "redis" | "none";
