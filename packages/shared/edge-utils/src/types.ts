/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Context {
  config: Config;
  helpers: Helpers;
}

export interface Config {
  proxyTarget: string;
  environment?: string;
  maxPayloadSize?: string;
  uuidCookieName?: string;
  scriptInjectionPattern?: string;
  crypto?: any;
  growthbook: {
    apiHost: string;
    clientKey: string;
    decryptionKey?: string;
    trackingCallback?: string; // (experiment, result) => void;
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
  sendResponse?: (res: any, body: string) => void;
  fetch?: (ctx: Context, url: string) => Promise<any>;
  proxyRequest?: (
    ctx: Context,
    req: any,
    res?: any,
    next?: any,
  ) => Promise<any>;
  // GB cookies
  getUUIDCookie?: (ctx: Context, req: any) => string;
}
