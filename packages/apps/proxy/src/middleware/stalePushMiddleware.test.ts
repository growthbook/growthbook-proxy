import { Request, Response } from "express";
import logger from "../services/logger";
import { stalePushMiddleware } from "./stalePushMiddleware";

let cached: unknown;
jest.mock("../services/cache", () => ({
  featuresCache: {
    get: async () => (cached ? { payload: cached } : undefined),
  },
}));

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-01-02T00:00:00.000Z";

const push = async (body: unknown) => {
  const next = jest.fn();
  const res = { locals: { apiKey: "sdk-abc" }, status: jest.fn(), json() {} };
  res.status.mockReturnValue(res);
  await stalePushMiddleware(
    { body } as Request,
    res as unknown as Response,
    next,
  );
  return { accepted: next.mock.calls.length === 1, status: res.status };
};

beforeEach(() => jest.spyOn(logger, "warn").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test("ignores a push older than the cached payload", async () => {
  cached = { dateUpdated: NEW };
  const { accepted, status } = await push({ dateUpdated: OLD });
  expect(accepted).toBe(false);
  expect(status).toHaveBeenCalledWith(200);
});

test.each([
  ["newer", { dateUpdated: OLD }, { dateUpdated: NEW }],
  ["the same age", { dateUpdated: NEW }, { dateUpdated: NEW }],
  ["undated", { dateUpdated: NEW }, { features: {} }],
  ["first, with an empty cache", undefined, { dateUpdated: OLD }],
  ["newer than an undated cache", { features: {} }, { dateUpdated: OLD }],
])("accepts a push that is %s", async (_, cache, body) => {
  cached = cache;
  expect((await push(body)).accepted).toBe(true);
});
