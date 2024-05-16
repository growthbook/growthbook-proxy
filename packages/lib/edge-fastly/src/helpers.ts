import { Context, getOriginUrl } from "@growthbook/edge-utils";
import { parse } from "cookie";
import { FastlyConfig } from "./init";

export function getRequestURL(req: Request): string {
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

export function fetchFn(ctx: Context<Request, Response>, url: string) {
  return fetch(
    url,
    // @ts-ignore
    { backend: getBackend(ctx, url) }
  );
}

export function proxyRequest(ctx: Context<Request, Response>, req: Request) {
  const originUrl = getOriginUrl(ctx as Context<unknown, unknown>, req.url);
  return fetch(originUrl, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    // @ts-ignoreZ
    backend: getBackend(ctx, originUrl),
  });
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

function getBackend(ctx: Context<Request, Response>, url: string): string | undefined {
  const config = ctx.config as FastlyConfig;
  if (!config.backends) return;
  const urlObj = new URL(url);
  return config?.backends?.[urlObj.origin];
}
