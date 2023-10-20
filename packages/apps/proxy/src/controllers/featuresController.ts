import express, { NextFunction, Request, Response } from "express";
import { evaluateFeatures } from "@growthbook/proxy-eval";
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
import { Context } from "../types";

const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  if (!registrar?.growthbookApiHost) {
    return res.status(400).json({ message: "Missing GrowthBook API host" });
  }

  const connection = registrar.getConnection(res.locals.apiKey);

  // Block remote evaluation calls on this endpoint
  const remoteEvalEnabled = !!connection?.remoteEvalEnabled;
  if (remoteEvalEnabled) {
    res.removeHeader("x-sse-support");
    return res.status(400).json({
      status: 400,
      error: "Failed to get features (remote eval not supported)",
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

const getEvaluatedFeatures = async (req: Request, res: Response) => {
  if (!registrar?.growthbookApiHost) {
    return res.status(400).json({ message: "Missing GrowthBook API host" });
  }

  const connection = registrar.getConnection(res.locals.apiKey);

  // Block raw features calls on this endpoint
  const remoteEvalEnabled = !!connection?.remoteEvalEnabled;
  if (!remoteEvalEnabled) {
    res.removeHeader("x-sse-support");
    return res.status(400).json({
      status: 400,
      error: "Failed to get features (remote eval required)",
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
      remoteEvalEnabled: true,
      organization: connection?.organization,
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
      remoteEvalEnabled: true,
      organization: connection?.organization,
    }).catch((e) => {
      logger.error(e, "Unable to refresh stale cache");
    });
  }

  featuresCache && logger.debug("cache HIT");

  // Evaluate features using provided attributes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attributes: Record<string, any> = req.body?.attributes || {};
  const forcedVariations: Record<string, number> =
    req.body?.forcedVariations || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forcedFeatures: Map<string, any> = new Map(
    req.body.forcedFeatures || [],
  );
  const url = req.body?.url;

  payload = evaluateFeatures({
    payload,
    attributes,
    forcedVariations,
    forcedFeatures,
    url,
    ctx: req.app.locals?.ctx,
  });

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

export const featuresRouter = (ctx: Context) => {
  const router = express.Router();

  // proxy clients' "get features" endpoint call to GrowthBook, with cache layer
  router.get(
    "/api/features/*",
    apiKeyMiddleware,
    sseSupportMiddleware,
    getFeatures,
  );

  // get evaluated features for user, with cache layer for raw feature definitions. Uses a POST to encode attributes
  if (ctx.enableRemoteEval) {
    router.post(
      "/api/eval/*",
      apiKeyMiddleware,
      express.json(),
      sseSupportMiddleware,
      getEvaluatedFeatures,
    );
  }

  // subscribe to GrowthBook's "post features" updates, refresh cache, publish to subscribed clients
  router.post(
    "/proxy/features",
    apiKeyMiddleware,
    express.json({
      verify: (req: Request, res: Response, buf: Buffer) =>
        (res.locals.rawBody = buf),
    }),
    webhookVerificationMiddleware,
    reencryptionMiddleware,
    broadcastEventStreamMiddleware,
    postFeatures,
  );

  return router;
};
