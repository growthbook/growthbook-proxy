import {channelManager} from "../services/sse";
import {NextFunction, Request, Response} from "express";

export const broadcastSseMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = res.locals.apiKey;
  channelManager.publish(apiKey, "features", req.body);
  next();
}