import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
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
    setCookie(res, "other", "1");
    expect(res.headers.getSetCookie()).toEqual([
      `gbuuid=abc; Max-Age=${MAX_AGE}; Path=/`,
      `other=1; Max-Age=${MAX_AGE}; Path=/`,
    ]);
  });

  it("appends to a fetched Response, whose headers are read-only", async () => {
    const server = http.createServer((_, res) => {
      res.writeHead(302, { location: "/next", "set-cookie": "origin=1" });
      res.end("moved");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        redirect: "manual",
      });
      setCookie(res, "gbuuid", "abc");
      setCookie(res, "other", "1");

      const cf = await responseToCloudFrontFormat(res);
      expect(cf.status).toBe("302");
      expect(cf.body).toBe("moved");
      expect(cf.headers?.["set-cookie"]).toEqual([
        { key: "Set-Cookie", value: "origin=1" },
        { key: "Set-Cookie", value: `gbuuid=abc; Max-Age=${MAX_AGE}; Path=/` },
        { key: "Set-Cookie", value: `other=1; Max-Age=${MAX_AGE}; Path=/` },
      ]);
    } finally {
      server.close();
    }
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
  it("sends each origin Set-Cookie and the queued cookies", () => {
    const ctx = { helpers: { setCookie } } as unknown as Parameters<
      typeof sendResponse
    >[0];
    const res = sendResponse(
      ctx,
      undefined,
      { "set-cookie": ["a=1", "b=2"] },
      "",
      {
        gbuuid: "abc",
      },
    );
    expect(res.headers?.["set-cookie"]).toEqual([
      { key: "set-cookie", value: "a=1" },
      { key: "set-cookie", value: "b=2" },
      { key: "Set-Cookie", value: `gbuuid=abc; Max-Age=${MAX_AGE}; Path=/` },
    ]);
  });

  it("drops headers CloudFront rejects", () => {
    const ctx = { helpers: { setCookie } } as unknown as Parameters<
      typeof sendResponse
    >[0];
    const res = sendResponse(
      ctx,
      undefined,
      {
        connection: "keep-alive",
        "keep-alive": "timeout=5",
        "content-length": "34",
        "x-amz-cf-id": "abc",
        "content-type": "text/html",
      },
      "<p>",
    );
    expect(Object.keys(res.headers ?? {})).toEqual(["content-type"]);
  });
});

describe("responseToCloudFrontFormat", () => {
  it("drops headers CloudFront rejects from a fetched response", async () => {
    const server = http.createServer((_, res) => {
      res.writeHead(200, {
        "content-type": "text/plain",
        "content-encoding": "gzip",
        "x-cache": "HIT",
        "x-custom": "1",
      });
      res.end(gzipSync("hello"));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { port } = server.address() as AddressInfo;
      const cf = await responseToCloudFrontFormat(
        await fetch(`http://127.0.0.1:${port}/`),
      );
      expect(cf.body).toBe("hello");
      expect(Object.keys(cf.headers ?? {}).sort()).toEqual([
        "content-type",
        "date",
        "x-custom",
      ]);
    } finally {
      server.close();
    }
  });
});
