import crypto from "crypto";
import {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { registrar } from "../services/registrar";
import { Context } from "../types";
import logger from "../services/logger";

// A hex SHA-256 HMAC. Also keeps timingSafeEqual from throwing on a length mismatch.
const RE_SIGNATURE = /^[0-9a-f]{64}$/;

/**
 * Runs before the body is read. Returns 400 if the connection has no signing
 * key, or 401 if the signature header can't be a valid signature.
 **/
const webhookVerificationMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ctx = req.app.locals?.ctx as Context;
  if (ctx?.verboseDebugging) logger.info("webhookVerificationMiddleware");

  const connection = registrar.getConnection(res.locals.apiKey);
  if (!connection?.signingKey) {
    if (ctx?.verboseDebugging) {
      logger.warn(
        { apiKey: res.locals.apiKey, hasConnection: !!connection },
        "Missing signing key",
      );
    }
    return res.status(400).json({ message: "Missing signing key" });
  }
  if (!RE_SIGNATURE.test(req.get("x-growthbook-signature") || "")) {
    return res.status(401).json({ message: "Signatures do not match!" });
  }
  next();
};

/**
 * The `verify` hook for express.json(): checks the signature against the raw
 * bytes. Throwing here ends the request before the body is parsed.
 **/
export const verifyWebhookSignature = (
  req: Request,
  res: Response,
  buf: Buffer,
) => {
  const signingKey = registrar.getConnection(res.locals.apiKey)?.signingKey;
  const sig = req.get("x-growthbook-signature") || "";
  const computed = crypto
    .createHmac("sha256", signingKey || "")
    .update(buf)
    .digest("hex");

  if (
    !signingKey ||
    !RE_SIGNATURE.test(sig) ||
    !crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig))
  ) {
    throw new Error("Signatures do not match!");
  }
};

/** body-parser reports a failed `verify` as a 403; keep the route's 401. */
export const webhookSignatureErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next,
) => {
  if (err?.type !== "entity.verify.failed") return next(err);
  const ctx = req.app.locals?.ctx as Context;
  if (ctx?.verboseDebugging) logger.warn("Signatures do not match!");
  res.status(401).json({ message: "Signatures do not match!" });
};

export default webhookVerificationMiddleware;
