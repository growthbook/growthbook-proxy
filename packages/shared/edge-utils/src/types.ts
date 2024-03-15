import { Attributes } from "@growthbook/growthbook";

export interface Context {
  config: Config;
  helpers: Helpers;
}

export interface Config {
  crypto?: Crypto;
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
  getRequestURL?: () => string;
  getRequestHeader?: (key: string) => string;
  setResponseHeader?: (key: string, value: string) => void;
  getCookieAttributes?: () => Attributes;
  setCookieAttributes?: (attributes: Attributes) => void;
}
