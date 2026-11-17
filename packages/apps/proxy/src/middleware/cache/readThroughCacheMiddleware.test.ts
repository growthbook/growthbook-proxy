import http from "http";
import { AddressInfo } from "net";
import express from "express";
import readThroughCacheMiddleware from "./readThroughCacheMiddleware";

const store = new Map<string, unknown>();
jest.mock("../../services/cache", () => ({
  featuresCache: {
    get: async (k: string) =>
      store.has(k) ? { payload: store.get(k) } : undefined,
    set: async (k: string, v: unknown) => void store.set(k, v),
  },
}));
jest.mock("../../services/eventStreamManager", () => ({
  eventStreamManager: { publish: () => {} },
}));
jest.mock("../../services/registrar", () => ({
  registrar: { getConnection: () => undefined },
}));

test("a conditional cache miss still fills the cache", async () => {
  const upstreamIfNoneMatch: (string | undefined)[] = [];
  const upstream = http
    .createServer((req, res) => {
      upstreamIfNoneMatch.push(req.headers["if-none-match"]);
      if (req.headers["if-none-match"] === 'W/"v1"') {
        return res.writeHead(304).end();
      }
      res
        .writeHead(200, { "content-type": "application/json", etag: 'W/"v1"' })
        .end('{"features":{}}');
    })
    .listen(0);
  const app = express();
  app.get("/api/features/:key", async (req, res, next) => {
    res.locals.apiKey = req.params.key;
    const middleware = await readThroughCacheMiddleware({
      proxyTarget: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    });
    middleware(req, res, next);
  });
  const proxy = app.listen(0);

  try {
    const res = await fetch(
      `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/api/features/sdk-x`,
      { headers: { "If-None-Match": 'W/"v1"' } },
    );

    expect(upstreamIfNoneMatch).toEqual([undefined]);
    expect(res.status).toBe(200);
    expect(store.get("sdk-x")).toEqual({ features: {} });
  } finally {
    upstream.close();
    proxy.close();
  }
});
