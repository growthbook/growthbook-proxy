import { Request, Response } from "express";
import { Context } from "@growthbook/edge-utils";
import { Attributes } from "@growthbook/growthbook";

export function getRequestURL(req: Request) {
  return req.protocol + "://" + req.get("host") + req.originalUrl;
}

export function getRequestHeader(req: Request, key: string) {
  return req.get(key);
}

export function setResponseHeader(res: Response, key: string, value: string) {
  res.setHeader(key, value);
}

export function getCookieAttributes(ctx: Context, req: Request): Attributes {
  const cookieName = ctx.config.attributeCookieName || "gb-user-attributes";
  const cookie = req.cookies[cookieName];
  if (!cookie) return {};
  try {
    return JSON.parse(cookie);
  } catch (e) {}
  return {};
}

export function setCookieAttributes(ctx: Context, res: Response, attributes: Attributes) {
  const cookieName = ctx.config.attributeCookieName || "gb-user-attributes";
  res.cookie(
    encodeURIComponent(cookieName),
    JSON.stringify(attributes),
    {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    }
  );
}
