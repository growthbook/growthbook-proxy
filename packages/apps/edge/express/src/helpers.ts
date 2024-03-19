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
export function sendResonse(res: Response, body: string) {
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

export function getCookieAttributes(ctx: Context, req: Request): Attributes {
  const cookieName = ctx.config.attributeCookieName || "gb-user-attributes";
  const cookie = req.cookies[cookieName];
  if (!cookie) return {};
  try {
    return JSON.parse(cookie);
  } catch (e) {
    // ignore
  }
  return {};
}

export function setCookieAttributes(
  ctx: Context,
  res: Response,
  attributes: Attributes,
) {
  const cookieName = ctx.config.attributeCookieName || "gb-user-attributes";
  res.cookie(encodeURIComponent(cookieName), JSON.stringify(attributes), {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  });
}
