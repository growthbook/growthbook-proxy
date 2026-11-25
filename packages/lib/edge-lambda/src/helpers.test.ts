import type { CloudFrontRequest, CloudFrontResultResponse } from "aws-lambda";
import {
  getCookie,
  responseToCloudFrontFormat,
  sendResponse,
  setCookie,
} from "./helpers";

const MAX_AGE = 400 * 24 * 60 * 60; // 400 days, in seconds

function request(...cookieHeaders: string[]) {
  return {
    headers: {
      cookie: cookieHeaders.map((value) => ({ key: "Cookie", value })),
    },
  } as unknown as CloudFrontRequest;
}

describe("setCookie", () => {
  it("adds Set-Cookie headers to a CloudFront response", () => {
    const res: CloudFrontResultResponse = { status: "200" };
    setCookie(res, "gbuuid", "abc");
    setCookie(res, "other", "x y");
    expect(res.headers?.["set-cookie"]).toEqual([
      { key: "Set-Cookie", value: `gbuuid=abc; Max-Age=${MAX_AGE}; Path=/` },
      { key: "Set-Cookie", value: `other=x%20y; Max-Age=${MAX_AGE}; Path=/` },
    ]);
    expect(res.headers?.cookie).toBeUndefined();
  });

  it("appends to a fetch Response", () => {
    const res = new Response(null, { status: 302 });
    setCookie(res, "gbuuid", "abc");
    expect(res.headers.getSetCookie()).toEqual([
      `gbuuid=abc; Max-Age=${MAX_AGE}; Path=/`,
    ]);
  });
});

describe("getCookie", () => {
  it("reads values with = and across Cookie headers", () => {
    const req = request("a=1; token=x=y", "json=%7B%22k%22%3A1%7D");
    expect(getCookie(req, "token")).toBe("x=y");
    expect(getCookie(req, "json")).toBe('{"k":1}');
    expect(getCookie(req, "missing")).toBe("");
    expect(getCookie(request(), "a")).toBe("");
  });

  it("reads back what setCookie wrote", () => {
    const res: CloudFrontResultResponse = { status: "200" };
    setCookie(res, "sticky", '{"a":"b=c; d"}');
    const written = res.headers?.["set-cookie"]?.[0].value.split(";")[0] ?? "";
    expect(getCookie(request(written), "sticky")).toBe('{"a":"b=c; d"}');
  });
});

describe("sendResponse", () => {
  it("sets queued cookies", () => {
    const ctx = { helpers: { setCookie } } as unknown as Parameters<
      typeof sendResponse
    >[0];
    const res = sendResponse(ctx, undefined, {}, "", { gbuuid: "abc" });
    expect(res.headers?.["set-cookie"]).toEqual([
      { key: "Set-Cookie", value: `gbuuid=abc; Max-Age=${MAX_AGE}; Path=/` },
    ]);
  });
});

describe("responseToCloudFrontFormat", () => {
  it("keeps each Set-Cookie header separate", async () => {
    const res = await responseToCloudFrontFormat(
      new Response("moved", {
        status: 302,
        headers: [
          ["location", "/next"],
          ["set-cookie", "a=1"],
          ["set-cookie", "b=2"],
        ],
      }),
    );
    expect(res.status).toBe("302");
    expect(res.headers?.location).toEqual([
      { key: "location", value: "/next" },
    ]);
    expect(res.headers?.["set-cookie"]).toEqual([
      { key: "Set-Cookie", value: "a=1" },
      { key: "Set-Cookie", value: "b=2" },
    ]);
  });
});
