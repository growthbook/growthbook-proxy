import { NextFunction, Request, Response } from "express";
import { Context } from "@growthbook/edge-utils";
import proxy from "express-http-proxy";

export function getRequestURL(req: Request) {
  return req.protocol + "://" + req.get("host") + req.originalUrl;
}

export function getRequestMethod(req: Request) {
  return req.method.toUpperCase();
}

export function getRequestHeader(req: Request, key: string) {
  return req.get(key);
}

export function sendResponse(
  ctx: Context<Request, Response>,
  res?: Response,
  headers?: Record<string, any>,
  body?: string,
  cookies?: Record<string, string>,
  status?: number
) {
  if (!res) {
    throw new Error("missing response");
  }
  if (headers) {
    for (const key in headers) {
      res.setHeader(key, headers[key]);
    }
  }
  if (cookies) {
    for (const key in cookies) {
      ctx.helpers.setCookie?.(res, key, cookies[key]);
    }
  }
  return res.status(status || 200).send(body || "");
}

export async function fetchFn(ctx: Context<Request, Response>, url: string) {
  // @ts-ignore
  return fetch(url) as Promise<Response>;
}

// cache proxy function
let proxyFn: ReturnType<typeof proxy> | undefined = undefined;
export async function proxyRequest(
  ctx: Context<Request, Response>,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!proxyFn)
    proxyFn = proxy(ctx.config.proxyTarget, {
      limit: ctx.config.maxPayloadSize,
    });
  return proxyFn(req, res, next);
}

export function getCookie(req: Request, key: string): string {
  const cookie = req.cookies[key];
  return cookie || "";
}

export function setCookie(res: Response, key: string, value: string) {
  const COOKIE_DAYS = 400; // 400 days is the max cookie duration for chrome
  res.cookie(key, value, {
    maxAge: 24 * 60 * 60 * 1000 * COOKIE_DAYS,
  });
}
