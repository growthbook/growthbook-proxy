import {
  createProxyMiddleware,
  RequestHandler,
  responseInterceptor,
} from "http-proxy-middleware";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";
import { registrar } from "../../services/registrar";

const scopedMiddlewares: Record<string, RequestHandler> = {};

export default ({ proxyTarget }: { proxyTarget: string }) => {
  if (!scopedMiddlewares[registrar.apiHost]) {
    scopedMiddlewares[registrar.apiHost] = createProxyMiddleware({
      target: proxyTarget,
      changeOrigin: true,
      selfHandleResponse: true,
      onProxyRes: responseInterceptor(
        async (responseBuffer, proxyRes, req: Request, res: Response) => {
          featuresCache && console.debug("cache MISS, setting cache...");
          const response = responseBuffer.toString("utf-8");
          if (res.statusCode === 200) {
            // refresh the cache
            let responseJson = {};
            try {
              responseJson = JSON.parse(response);
              featuresCache &&
                (await featuresCache.set(res.locals.apiKey, responseJson));
            } catch (e) {
              console.error("Unable to parse response", e);
            }
          }
          return response;
        }
      ),
    });
  }

  return scopedMiddlewares[registrar.apiHost];
};
