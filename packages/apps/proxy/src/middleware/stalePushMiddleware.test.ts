import { createHmac } from "crypto";
import http from "http";
import { AddressInfo } from "net";
import express from "express";
import { featuresRouter } from "../controllers/featuresController";
import { Context } from "../types";

type Payload = { dateUpdated?: string };
const store = new Map<string, Payload>();
jest.mock("../services/cache", () => ({
  featuresCache: {
    get: async (k: string) =>
      store.has(k) ? { payload: store.get(k) } : undefined,
    set: async (k: string, v: Payload) => void store.set(k, v),
  },
}));
jest.mock("../services/registrar", () => ({
  registrar: { getConnection: () => ({ signingKey: "secret" }) },
}));
jest.mock("../services/logger", () => ({
  __esModule: true,
  default: { warn() {}, info() {}, error() {}, debug() {} },
}));

const OLD = { dateUpdated: "2026-01-01T00:00:00.000Z" };
const NEW = { dateUpdated: "2026-01-02T00:00:00.000Z" };

let server: http.Server;
beforeAll(() => {
  const app = express();
  app.use("/", featuresRouter({} as Context));
  server = http.createServer(app).listen(0);
});
afterAll(() => server.close());
beforeEach(() => store.clear());

const push = async (apiKey: string, payload: Payload) => {
  const body = JSON.stringify(payload);
  const res = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/proxy/features`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GrowthBook-Api-Key": apiKey,
        "X-GrowthBook-Signature": createHmac("sha256", "secret")
          .update(body)
          .digest("hex"),
      },
      body,
    },
  );
  expect(res.status).toBe(200);
};

test("ignores a push older than the cached payload", async () => {
  await push("sdk-a", NEW);
  await push("sdk-a", OLD);
  expect(store.get("sdk-a")).toEqual(NEW);
});

test("accepts a newer push, and the same one again", async () => {
  await push("sdk-b", OLD);
  await push("sdk-b", NEW);
  await push("sdk-b", NEW);
  expect(store.get("sdk-b")).toEqual(NEW);
});

test("still ignores an older push after the cache entry is gone", async () => {
  await push("sdk-d", NEW);
  store.clear();
  await push("sdk-d", OLD);
  expect(store.has("sdk-d")).toBe(false);
});

test("ignores an undated push once a dated one is known", async () => {
  await push("sdk-e", {});
  expect(store.get("sdk-e")).toEqual({});
  await push("sdk-e", NEW);
  await push("sdk-e", {});
  expect(store.get("sdk-e")).toEqual(NEW);
});
