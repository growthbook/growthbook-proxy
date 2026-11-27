import http from "http";
import { AddressInfo } from "net";
import express from "express";
import logger from "../services/logger";
import { featuresRouter } from "../controllers/featuresController";
import { registrar } from "../services/registrar";
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
      expect.stringContaining("Increase MAX_FEATURES_PAYLOAD_SIZE"),
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

describe("limits on the proxy's routes", () => {
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
    enableRemoteEval: true,
    enableStickyBucketing: false,
    enableRemoteSavedGroups: false,
    proxyAllRequests: false,
  };
  const servers: http.Server[] = [];
  const env = { ...process.env };
  beforeEach(() => {
    // Only a push that could be signed gets its body read
    registrar.setConnection("sdk-abc", {
      apiKey: "sdk-abc",
      signingKey: "secret",
    });
    delete process.env.MAX_PAYLOAD_SIZE;
    delete process.env.MAX_FEATURES_PAYLOAD_SIZE;
  });
  afterEach(() => {
    registrar.deleteConnection("sdk-abc");
    process.env = { ...env };
    servers.splice(0).forEach((server) => server.close());
  });

  // Built per test, since the routes read the limits when they're created
  const send = (path: string, bytes: number, signature = "0".repeat(64)) => {
    const app = express();
    app.use("/", featuresRouter(ctx));
    app.use(payloadTooLargeMiddleware);
    const server = http.createServer(app).listen(0);
    servers.push(server);
    return fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GrowthBook-Api-Key": "sdk-abc",
          ...(signature ? { "X-GrowthBook-Signature": signature } : {}),
        },
        body: JSON.stringify({ attributes: { a: "x".repeat(bytes) } }),
      },
    );
  };
  const push = (bytes: number) => send("/proxy/features", bytes);
  const evaluate = (bytes: number) => send("/api/eval/sdk-abc", bytes);

  test("accepts a pushed payload between 2 MB and 16 MB", async () => {
    // Past the size check: rejected only for the wrong signature
    expect((await push(3 * MB)).status).toBe(401);
  });

  test("turns away an unsigned push without reading its body", async () => {
    expect((await send("/proxy/features", 17 * MB, "")).status).toBe(401);
    expect((await send("/proxy/features", 17 * MB, "abc")).status).toBe(401);
  });

  test("turns away a push for a key with no signing key", async () => {
    registrar.deleteConnection("sdk-abc");
    expect((await push(17 * MB)).status).toBe(400);
  });

  test("rejects a pushed payload over 16 MB, naming the setting to change", async () => {
    expect((await push(17 * MB)).status).toBe(413);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/proxy/features" }),
      expect.stringContaining("Increase MAX_FEATURES_PAYLOAD_SIZE"),
    );
  });

  test("keeps remote evaluation requests at 2 MB", async () => {
    expect((await evaluate(3 * MB)).status).toBe(413);
    expect(warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Increase MAX_PAYLOAD_SIZE"),
    );
  });

  test("applies MAX_PAYLOAD_SIZE to pushes when MAX_FEATURES_PAYLOAD_SIZE isn't set", async () => {
    process.env.MAX_PAYLOAD_SIZE = "1mb";

    expect((await push(2 * MB)).status).toBe(413);
  });

  test("prefers MAX_FEATURES_PAYLOAD_SIZE for pushes", async () => {
    process.env.MAX_PAYLOAD_SIZE = "1mb";
    process.env.MAX_FEATURES_PAYLOAD_SIZE = "4mb";

    expect((await push(2 * MB)).status).not.toBe(413);
  });
});
