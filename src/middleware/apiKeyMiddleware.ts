import { Request, Response, NextFunction } from "express";
import { Context } from "../types";
import logger from "../services/logger";

const RE_API_KEY = /(?:api|sub)\/.*?\/?([^/?]*)[/|?]?$/;

/**
 * Extracts the API key from the request path or header.
 * Calls next() or returns 401 if no API key is present.
 **/
export const apiKeyMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ctx = req.app.locals?.ctx as Context;
  ctx?.verboseDebugging && logger.info("apiKeyMiddleware");

  const apiKey =
    req.headers?.["x-growthbook-api-key"] ||
    req.originalUrl.match(RE_API_KEY)?.[1];
  if (!apiKey) {
    ctx?.verboseDebugging && logger.warn("API key required");
    return res.status(401).json({ message: "API key required" });
  }
  ctx?.verboseDebugging && logger.info({ apiKey });
  res.locals.apiKey = apiKey;
  next();
};
