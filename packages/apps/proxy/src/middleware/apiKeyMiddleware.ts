import { Request, Response, NextFunction, RequestHandler } from "express";
import { Context } from "../types";
import logger from "../services/logger";

const RE_API_KEY = /(?:api|sub|eval)\/.*?\/?([^/?]*)\/?(?:\?.*)?$/;

/**
 * Extracts the API key from the request path or header.
 * Calls next() or returns 401 if no API key is present.
 **/
export const apiKeyMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ctx = req.app.locals?.ctx as Context;
  if (ctx?.verboseDebugging) logger.info("apiKeyMiddleware");

  const apiKey =
    req.headers?.["x-growthbook-api-key"] ||
    req.originalUrl.match(RE_API_KEY)?.[1];
  if (!apiKey) {
    if (ctx?.verboseDebugging) {
      logger.warn({ path: req.originalUrl }, "API key required");
    }
    return res.status(401).json({ message: "API key required" });
  }
  if (ctx?.verboseDebugging) logger.info({ apiKey }, "API key extracted");
  res.locals.apiKey = apiKey;
  next();
};
