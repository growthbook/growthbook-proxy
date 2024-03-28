import { NextFunction, Request, Response } from "express";
import { Context } from "@growthbook/edge-utils";
import { Attributes } from "@growthbook/growthbook";
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

export function setResponseHeader(res: Response, key: string, value: string) {
  res.setHeader(key, value);
}
export function sendResponse(res: Response, body: string) {
  return res.send(body);
}

export async function fetchFn(_: Context, url: string) {
  return fetch(url);
}

// cache proxy function
let proxyFn: ReturnType<typeof proxy> | undefined = undefined;
export async function proxyRequest(
  ctx: Context,
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

export function getUUIDCookie(ctx: Context, req: Request): string {
  const cookieName = ctx.config.uuidCookieName || "gbuuid";
  const cookie = req.cookies[cookieName];
  return cookie || "";
}
