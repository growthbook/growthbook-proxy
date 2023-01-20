import { NextFunction, Request, Response } from "express";
import { eventStreamManager } from "../../services/eventStreamManager";
import { featuresCache } from "../../services/cache";

export const broadcastEventStreamMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.app.locals?.ctx?.enableEventStream) {
    const apiKey = res.locals.apiKey;

    const oldEntry = featuresCache
      ? await featuresCache.get(apiKey)
      : undefined;

    eventStreamManager.publish(apiKey, "features", req.body, oldEntry?.payload);
  }
  next();
};
