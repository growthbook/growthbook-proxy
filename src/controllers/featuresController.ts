import express, { NextFunction, Request, Response } from "express";
import readThroughCacheMiddleware from "../middleware/cache/readThroughCacheMiddleware";
import { featuresCache } from "../services/cache";
import { registrar } from "../services/registrar";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";
import webhookVerificationMiddleware from "../middleware/webhookVerificationMiddleware";
import { reencryptionMiddleware } from "../middleware/reencryptionMiddleware";
import { broadcastEventStreamMiddleware } from "../middleware/eventStream/broadcastEventStreamMiddleware";
import refreshStaleCacheMiddleware from "../middleware/cache/refreshStaleCacheMiddleware";
import { sseSupportMiddleware } from "../middleware/sseSupportMiddleware";
import logger from "../services/logger";

const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  if (!registrar?.growthbookApiHost) {
    return res.status(400).json({ message: "Missing GrowthBook API host" });
  }

  // If the connection has not been used before, force a cache read-through so that the GB server may validate the connection.
  let forceReadThrough = false;
  const connection = registrar.getConnection(res.locals.apiKey);
  if (connection && !connection.connected) {
    forceReadThrough = true;
    connection.connected = true;
    registrar.setConnection(res.locals.apiKey, connection);
  }

  const entry =
    !forceReadThrough && featuresCache
      ? await featuresCache.get(res.locals.apiKey)
      : undefined;
  const features = entry?.payload;

  if (features === undefined) {
    // expired or unset
    return (
      await readThroughCacheMiddleware({
        proxyTarget: registrar.growthbookApiHost,
      })
    )(req, res, next);
  }

  if (
    featuresCache?.allowStale &&
    entry?.staleOn &&
    entry.staleOn < new Date()
  ) {
    // stale. refresh in background, return stale response
    refreshStaleCacheMiddleware({
      proxyTarget: registrar.growthbookApiHost,
    })(req, res).catch((e) => {
      logger.error(e, "Unable to refresh stale cache");
    });
  }

  featuresCache && logger.debug("cache HIT");
  return res.status(200).json(features);
};

const postFeatures = async (req: Request, res: Response) => {
  try {
    await featuresCache?.set(res.locals.apiKey, req.body);
  } catch (e) {
    logger.error(e, "Unable to update features");
    return res.status(500).json({ message: "Unable to update features" });
  }
  return res.status(200).json({ message: "Success" });
};

export const featuresRouter = express.Router();

// proxy clients' "get features" endpoint call to GrowthBook, with cache layer
featuresRouter.get(
  "/api/features/*",
  apiKeyMiddleware,
  sseSupportMiddleware,
  getFeatures
);

// subscribe to GrowthBook's "post features" updates, refresh cache, publish to subscribed clients
featuresRouter.post(
  "/proxy/features",
  apiKeyMiddleware,
  webhookVerificationMiddleware,
  reencryptionMiddleware,
  broadcastEventStreamMiddleware,
  postFeatures
);
