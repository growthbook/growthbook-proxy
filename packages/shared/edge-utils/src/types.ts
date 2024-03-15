/* eslint-disable @typescript-eslint/no-explicit-any */
import { Attributes } from "@growthbook/growthbook";

export interface Context {
  config: Config;
  helpers: Helpers;
}

export interface Config {
  environment?: string;
  crypto?: any;
  maxPayloadSize?: string;
  attributeCookieName?: string;
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
  getRequestURL?: (req: any) => string;
  getRequestHeader?: (req: any, key: string) => string | undefined;
  setResponseHeader?: (res: any, key: string, value: string) => void;
  getCookieAttributes?: (ctx: Context, req: any) => Attributes;
  setCookieAttributes?: (ctx: Context, res: any, attributes: Attributes) => void;
}
