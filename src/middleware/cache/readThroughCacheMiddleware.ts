import {
  createProxyMiddleware,
  RequestHandler,
  responseInterceptor,
} from "http-proxy-middleware";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";
import { registrar } from "../../services/registrar";

const scopedMiddlewares: Record<string, RequestHandler> = {};

const interceptor = responseInterceptor(
  async (responseBuffer, proxyRes, req: Request, res: Response) => {
    const response = responseBuffer.toString("utf-8");
    if (!featuresCache) {
      return response;
    }

    console.debug("cache MISS, setting cache...");
    if (res.statusCode === 200) {
      // refresh the cache
      try {
        const responseJson = JSON.parse(response);
        featuresCache
          .set(res.locals.apiKey, responseJson)
          .catch((e) => console.error("Unable to set cache", e));
      } catch (e) {
        console.error("Unable to parse response", e);
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
