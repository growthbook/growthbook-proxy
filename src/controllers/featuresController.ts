import express, { NextFunction, Request, Response } from "express";
import readThroughCacheMiddleware from "../middleware/cache/readThroughCacheMiddleware";
import { featuresCache } from "../services/cache";
import { registrar } from "../services/registrar";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";
import webhookVerificationMiddleware from "../middleware/webhookVerificationMiddleware";
import { reencryptionMiddleware } from "../middleware/reencryptionMiddleware";
import { broadcastEventStreamMiddleware } from "../middleware/eventStream/broadcastEventStreamMiddleware";
import { sseSupportMiddleware } from "../middleware/sseSupportMiddleware";
import logger from "../services/logger";
import { fetchFeatures } from "../services/features";

const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  if (!registrar?.growthbookApiHost) {
    return res.status(400).json({ message: "Missing GrowthBook API host" });
  }

  const connection = registrar.getConnection(res.locals.apiKey);

  // Block server-side evaluation calls on this endpoint
  const ssEvalEnabled = !!connection?.ssEvalEnabled;
  if (ssEvalEnabled) {
    return res.status(400).json({
      status: 400,
      error: "Failed to get features",
    });
  }

  // If the connection has not been used before, force a cache read-through so that the GB server may validate the connection.
  let forceReadThrough = false;
  if (connection && !connection.connected) {
    forceReadThrough = true;
    connection.connected = true;
    registrar.setConnection(res.locals.apiKey, connection);
  }

  const entry =
    !forceReadThrough && featuresCache
      ? await featuresCache.get(res.locals.apiKey)
      : undefined;
  const payload = entry?.payload;

  if (payload === undefined) {
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
    fetchFeatures({
      apiKey: res.locals.apiKey,
      ctx: req.app.locals?.ctx,
    }).catch((e) => {
      logger.error(e, "Unable to refresh stale cache");
    });
  }

  featuresCache && logger.debug("cache HIT");
  return res.status(200).json(payload);
};

const getEvaluatedFeautres = async (req: Request, res: Response) => {
  if (!registrar?.growthbookApiHost) {
    return res.status(400).json({ message: "Missing GrowthBook API host" });
  }

  const connection = registrar.getConnection(res.locals.apiKey);

  // Block raw features calls on this endpoint
  const ssEvalEnabled = !!connection?.ssEvalEnabled;
  if (!ssEvalEnabled) {
    return res.status(400).json({
      status: 400,
      error: "Failed to get features",
    });
  }

  // If the connection has not been used before, force seed the cache so that the GB server may validate the connection.
  let forceSeedCache = false;
  if (connection && !connection.connected) {
    forceSeedCache = true;
    connection.connected = true;
    registrar.setConnection(res.locals.apiKey, connection);
  }

  let oldEntry =
    !forceSeedCache && featuresCache
      ? await featuresCache.get(res.locals.apiKey)
      : undefined;
  let payload = oldEntry?.payload;

  if (!payload) {
    const resp = await fetchFeatures({
      apiKey: res.locals.apiKey,
      ctx: req.app.locals?.ctx,
      serverSideEval: true,
    });
    if (resp?.payload) {
      payload = resp?.payload;
      oldEntry = resp?.oldEntry;
    }
  }

  if (
    featuresCache?.allowStale &&
    oldEntry?.staleOn &&
    oldEntry.staleOn < new Date()
  ) {
    // stale. refresh in background, return stale response
    fetchFeatures({
      apiKey: res.locals.apiKey,
      ctx: req.app.locals?.ctx,
      serverSideEval: true,
    }).catch((e) => {
      logger.error(e, "Unable to refresh stale cache");
    });
  }

  featuresCache && logger.debug("cache HIT");

  // todo: evaluate features!!!

  // todo: emit SSE? do we actually need oldEntry?

  return res.status(200).json(payload);
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

// get evaluated features for user, with cache layer for raw feature definitions
featuresRouter.get(
  "/eval/features/*",
  apiKeyMiddleware,
  sseSupportMiddleware,
  getEvaluatedFeautres
);

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
  broadcastEventStreamMiddleware,
  postFeatures
);
