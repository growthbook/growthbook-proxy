import { Express } from "express";
import { HttpLogger } from "pino-http";
import { Connection, Registrar } from "./services/registrar";
import { EventStreamManager } from "./services/eventStreamManager";
import { FeaturesCache } from "./services/cache";

export interface GrowthBookProxy {
  app: Express;
  context: Context;
  services: {
    featuresCache: FeaturesCache;
    registrar: Registrar;
    eventStreamManager: EventStreamManager;
    logger: HttpLogger["logger"];
  };
}

export interface Context {
  growthbookApiHost?: string;
  secretApiKey?: string;
  connections?: Connection[];
  pollForConnections?: boolean;
  connectionPollingFrequency?: number;
  createConnectionsFromEnv: boolean;
  enableCache: boolean;
  cacheSettings: {
    cacheEngine: "memory" | "redis" | "mongo";
    staleTTL: number;
    expiresTTL: number;
    allowStale: boolean;
    connectionUrl?: string;
    databaseName?: string;
    collectionName?: string;
    useAdditionalMemoryCache?: boolean;
  };
  enableHealthCheck: boolean;
  enableCors: boolean;
  enableAdmin: boolean;
  adminKey?: string;
  enableEventStream: boolean;
  proxyAllRequests: boolean;
  environment?: "development" | "production";
}
