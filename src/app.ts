import fs from "fs";
import path from "path";
import { Express } from "express";
import cors from "cors";
import { version } from "../package.json";
import { adminRouter } from "./controllers/adminController";
import { eventStreamRouter } from "./controllers/eventStreamController";
import { featuresRouter } from "./controllers/featuresController";
import proxyMiddleware from "./middleware/proxyMiddleware";
import { featuresCache, initializeCache } from "./services/cache";
import { initializeRegistrar, registrar } from "./services/registrar";
import { eventStreamManager } from "./services/eventStreamManager";
import { Context, GrowthBookProxy } from "./types";
import logger, { initializeLogger } from "./services/logger";

export { Context, GrowthBookProxy, CacheEngine } from "./types";

let build: { sha: string; date: string };
function getBuild() {
  if (!build) {
    build = {
      sha: "",
      date: "",
    };
    const rootPath = path.join(__dirname, "..", "buildinfo");
    if (fs.existsSync(path.join(rootPath, "SHA"))) {
      build.sha = fs.readFileSync(path.join(rootPath, "SHA")).toString().trim();
    }
    if (fs.existsSync(path.join(rootPath, "DATE"))) {
      build.date = fs
        .readFileSync(path.join(rootPath, "DATE"))
        .toString()
        .trim();
    }
  }
  return build;
}

const defaultContext: Context = {
  growthbookApiHost: "",
  secretApiKey: "",
  createConnectionsFromEnv: true,
  pollForConnections: true,
  connectionPollingFrequency: 10000,
  enableCache: true,
  cacheSettings: {
    cacheEngine: "memory",
    staleTTL: 60, //        1 min,
    expiresTTL: 10 * 60, // 10 min,
    allowStale: true,
  },
  enableHealthCheck: true,
  enableCors: true,
  enableAdmin: false,
  enableEventStream: true,
  proxyAllRequests: false,
};

export const growthBookProxy = async (
  app: Express,
  context?: Partial<Context>
): Promise<GrowthBookProxy> => {
  const ctx: Context = { ...defaultContext, ...context };
  app.locals.ctx = ctx;

  // initialize
  initializeLogger(ctx);
  await initializeRegistrar(ctx);
  ctx.enableCache && (await initializeCache(ctx));

  // set up handlers
  ctx.enableCors && app.use(cors());
  ctx.enableHealthCheck &&
    app.get("/healthcheck", (req, res) => {
      const build = getBuild();
      res.status(200).json({
        ok: true,
        proxyVersion: version,
        build,
      });
    });
  ctx.enableAdmin && logger.warn("Admin API is enabled");
  ctx.enableAdmin && app.use("/admin", adminRouter);

  ctx.enableEventStream && app.use("/sub", eventStreamRouter);
  app.use("/", featuresRouter);

  ctx.proxyAllRequests && app.all("/*", proxyMiddleware);

  return {
    app,
    context: ctx,
    services: {
      featuresCache,
      registrar,
      eventStreamManager,
      logger,
    },
  };
};