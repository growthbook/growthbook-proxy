/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Attributes,
  LocalStorageCompat,
  StickyBucketService,
  TrackingCallback,
} from "@growthbook/growthbook";

export interface Context {
  config: Config;
  helpers: Helpers;
}

export interface Config {
  proxyTarget: string;
  environment: string;
  maxPayloadSize?: string;
  routes?: Route[];

  runVisualEditorExperiments: ExperimentRunEnvironment; // default: everywhere
  disableJsInjection: boolean;

  runUrlRedirectExperiments: ExperimentRunEnvironment; // default: browser
  runCrossOriginUrlRedirectExperiments: ExperimentRunEnvironment; // default: browser
  injectRedirectUrlScript: boolean;
  maxRedirects: number;

  scriptInjectionPattern: string;
  disableInjections: boolean;

  enableStreaming: boolean;
  enableStickyBuckets: boolean;

  contentSecurityPolicy?: string; // __NONCE__ will be replaced with a generated nonce string
  nonce?: string; // can be used instead of __NONCE__ if known

  crypto?: any;
  localStorage?: LocalStorageCompat;

  growthbook: {
    apiHost: string;
    clientKey: string;
    decryptionKey?: string;
    trackingCallback?: string; // (experiment, result) => void;
    edgeTrackingCallback?: TrackingCallback;
    attributes?: Attributes;
    edgeStickyBucketService?: StickyBucketService;
  };

  persistUuid: boolean;
  uuidCookieName?: string;
  attributeKeys: {
    uuid?: string;
    browser?: string;
    deviceType?: string;
    url?: string;
    path?: string;
    host?: string;
    query?: string;
  };
  skipAutoAttributes: boolean;
}

export type ExperimentRunEnvironment =
  | "everywhere"
  | "edge"
  | "browser"
  | "skip";

export interface Helpers {
  // routing
  getRequestURL?: (req: any) => string;
  getRequestMethod?: (req: any) => string;
  getRequestHeader?: (req: any, key: string) => string | undefined;
  setResponseHeader?: (res: any, key: string, value: string) => void;
  sendResponse?: (res: any, body: string, status?: number) => any;
  fetch?: (ctx: Context, url: string) => Promise<any>;
  proxyRequest?: (
    ctx: Context,
    req: any,
    res?: any,
    next?: any,
  ) => Promise<any>;
  // GB cookies
  getUUIDCookie?: (ctx: Context, req: any) => string;
  setUUIDCookie?: (ctx: Context, res: any, uuid: string) => void;
}

export type Route = {
  pattern: string;
  type?: "regex" | "simple";
  behavior?: "intercept" | "proxy" | "error";
  includeFileExtensions?: boolean;
  statusCode?: number;
  body?: string;
};
