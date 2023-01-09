import { NextFunction, Request, Response } from "express";
import { eventStreamManager } from "../../services/eventStreamManager";

export const broadcastEventStreamMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.app.locals?.ctx?.enableEventStream) {
    const apiKey = res.locals.apiKey;
    eventStreamManager.publish(apiKey, "features", req.body);
  }
  next();
};
