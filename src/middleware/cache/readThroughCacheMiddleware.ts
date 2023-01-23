import {
  createProxyMiddleware,
  RequestHandler,
  responseInterceptor,
} from "http-proxy-middleware";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";
import logger from "../../services/logger";
import { eventStreamManager } from "../../services/eventStreamManager";

const scopedMiddlewares: Record<string, RequestHandler> = {};
const errorCounts: Record<string, number> = {};

const interceptor = (proxyTarget: string) =>
  responseInterceptor(
    async (responseBuffer, proxyRes, req: Request, res: Response) => {
      // got response, reset error count
      errorCounts[proxyTarget] = 0;

      const response = responseBuffer.toString("utf-8");
      if (!featuresCache) {
        return response;
      }

      if (res.statusCode === 200) {
        logger.debug("cache MISS, setting cache...");

        // refresh the cache
        try {
          const apiKey = res.locals.apiKey;
          const responseJson = JSON.parse(response);
          const oldEntry = await featuresCache.get(apiKey);

          featuresCache
            .set(apiKey, responseJson)
            .catch((e) => logger.error(e, "Unable to set cache"));

          eventStreamManager.publish(
            apiKey,
            "features",
            responseJson,
            oldEntry?.payload
          );
        } catch (e) {
          logger.error(e, "Unable to parse response");
        }
      }
      return response;
    }
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
      onProxyRes: interceptor(proxyTarget),
      onError: (err, req, res) => {
        logger.error(err, "proxy error");
        errorCounts[proxyTarget] = (errorCounts[proxyTarget] || 0) + 1;
        res.status(500).json({ message: "Proxy error" });
      },
      logLevel: "silent",
    });
  }

  return scopedMiddlewares[proxyTarget];
};
