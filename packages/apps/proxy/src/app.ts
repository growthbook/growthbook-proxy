import { Express } from "express";
import cors from "cors";
import { adminRouter } from "./controllers/adminController";
import { eventStreamRouter } from "./controllers/eventStreamController";
import { featuresRouter } from "./controllers/featuresController";
import proxyMiddleware from "./middleware/proxyMiddleware";
import { featuresCache, initializeCache, cacheRefreshScheduler } from "./services/cache";
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

const packageJson = require("../package.json");
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
  ctx.enableCache && (await initializeCache(ctx));
  ctx.enableRemoteEval &&
    ctx.enableStickyBucketing &&
    (await initializeStickyBucketService(ctx));
  ctx.enableEventStream && initializeEventStreamManager(ctx);

  // set up handlers
  ctx.enableCors && app.use(cors());
  ctx.enableHealthCheck && app.use("/healthcheck", healthRouter);
  ctx.enableAdmin && logger.warn({ enableAdmin: ctx.enableAdmin }, "Admin API is enabled");
  ctx.enableAdmin && app.use("/admin", adminRouter);

  ctx.enableEventStream && app.use("/sub", eventStreamRouter);
  app.use("/", featuresRouter(ctx));

  ctx.proxyAllRequests && app.all("/*", proxyMiddleware);

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
