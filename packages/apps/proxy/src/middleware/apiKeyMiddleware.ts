import { Request, Response, NextFunction, RequestHandler } from "express";
import { Context } from "../types";
import logger from "../services/logger";

const RE_API_KEY = /(?:api|sub|eval)\/.*?\/?([^/?]*)\/?(?:\?.*)?$/;

/**
 * Extracts the API key from the request path, or from the header when the path has none.
 * Calls next(), returns 400 if the header names a different key than the path,
 * or returns 401 if no API key is present.
 **/
export const apiKeyMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ctx = req.app.locals?.ctx as Context;
  if (ctx?.verboseDebugging) logger.info("apiKeyMiddleware");

  // The path key is the one fetched upstream, so it is the one we cache and publish under.
  // The header only names the key where the path has none (POST /proxy/features).
  const pathKey = req.originalUrl.match(RE_API_KEY)?.[1];
  const headerKey = req.headers?.["x-growthbook-api-key"];
  if (pathKey && headerKey && headerKey !== pathKey) {
    if (ctx?.verboseDebugging) {
      logger.warn({ path: req.originalUrl }, "API key header mismatch");
    }
    return res
      .status(400)
      .json({ message: "API key header does not match the path" });
  }
  const apiKey = pathKey || headerKey;
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
