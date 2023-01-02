import {
  createProxyMiddleware,
  responseInterceptor,
} from "http-proxy-middleware";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";

export default ({ proxyTarget }: { proxyTarget: string }) =>
  createProxyMiddleware({
    target: proxyTarget,
    changeOrigin: true,
    selfHandleResponse: true,
    onProxyRes: responseInterceptor(
      async (responseBuffer, proxyRes, req: Request, res: Response) => {
        console.debug("cache MISS, setting cache...");
        const response = responseBuffer.toString("utf-8");
        if (res.statusCode === 200) {
          // refresh the cache
          let responseJson = {};
          try {
            responseJson = JSON.parse(response);
            await featuresCache.set(res.locals.apiKey, responseJson);
          } catch (e) {
            console.error("Unable to parse response", e);
          }
        }
        return response;
      }
    ),
  });
