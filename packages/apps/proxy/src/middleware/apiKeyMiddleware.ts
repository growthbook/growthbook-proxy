import { Request, Response, NextFunction, RequestHandler } from "express";
import { Context } from "../types";
import logger from "../services/logger";

// The key is placed in upstream URLs, so it can't hold path or query syntax
const RE_VALID_KEY = /^(?!\.+$)[\w.~-]+$/;

/**
 * Takes the API key from the route's `:apiKey` parameter, which is the key
 * requested upstream. Only a route without that parameter (POST /proxy/features)
 * takes it from the header.
 * Calls next(), returns 400 if the header names a different key than the path
 * or the key is malformed, or returns 401 if no API key is present.
 **/
export const apiKeyMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ctx = req.app.locals?.ctx as Context;
  if (ctx?.verboseDebugging) logger.info("apiKeyMiddleware");

  const pathKey = req.params?.apiKey;
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
  if (typeof apiKey !== "string" || !RE_VALID_KEY.test(apiKey)) {
    return res.status(400).json({ message: "Invalid API key" });
  }
  if (ctx?.verboseDebugging) logger.info({ apiKey }, "API key extracted");
  res.locals.apiKey = apiKey;
  next();
};
