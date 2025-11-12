import { IncomingMessage, ServerResponse } from "http";
import { Response } from "express";
import {
  createProxyMiddleware,
  RequestHandler,
  responseInterceptor,
} from "http-proxy-middleware";
import { featuresCache } from "../../services/cache";
import logger from "../../services/logger";
import { eventStreamManager } from "../../services/eventStreamManager";
import { registrar } from "../../services/registrar";
import { parseJsonSafely } from "../../services/utils/jsonParser";

const scopedMiddlewares: Record<string, RequestHandler> = {};
const errorCounts: Record<string, number> = {};

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  if (buffer.buffer instanceof ArrayBuffer) {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  }
  return new Uint8Array(buffer).buffer;
}

async function processCacheUpdate(
  apiKey: string,
  responseJson: unknown,
): Promise<void> {
  if (!featuresCache) {
    throw new Error("Features cache not available");
  }

  try {
    const oldEntry = await featuresCache.get(apiKey);
    await featuresCache.set(apiKey, responseJson);

    const connection = registrar.getConnection(apiKey);
    const remoteEvalEnabled = !!connection?.remoteEvalEnabled;

    if (eventStreamManager) {
      eventStreamManager.publish({
        apiKey,
        event: remoteEvalEnabled ? "features-updated" : "features",
        payload: responseJson,
        oldPayload: oldEntry?.payload,
      });
    }
  } catch (error) {
    logger.error({ error, apiKey }, "Failed to update features cache");
    throw error;
  }
}

const interceptor = (proxyTarget: string) =>
  responseInterceptor(
    async (
      responseBuffer,
      proxyRes,
      req: IncomingMessage,
      res: ServerResponse,
    ) => {
      errorCounts[proxyTarget] = 0;

      if (!featuresCache || !eventStreamManager) {
        return responseBuffer.toString("utf-8");
      }

      if (res.statusCode === 200) {
        try {
          const apiKey = (res as Response).locals.apiKey;
          if (!apiKey) {
            logger.warn("Missing API key in response locals");
            return responseBuffer.toString("utf-8");
          }

          logger.debug({ apiKey }, "Cache miss, updating cache");

          const arrayBuffer = bufferToArrayBuffer(responseBuffer);
          const responseJson = await parseJsonSafely(arrayBuffer);

          await processCacheUpdate(apiKey, responseJson);
        } catch (error) {
          logger.error({ error }, "Failed to process cache update");
        }
      }

      return responseBuffer.toString("utf-8");
    },
  );

export default async ({ proxyTarget }: { proxyTarget: string }) => {
  // slow down requests to GrowthBook API if error counts are too high
  const errorCount = errorCounts[proxyTarget] || 0;
  if (errorCount > 5) {
    // maxes out around (7.6 ~ 15.2) seconds
    const delaySecs =
      Math.pow(1.5, Math.min(errorCount, 10) - 5) * (1 + Math.random());
    logger.debug(`Delaying request to ${proxyTarget} by ${delaySecs} seconds`);
    await new Promise((resolve) => setTimeout(resolve, delaySecs * 1000));
  }

  if (!scopedMiddlewares[proxyTarget]) {
    scopedMiddlewares[proxyTarget] = createProxyMiddleware({
      target: proxyTarget,
      changeOrigin: true,
      selfHandleResponse: true,
      on: {
        proxyRes: interceptor(proxyTarget),
        error: (err, req, res) => {
          logger.error(err, "proxy error");
          errorCounts[proxyTarget] = (errorCounts[proxyTarget] || 0) + 1;
          if ((res as ServerResponse)?.writeHead && !(res as ServerResponse).headersSent) {
            (res as ServerResponse)?.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res?.end(
            JSON.stringify({
              message: 'Proxy error',
            })
          );
        },
      },
      followRedirects: true,
      ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
        ? { secure: false }
        : {}),
    });
  }

  return scopedMiddlewares[proxyTarget];
};
