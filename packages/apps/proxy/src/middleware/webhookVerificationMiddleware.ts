import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { registrar } from "../services/registrar";
import { Context } from "../types";
import logger from "../services/logger";

/**
 * Uses the connection's signing key to verify the webhook signature.
 * Calls next() or returns 401 if signatures do not match.
 **/
export default (req: Request, res: Response, next: NextFunction) => {
  const ctx = req.app.locals?.ctx as Context;
  ctx?.verboseDebugging && logger.info("webhookVerificationMiddleware");

  const connection = registrar.getConnection(res.locals.apiKey);
  if (!connection?.signingKey) {
    ctx?.verboseDebugging && logger.warn("Missing signing key");
    return res.status(400).json({ message: "Missing signing key" });
  }
  const sig = req.get("x-growthbook-signature") || "";

  const computed = crypto
    .createHmac("sha256", connection?.signingKey || "")
    .update(res.locals.rawBody || new Buffer(""))
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig))) {
    ctx?.verboseDebugging &&
      logger.warn(
        { signingKey: connection?.signingKey, computed, sig },
        "Signatures do not match!"
      );
    return res.status(401).json({ message: "Signatures do not match!" });
  }
  next();
};
