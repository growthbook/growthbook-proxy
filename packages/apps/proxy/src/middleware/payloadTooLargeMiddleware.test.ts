import http from "http";
import { AddressInfo } from "net";
import express from "express";
import logger from "../services/logger";
import { featuresRouter } from "../controllers/featuresController";
import { Context } from "../types";
import { payloadTooLargeMiddleware } from "./payloadTooLargeMiddleware";

const serve = (limit: string) => {
  const app = express();
  app.post("/proxy/features", express.json({ limit }), (req, res) => {
    res.json({ message: "Success" });
  });
  app.use(payloadTooLargeMiddleware);
  return http.createServer(app).listen(0);
};

const post = (server: http.Server, body: string) =>
  fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/proxy/features`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

test("logs and rejects a body over the limit", async () => {
  const server = serve("10b");
  try {
    const res = await post(server, JSON.stringify({ features: { a: 1 } }));

    expect(res.status).toBe(413);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/proxy/features", limit: 10 }),
      expect.stringContaining("Increase MAX_PAYLOAD_SIZE"),
    );
  } finally {
    server.close();
  }
});

test("doesn't log a body under the limit", async () => {
  const server = serve("1kb");
  try {
    const res = await post(server, "{}");

    expect(res.status).toBe(200);
    expect(warn).not.toHaveBeenCalled();
  } finally {
    server.close();
  }
});

describe("default limit on pushes from GrowthBook", () => {
  const MB = 1024 * 1024;
  const ctx: Context = {
    growthbookApiHost: "",
    secretApiKey: "",
    createConnectionsFromEnv: false,
    pollForConnections: false,
    connectionPollingFrequency: 60000,
    enableCache: false,
    enableHealthCheck: false,
    enableCors: false,
    enableAdmin: false,
    enableEventStream: false,
    enableEventStreamHeaders: false,
    enableRemoteEval: false,
    enableStickyBucketing: false,
    enableRemoteSavedGroups: false,
    proxyAllRequests: false,
  };
  let server: http.Server;
  beforeAll(() => {
    delete process.env.MAX_PAYLOAD_SIZE;
    const app = express();
    app.use("/", featuresRouter(ctx));
    app.use(payloadTooLargeMiddleware);
    server = http.createServer(app).listen(0);
  });
  afterAll(() => server.close());

  const pushPayload = (bytes: number) =>
    fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/proxy/features`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GrowthBook-Api-Key": "sdk-abc",
        },
        body: JSON.stringify({ features: { a: "x".repeat(bytes) } }),
      },
    );

  test("accepts a payload between 2 MB and 16 MB", async () => {
    const res = await pushPayload(3 * MB);

    // Past the size check: rejected later only for the missing signing key
    expect(res.status).not.toBe(413);
  });

  test("rejects a payload over 16 MB", async () => {
    const res = await pushPayload(17 * MB);

    expect(res.status).toBe(413);
  });
});
