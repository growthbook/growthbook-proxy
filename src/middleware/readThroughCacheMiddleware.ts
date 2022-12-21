import {createProxyMiddleware, responseInterceptor} from "http-proxy-middleware";
import {Request, Response} from "express";
import {MemoryCache} from "../services/cache/MemoryCache";

export default ({
  targetUrl,
  cache,
}: {
  targetUrl: string;
  cache: MemoryCache;
}) => createProxyMiddleware({
  target: targetUrl,
  changeOrigin: true,
  selfHandleResponse: true,
  onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: Request, res: Response) => {
    console.log('cache MISS, setting cache...');
    const response = responseBuffer.toString('utf-8');
    if (res.statusCode === 200) {
      // refresh the cache
      let responseJson = {};
      // todo: may not work for encrypted endpoints
      try {
        responseJson = JSON.parse(response);
        if (res.locals.apiKey) {
          await cache.set(res.locals.apiKey, responseJson);
        }
      } catch (e) {
        console.error("Unable to parse response", e);
      }
    }
    return response;
  })
})