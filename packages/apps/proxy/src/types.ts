import { Express } from "express";
import { HttpLogger } from "pino-http";
import type { RemoteGroupsLoader } from "@growthbook/remote-groups-loader";
import { Connection, Registrar } from "./services/registrar";
import { EventStreamManager } from "./services/eventStreamManager";
import { FeaturesCache, CacheSettings } from "./services/cache";
import { StickyBucketSettings } from "./services/stickyBucket";
import { RemoteSavedGroupsSettings } from "./services/remoteSavedGroups";
import { CacheRefreshScheduler } from "./services/cache/scheduler";

export interface GrowthBookProxy {
  app: Express;
  context: Context;
  services: {
    featuresCache: FeaturesCache;
    cacheRefreshScheduler?: CacheRefreshScheduler;
    registrar: Registrar;
    eventStreamManager: EventStreamManager;
    logger: HttpLogger["logger"];
    remoteGroupsLoader?: RemoteGroupsLoader | null;
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
  enableRemoteSavedGroups?: boolean;
  remoteSavedGroupsSettings?: {
    engine: RemoteSavedGroupsEngine;
  } & RemoteSavedGroupsSettings;
  proxyAllRequests?: boolean;
  environment?: "development" | "production";
  verboseDebugging?: boolean;
  maxPayloadSize?: string;
  shutdownDelayMs?: number;
}

export type CacheEngine = "memory" | "redis" | "mongo";
export type CacheRefreshStrategy =
  | "stale-while-revalidate"
  | "schedule"
  | "none";

export type StickyBucketEngine = "redis" | "none";

export type RemoteSavedGroupsEngine = "redis";
