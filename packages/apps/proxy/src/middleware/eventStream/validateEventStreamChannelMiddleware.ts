import { NextFunction, Request, RequestHandler, Response } from "express";
import { registrar } from "../../services/registrar";
import { Context } from "../../types";
import logger from "../../services/logger";

export const validateEventStreamChannelMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ctx = req.app.locals?.ctx as Context;
  if (ctx?.verboseDebugging)
    logger.info("validateEventStreamChannelMiddleware");

  if (ctx?.enableEventStream) {
    const apiKey = res.locals.apiKey;
    const validApiKeys = Object.keys(registrar.getAllConnections());
    if (!validApiKeys.includes(apiKey)) {
      if (ctx?.verboseDebugging) {
        logger.warn({ validApiKeys, apiKey }, "No channel found");
      }
      return res.status(400).json({ message: "No channel found" });
    }
  }
  next();
};
