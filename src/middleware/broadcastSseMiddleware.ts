import { NextFunction, Request, Response } from "express";
import { channelManager } from "../services/sse";

export const broadcastSseMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiKey = res.locals.apiKey;
  channelManager.publish(apiKey, "features", req.body);
  next();
};
