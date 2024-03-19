/* eslint-disable @typescript-eslint/no-explicit-any */
import { Attributes } from "@growthbook/growthbook";

export interface Context {
  config: Config;
  helpers: Helpers;
}

export interface Config {
  proxyTarget: string;
  environment?: string;
  crypto?: any;
  maxPayloadSize?: string;
  attributeCookieName?: string;
  growthbook: {
    apiHost: string;
    clientKey: string;
  };
  attributeKeys: {
    uuid?: string;
    browser?: string;
    deviceType?: string;
    url?: string;
    path?: string;
    host?: string;
    query?: string;
  };
}

export interface Helpers {
  // routing
  getRequestURL?: (req: any) => string;
  getRequestMethod?: (req: any) => string;
  getRequestHeader?: (req: any, key: string) => string | undefined;
  setResponseHeader?: (res: any, key: string, value: string) => void;
  fetch?: (ctx: Context, url: string) => Promise<any>;
  proxyRequest?: (
    ctx: Context,
    req: any,
    res?: any,
    next?: any,
  ) => Promise<any>;
  // todo: piped/streamed fetch?
  // GB cookies
  getCookieAttributes?: (ctx: Context, req: any) => Attributes;
  setCookieAttributes?: (
    ctx: Context,
    res: any,
    attributes: Attributes,
  ) => void;
}
