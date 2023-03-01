import { Express } from "express";
import { HttpLogger } from "pino-http";
import { Connection, Registrar } from "./services/registrar";
import { EventStreamManager } from "./services/eventStreamManager";
import { FeaturesCache, CacheSettings } from "./services/cache";

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
  enableHealthCheck?: boolean;
  enableCors?: boolean;
  enableAdmin?: boolean;
  adminKey?: string;
  enableEventStream?: boolean;
  enableEventStreamHeaders?: boolean;
  proxyAllRequests?: boolean;
  environment?: "development" | "production";
  verboseDebugging?: boolean;
}

export type CacheEngine = "memory" | "redis" | "mongo";
