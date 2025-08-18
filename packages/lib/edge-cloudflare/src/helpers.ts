import { Context, FetchOptions, getOriginUrl } from "@growthbook/edge-utils";
import { parse } from "cookie";

export function getRequestURL(req: Request) {
  return req.url;
}

export function getRequestMethod(req: Request) {
  return req.method.toUpperCase();
}

export function getRequestHeader(req: Request, key: string) {
  return req.headers.get(key) || undefined;
}

export function sendResponse(
  ctx: Context<Request, Response>,
  _?: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headers?: Record<string, any>,
  body?: string,
  cookies?: Record<string, string>,
  status?: number,
) {
  const resp = new Response(body, { headers, status });
  if (cookies) {
    for (const key in cookies) {
      ctx.helpers.setCookie?.(resp, key, cookies[key]);
    }
  }
  return resp;
}

export function fetchFn(
  ctx: Context<Request, Response>,
  url: string,
  req: Request,
  options?: FetchOptions,
) {
  const newHeaders = new Headers(req.headers);
  if (ctx.config.nocacheOrigin) {
    // try to prevent 304s:
    newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  if (options?.additionalHeaders && typeof options.additionalHeaders === "object") {
    Object.keys(options.additionalHeaders).forEach((key) => {
      newHeaders.set(key, options?.additionalHeaders?.[key]);
    });
  }

  const newRequest = new Request(url, {
    method: req.method,
    headers: newHeaders,
    body: req.body,
    redirect: ctx.config.followRedirects ? "follow" : "manual",
  });
  return fetch(newRequest);
}

export function proxyRequest(ctx: Context<Request, Response>, req: Request) {
  const originUrl = getOriginUrl(ctx as Context<unknown, unknown>, req.url);
  return fetchFn(ctx, originUrl, req);
}

export function getCookie(req: Request, key: string): string {
  const cookies = parse(req.headers.get("Cookie") || "");
  return cookies[key] || "";
}

export function setCookie(res: Response, key: string, value: string) {
  const COOKIE_DAYS = 400; // 400 days is the max cookie duration for chrome
  const escapedKey = encodeURIComponent(key);
  const escapedValue = encodeURIComponent(value);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000 * COOKIE_DAYS);
  res.headers.append(
    "Set-Cookie",
    `${escapedKey}=${escapedValue}; Path=/; Expires=${expires.toUTCString()};`,
  );
}
