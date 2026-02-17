import { Context, FetchOptions, getOriginUrl } from "@growthbook/edge-utils";
import type { CloudFrontRequest, CloudFrontResultResponse } from "aws-lambda";
import cookie from "cookie";
import { Env } from "./init";

function cloudFrontHeadersToRecord(headers: CloudFrontRequest["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, arr] of Object.entries(headers)) {
    const v = arr?.[0]?.value;
    if (v != null) out[k] = v;
  }
  return out;
}

export function buildGetRequestURL(env: Env) {
  const envHost = env.host;
  const envProtocol = env.protocol;
  const envPort = env.port;

  return function getRequestURL(req: CloudFrontRequest): string {
    const host = (envHost || req.headers?.host?.[0]?.value) ?? "";
    const protocol = envProtocol || "https";
    const port = envPort || (protocol === "https" ? 443 : 80);
    const portStr =
      (protocol === "http" && port === 80) ||
      (protocol === "https" && port == 443)
        ? ""
        : `:${port}`;
    const path = req.uri;
    const queryString = req.querystring ? `?${req.querystring}` : "";

    return `${protocol}://${host}${portStr}${path}${queryString}`;
  };
}

export function getRequestMethod(req: CloudFrontRequest): string {
  return req.method.toUpperCase();
}

export function getRequestHeader(req: CloudFrontRequest, key: string): string | undefined {
  return req.headers?.[key]?.[0]?.value;
}

export function sendResponse(
  ctx: Context<CloudFrontRequest, CloudFrontResultResponse>,
  _res?: CloudFrontResultResponse,
  headers?: Record<string, string | undefined>,
  body?: string,
  cookies?: Record<string, string>,
  status?: number,
): CloudFrontResultResponse {
  const res: CloudFrontResultResponse = {
    status: String(status ?? "200"),
    body: body ?? "",
  };
  if (headers) {
    const headersObj: CloudFrontResultResponse["headers"] = {};
    for (const key in headers) {
      const v = headers[key];
      if (v != null) headersObj[key] = [{ key, value: v }];
    }
    res.headers = headersObj;
  }
  if (cookies) {
    for (const key in cookies) {
      ctx.helpers.setCookie?.(res, key, cookies[key]);
    }
  }
  return res;
}

export async function fetchFn(
  ctx: Context<CloudFrontRequest, CloudFrontResultResponse>,
  url: string,
  req: CloudFrontRequest,
  options?: FetchOptions,
): Promise<Response> {
  const maxRedirects = 5;
  const headerRecord = cloudFrontHeadersToRecord(req.headers);
  const newHeaders = new Headers(headerRecord);
  if (ctx.config.nocacheOrigin) {
    newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate"); // try to prevent 304s
  }
  if (options?.additionalHeaders && typeof options.additionalHeaders === "object") {
    for (const [key, value] of Object.entries(options.additionalHeaders)) {
      if (value != null) newHeaders.set(key, String(value));
    }
  }

  const body = req.body?.data ?? undefined;
  let response = await fetch(url, {
    method: req.method,
    headers: newHeaders,
    body,
  });
  if (!ctx.config.followRedirects) {
    return response;
  }

  let location = response.headers.get('location');
  let redirectCount = 0;

  while (response.status >= 300 && response.status < 400 && location && redirectCount < maxRedirects) {
    response = await fetch(location, {
      method: req.method,
      headers: newHeaders,
      body,
    });
    location = response.headers.get("location");
    redirectCount++;
  }

  return response;
}

export async function proxyRequest(
  ctx: Context<CloudFrontRequest, CloudFrontResultResponse>,
  req: CloudFrontRequest,
): Promise<Response> {
  const requestUrl = ctx.helpers.getRequestURL(req);
  const originUrl = getOriginUrl(ctx as Context<unknown, unknown>, requestUrl);
  return fetchFn(ctx, originUrl, req);
}

// Convert Fetch Response to CloudFront format (e.g. proxyRequest or 4xx pass-through).
export async function responseToCloudFrontFormat(response: Response): Promise<CloudFrontResultResponse> {
  const body = await response.text();
  const res: CloudFrontResultResponse = {
    status: String(response.status),
    body,
  };
  if (response.headers) {
    const headersObj: CloudFrontResultResponse["headers"] = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = [{ key, value }];
    });
    res.headers = headersObj;
  }
  return res;
}

export function getCookie(req: CloudFrontRequest, key: string): string {
  const parsedCookie: Record<string, string> = {};
  const cookieHeader = req?.headers?.cookie;
  if (cookieHeader) {
    for (const entry of cookieHeader) {
      const raw = entry?.value;
      if (!raw) continue;
      raw.split(";").forEach((part: string) => {
        const [c0, c1] = part.split("=");
        if (c0) {
          parsedCookie[c0.trim()] = c1 ? decodeURIComponent(c1.trim()) : "";
        }
      });
    }
  }
  return parsedCookie[key] ?? "";
}

export function setCookie(res: CloudFrontResultResponse, key: string, value: string): void {
  const COOKIE_DAYS = 400; // max cookie duration (days) for Chrome
  const serialized = cookie.serialize(key, value, {
    maxAge: 24 * 60 * 60 * 1000 * COOKIE_DAYS,
  });
  if (!res.headers) res.headers = {};
  if (!res.headers["cookie"]) res.headers["cookie"] = [];
  res.headers["cookie"].push({ key, value: serialized });
}
