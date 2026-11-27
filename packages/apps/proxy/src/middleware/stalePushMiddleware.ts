import { NextFunction, Request, Response } from "express";
import { featuresCache } from "../services/cache";
import logger from "../services/logger";

// The newest pushed `dateUpdated` per SDK key. Kept apart from the cache,
// whose entries stop being returned once they expire.
// ponytail: per process, so a restart forgets it and other proxy instances
// don't share it. Store it in the Redis/Mongo cache if that matters.
const latestPushed = new Map<string, number>();

const dateOf = (payload: unknown) =>
  Date.parse((payload as { dateUpdated?: string })?.dateUpdated ?? "");

/**
 * Drops a pushed payload that is older than the newest one known for the key
 * (the cached payload or an earlier push), so a replayed or out-of-order push
 * can't roll the cache back. `dateUpdated` is part of the signed body.
 * Once a dated payload is known, an undated push counts as older; before that
 * it is let through, for GrowthBook versions that don't send one.
 * Answers 200, since a late push is not a delivery failure for GrowthBook to count.
 **/
export const stalePushMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = res.locals.apiKey;
  const cached = dateOf((await featuresCache?.get(apiKey))?.payload);
  // 0 when no dated payload is known
  const known = Math.max(latestPushed.get(apiKey) ?? 0, cached || 0);
  const pushed = dateOf(req.body);
  if (known > 0 && !(pushed >= known)) {
    logger.warn(
      { pushed: req.body?.dateUpdated },
      "Ignored a pushed payload older than the latest one",
    );
    return res
      .status(200)
      .json({ message: "Ignored: older than the latest payload" });
  }
  if (!isNaN(pushed)) latestPushed.set(apiKey, pushed);
  next();
};
