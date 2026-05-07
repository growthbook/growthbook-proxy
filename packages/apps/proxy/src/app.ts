import { Express } from "express";
import cors from "cors";
import packageJson from "../package.json";
import { adminRouter } from "./controllers/adminController";
import { eventStreamRouter } from "./controllers/eventStreamController";
import { featuresRouter } from "./controllers/featuresController";
import proxyMiddleware from "./middleware/proxyMiddleware";
import {
  featuresCache,
  initializeCache,
  cacheRefreshScheduler,
} from "./services/cache";
import { initializeRegistrar, registrar } from "./services/registrar";
import {
  eventStreamManager,
  initializeEventStreamManager,
} from "./services/eventStreamManager";
import { Context, GrowthBookProxy } from "./types";
import logger, { initializeLogger } from "./services/logger";
import { initializeStickyBucketService } from "./services/stickyBucket";
import { healthRouter } from "./controllers/healthController";

export { Context, GrowthBookProxy, CacheEngine } from "./types";

export const version = (packageJson.version ?? "unknown") + "";

const defaultContext: Context = {
  growthbookApiHost: "",
  secretApiKey: "",
  createConnectionsFromEnv: true,
  pollForConnections: true,
  connectionPollingFrequency: 60000,
  enableCache: true,
  cacheSettings: {
    cacheEngine: "memory",
    staleTTL: 60, //        1 min
    expiresTTL: 3600, //    1 hour
    allowStale: true,
    cacheRefreshStrategy: "schedule",
  },
  enableHealthCheck: true,
  enableCors: true,
  enableAdmin: false,
  enableEventStream: true,
  enableEventStreamHeaders: true,
  enableRemoteEval: true,
  enableStickyBucketing: false,
  proxyAllRequests: false,
};

export const growthBookProxy = async (
  app: Express,
  context?: Partial<Context>,
): Promise<GrowthBookProxy> => {
  const ctx: Context = { ...defaultContext, ...context };
  app.locals.ctx = ctx;
  if (!ctx.growthbookApiHost) console.error("GROWTHBOOK_API_HOST is missing");
  if (!ctx.secretApiKey) console.error("SECRET_API_KEY is missing");

  // initialize
  initializeLogger(ctx);
  await initializeRegistrar(ctx);
  if (ctx.enableCache) await initializeCache(ctx);
  if (ctx.enableRemoteEval && ctx.enableStickyBucketing) {
    await initializeStickyBucketService(ctx);
  }
  if (ctx.enableEventStream) initializeEventStreamManager(ctx);

  // set up handlers
  if (ctx.enableCors) app.use(cors());
  if (ctx.enableHealthCheck) app.use("/healthcheck", healthRouter);
  if (ctx.enableAdmin) {
    logger.warn({ enableAdmin: ctx.enableAdmin }, "Admin API is enabled");
    app.use("/admin", adminRouter);
  }

  if (ctx.enableEventStream) app.use("/sub", eventStreamRouter);
  app.use("/", featuresRouter(ctx));

  if (ctx.proxyAllRequests) app.all("/*", proxyMiddleware);

  return {
    app,
    context: ctx,
    services: {
      featuresCache,
      cacheRefreshScheduler,
      registrar,
      eventStreamManager,
      logger,
    },
    version,
  };
};
