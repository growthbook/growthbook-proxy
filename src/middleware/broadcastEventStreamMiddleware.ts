import { NextFunction, Request, Response } from "express";
import { eventStreamManager } from "../services/eventStreamManager";

export const broadcastEventStreamMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiKey = res.locals.apiKey;
  eventStreamManager.publish(apiKey, "features", req.body);
  next();
};
