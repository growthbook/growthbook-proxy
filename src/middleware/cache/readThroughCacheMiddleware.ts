import {
  createProxyMiddleware,
  RequestHandler,
  responseInterceptor,
} from "http-proxy-middleware";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";
import { registrar } from "../../services/registrar";
import logger from "../../services/logger";
import { eventStreamManager } from "../../services/eventStreamManager";

const scopedMiddlewares: Record<string, RequestHandler> = {};

const interceptor = responseInterceptor(
  async (responseBuffer, proxyRes, req: Request, res: Response) => {
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

export default ({ proxyTarget }: { proxyTarget: string }) => {
  if (!scopedMiddlewares[registrar.growthbookApiHost]) {
    scopedMiddlewares[registrar.growthbookApiHost] = createProxyMiddleware({
      target: proxyTarget,
      changeOrigin: true,
      selfHandleResponse: true,
      onProxyRes: interceptor,
    });
  }

  return scopedMiddlewares[registrar.growthbookApiHost];
};
