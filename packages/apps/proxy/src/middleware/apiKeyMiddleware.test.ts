import http from "http";
import { AddressInfo } from "net";
import express from "express";
import { apiKeyMiddleware } from "./apiKeyMiddleware";

let server: http.Server;
beforeAll(() => {
  const app = express();
  const echo = (req: express.Request, res: express.Response) =>
    void res.json({ apiKey: res.locals.apiKey });
  app.get("/api/features/:apiKey", apiKeyMiddleware, echo);
  app.post("/proxy/features", apiKeyMiddleware, echo);
  server = http.createServer(app).listen(0);
});
afterAll(() => server.close());

const call = async (path: string, header?: string, method = "GET") => {
  const res = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
    { method, headers: header ? { "x-growthbook-api-key": header } : {} },
  );
  return { status: res.status, ...(await res.json()) };
};

test.each([
  "/api/features/sdk-path",
  "/API/Features/sdk-path",
  "/api/features/sdk-path/",
  "/api/features/sdk-path?x=api/sdk-other",
  "/api/features/sdk-pat%68",
])("%s: takes the key from the path", async (path) => {
  expect((await call(path)).apiKey).toBe("sdk-path");
  expect((await call(path, "sdk-path")).apiKey).toBe("sdk-path");
  expect((await call(path, "sdk-other")).status).toBe(400);
});

test.each(["...", "a%2Fb", "a%3Fb"])("rejects the key %s", async (key) => {
  expect((await call(`/api/features/${key}`)).status).toBe(400);
});

test("/proxy/features: takes the key from the header", async () => {
  expect((await call("/proxy/features", "sdk-header", "POST")).apiKey).toBe(
    "sdk-header",
  );
  expect((await call("/proxy/features", undefined, "POST")).status).toBe(401);
});
