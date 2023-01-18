import {
  createProxyMiddleware,
  RequestHandler,
  responseInterceptor,
} from "http-proxy-middleware";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";
import { registrar } from "../../services/registrar";
import logger from "../../services/logger";

const scopedMiddlewares: Record<string, RequestHandler> = {};

const interceptor = responseInterceptor(
  async (responseBuffer, proxyRes, req: Request, res: Response) => {
    const response = responseBuffer.toString("utf-8");
    if (!featuresCache) {
      return response;
    }

    logger.debug("cache MISS, setting cache...");
    if (res.statusCode === 200) {
      // refresh the cache
      try {
        const responseJson = JSON.parse(response);
        featuresCache
          .set(res.locals.apiKey, responseJson)
          .catch((e) => logger.error(e, "Unable to set cache"));
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
