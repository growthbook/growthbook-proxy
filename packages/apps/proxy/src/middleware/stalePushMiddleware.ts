import { NextFunction, Request, Response } from "express";
import { featuresCache } from "../services/cache";
import logger from "../services/logger";

/**
 * Drops a pushed payload that is older than the cached one, so a replayed (or
 * out-of-order) push can't roll the cache back. `dateUpdated` is part of the
 * signed body. A payload without one is let through.
 * Answers 200, since a late push is not a delivery failure for GrowthBook to count.
 **/
export const stalePushMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const cached = (await featuresCache?.get(res.locals.apiKey))?.payload as
    | { dateUpdated?: string }
    | undefined;
  const cachedDate = Date.parse(cached?.dateUpdated ?? "");
  const pushedDate = Date.parse(req.body?.dateUpdated);
  if (pushedDate < cachedDate) {
    logger.warn(
      { pushed: req.body.dateUpdated, cached: cached?.dateUpdated },
      "Ignored a pushed payload older than the cached one",
    );
    return res
      .status(200)
      .json({ message: "Ignored: older than the cached payload" });
  }
  next();
};
