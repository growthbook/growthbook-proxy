import { NextFunction, Request, Response } from "express";
import { eventStreamManager } from "../services/sse";

export const broadcastSseMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiKey = res.locals.apiKey;
  eventStreamManager.publish(apiKey, "features", req.body);
  next();
};
