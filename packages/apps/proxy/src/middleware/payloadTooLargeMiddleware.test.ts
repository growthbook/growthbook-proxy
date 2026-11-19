import http from "http";
import { AddressInfo } from "net";
import express from "express";
import logger from "../services/logger";
import { MAX_PAYLOAD_SIZE } from "../init";
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

test("accepts a 16 MB payload by default", () => {
  expect(MAX_PAYLOAD_SIZE).toBe("16mb");
});
