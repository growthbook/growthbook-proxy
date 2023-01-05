import express, { NextFunction, Request, Response } from "express";
import readThroughCacheMiddleware from "../middleware/cache/readThroughCacheMiddleware";
import { featuresCache } from "../services/cache";
import { registrar } from "../services/registrar";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";
import webhookVerificationMiddleware from "../middleware/webhookVerificationMiddleware";
import { reencryptionMiddleware } from "../middleware/reencryptionMiddleware";
import { broadcastSseMiddleware } from "../middleware/broadcastSseMiddleware";
import refreshStaleCacheMiddleware from "../middleware/cache/refreshStaleCacheMiddleware";

const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  const endpoints = registrar.getEndpointsByApiKey(res.locals.apiKey);
  if (!endpoints?.apiHost) {
    return res.status(400).json({ message: "Missing API host" });
  }
  const entry = featuresCache
    ? await featuresCache.get(res.locals.apiKey)
    : undefined;
  const features = entry?.payload;

  if (features === undefined) {
    // expired or unset
    // todo: add lock for setting cache?
    return readThroughCacheMiddleware({
      proxyTarget: endpoints.apiHost,
    })(req, res, next);
  }

  if (
    featuresCache?.allowStale &&
    entry?.staleOn &&
    entry.staleOn < new Date()
  ) {
    // stale. refresh in background, return stale response
    // todo: add lock for setting cache?
    refreshStaleCacheMiddleware({
      proxyTarget: endpoints.apiHost,
    })(req, res).catch((e) => {
      console.error("Unable to refresh stale cache", e);
    });
  }

  featuresCache && console.debug("cache HIT");
  return res.status(200).json(features);
};

const postFeatures = async (req: Request, res: Response) => {
  try {
    await featuresCache?.set(res.locals.apiKey, req.body);
  } catch (e) {
    console.error("Unable to update features", e);
    return res.status(500).json({ message: "Unable to update features" });
  }
  return res.status(200).json({ message: "Success" });
};

export const featuresRouter = express.Router();

// proxy clients' "get features" endpoint call to GrowthBook, with cache layer
featuresRouter.get("/api/features/*", apiKeyMiddleware, getFeatures);

// subscribe to GrowthBook's "post features" updates, refresh cache, publish to subscribed clients
featuresRouter.post(
  "/proxy/features",
  apiKeyMiddleware,
  express.json({
    verify: (req: Request, res: Response, buf: Buffer) =>
      (res.locals.rawBody = buf),
  }),
  webhookVerificationMiddleware,
  reencryptionMiddleware,
  broadcastSseMiddleware,
  postFeatures
);
