import { Request, Response } from "express";
import { apiKeyMiddleware } from "./apiKeyMiddleware";

const run = (originalUrl: string, header?: string) => {
  const req = {
    originalUrl,
    headers: header ? { "x-growthbook-api-key": header } : {},
    app: { locals: {} },
  } as unknown as Request;
  const res = { locals: {} as Record<string, unknown>, statusCode: 0 };
  const next = jest.fn();
  Object.assign(res, {
    status: (code: number) => ((res.statusCode = code), res),
    json: () => res,
  });
  apiKeyMiddleware(req, res as unknown as Response, next);
  return { status: res.statusCode, apiKey: res.locals.apiKey, next };
};

test.each([
  "/api/features/sdk-path",
  "/sub/sdk-path",
  "/api/eval/sdk-path?x=1",
])("%s: takes the key from the path and rejects a different header", (url) => {
  expect(run(url).apiKey).toBe("sdk-path");
  expect(run(url, "sdk-path").apiKey).toBe("sdk-path");

  const mismatch = run(url, "sdk-other");
  expect(mismatch.status).toBe(400);
  expect(mismatch.apiKey).toBeUndefined();
  expect(mismatch.next).not.toHaveBeenCalled();
});

test("/proxy/features: takes the key from the header", () => {
  expect(run("/proxy/features", "sdk-header").apiKey).toBe("sdk-header");
  expect(run("/proxy/features").status).toBe(401);
});
