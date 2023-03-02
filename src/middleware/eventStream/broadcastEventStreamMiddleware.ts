import { NextFunction, Request, Response } from "express";
import { eventStreamManager } from "../../services/eventStreamManager";
import { featuresCache } from "../../services/cache";
import { Context } from "../../types";
import logger from "../../services/logger";

export const broadcastEventStreamMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ctx = req.app.locals?.ctx as Context;
  ctx?.verboseDebugging && logger.info("broadcastEventStreamMiddleware");

  if (ctx?.enableEventStream && eventStreamManager) {
    const apiKey = res.locals.apiKey;

    const oldEntry = featuresCache
      ? await featuresCache.get(apiKey)
      : undefined;

    eventStreamManager.publish(apiKey, "features", req.body, oldEntry?.payload);
  }
  next();
};
