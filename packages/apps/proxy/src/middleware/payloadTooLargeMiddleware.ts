import { ErrorRequestHandler } from "express";
import logger from "../services/logger";

/**
 * Logs request bodies over the size limit, then passes the error on so
 * Express still responds with 413.
 *
 * The limit is enforced inside `express.json()`, which hands the error to
 * Express before any route handler runs. An error handler is the one place
 * that sees it for every route that parses JSON.
 */
export const payloadTooLargeMiddleware: ErrorRequestHandler = (
  err,
  req,
  res,
  next,
) => {
  if (isPayloadTooLarge(err)) {
    const setting =
      req.path === "/proxy/features"
        ? "MAX_FEATURES_PAYLOAD_SIZE"
        : "MAX_PAYLOAD_SIZE";
    logger.warn(
      {
        method: req.method,
        path: req.path,
        bytes: err.length,
        limit: err.limit,
      },
      `Request body is larger than ${setting}. Increase ${setting} to accept it.`,
    );
  }
  next(err);
};

/** The error body-parser raises when a request body is over its limit. */
interface PayloadTooLargeError {
  type: "entity.too.large";
  length?: number;
  limit?: number;
}

function isPayloadTooLarge(err: unknown): err is PayloadTooLargeError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    err.type === "entity.too.large"
  );
}
