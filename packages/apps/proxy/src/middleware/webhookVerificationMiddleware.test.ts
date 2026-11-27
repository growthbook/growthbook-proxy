import { createHmac } from "crypto";
import http from "http";
import { AddressInfo } from "net";
import express from "express";
import { featuresRouter } from "../controllers/featuresController";
import { Context } from "../types";

const set = jest.fn();
jest.mock("../services/cache", () => ({
  featuresCache: {
    get: async () => undefined,
    set: (...a: unknown[]) => set(...a),
  },
}));
jest.mock("../services/registrar", () => ({
  registrar: { getConnection: () => ({ signingKey: "secret" }) },
}));

const BODY = JSON.stringify({ features: {} });
const SIGNATURE = createHmac("sha256", "secret").update(BODY).digest("hex");

let server: http.Server;
beforeAll(() => {
  const app = express();
  app.use("/", featuresRouter({} as Context));
  server = http.createServer(app).listen(0);
});
afterAll(() => server.close());
beforeEach(() => set.mockClear());

const push = (init: { signature: string; type?: string; body?: string }) =>
  fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/proxy/features`,
    {
      method: "POST",
      headers: {
        ...(init.type && { "Content-Type": init.type }),
        "X-GrowthBook-Api-Key": "sdk-abc",
        "X-GrowthBook-Signature": init.signature,
      },
      body: init.body,
    },
  );

test("stores a correctly signed JSON push", async () => {
  const res = await push({
    signature: SIGNATURE,
    type: "application/json",
    body: BODY,
  });
  expect(res.status).toBe(200);
  expect(set).toHaveBeenCalledWith("sdk-abc", { features: {} });
});

test.each([
  ["a wrong signature", { type: "application/json", body: BODY }],
  ["a body that isn't JSON", { type: "text/plain", body: BODY }],
  ["no body", {}],
])("rejects a push with %s", async (_, init) => {
  const res = await push({ signature: "0".repeat(64), ...init });
  expect(res.status).toBe(401);
  expect(set).not.toHaveBeenCalled();
});

test("rejects a correctly signed body that isn't sent as JSON", async () => {
  const res = await push({
    signature: SIGNATURE,
    type: "text/plain",
    body: BODY,
  });
  expect(res.status).toBe(401);
  expect(set).not.toHaveBeenCalled();
});
