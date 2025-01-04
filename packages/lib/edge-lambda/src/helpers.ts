/* eslint-disable @typescript-eslint/no-explicit-any */

import { Context, getOriginUrl } from "@growthbook/edge-utils";
import cookie from "cookie";
import { Env } from "./init";

export function buildGetRequestURL(env: Env) {
  const envHost = env.host;
  const envProtocol = env.protocol;
  const envPort = env.port;

  return function getRequestURL(req: any) {
    const host = envHost || req.headers.host[0].value;
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

export function getRequestMethod(req: any) {
  return req.method.toUpperCase();
}

export function getRequestHeader(req: any, key: string) {
  return req.headers?.[key]?.value || undefined;
}

export function sendResponse(
  ctx: Context<Request, Response>,
  _?: any,
  headers?: Record<string, any>,
  body?: string,
  cookies?: Record<string, string>,
  status?: number,
) {
  const res: any = {
    status: String(status || "200"),
    body: body || "",
  };
  if (headers) {
    const headersObj: Record<string, { key: string; value: string }[]> = {};
    for (const key in headers) {
      headersObj[key] = [{ key, value: headers[key] }];
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

export async function fetchFn(ctx: Context<Request, Response>, url: string, req: any) {
  const maxRedirects = 5;

  let response = await fetch(url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  if (!ctx.config.followRedirects) {
    return response;
  }

  let location = response.headers.get('location');
  let redirectCount = 0;

  while (response.status >= 300 && response.status < 400 && location && redirectCount < maxRedirects) {
    response = await fetch(location, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    location = response.headers.get('location');
    redirectCount++;
  }

  return response;
}

export async function proxyRequest(ctx: Context<Request, Response>, req: any) {
  const originUrl = getOriginUrl(ctx as Context<unknown, unknown>, req.url);
  return fetch(originUrl, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
}

export function getCookie(req: any, key: string): string {
  const parsedCookie: Record<string, string> = {};
  if (req?.headers?.cookie) {
    for (let i = 0; i < (req?.headers?.cookie?.length || 0); i++) {
      req?.headers?.cookie?.[i]?.value?.split?.(";")?.forEach((cookie: string) => {
        if (cookie) {
          const [c0, c1] = cookie.split("=");
          if (c0) {
            parsedCookie[c0.trim()] = c1 ? decodeURIComponent(c1.trim()) : "";
          }
        }
      });
    }
  }
  return parsedCookie?.[key] || "";
}

export function setCookie(res: any, key: string, value: string) {
  const COOKIE_DAYS = 400; // 400 days is the max cookie duration for chrome
  const serialized = cookie.serialize(key, value, {
    maxAge: 24 * 60 * 60 * 1000 * COOKIE_DAYS,
  });
  if (!res.headers["cookie"]) {
    res.headers["cookie"] = [];
  }
  res.headers["cookie"].push({ key, value: serialized });
}
