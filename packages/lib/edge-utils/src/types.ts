/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Attributes,
  FeatureApiResponse,
  LocalStorageCompat,
  StickyBucketService,
  TrackingCallback,
} from "@growthbook/growthbook";

export interface Context<Req = unknown, Res = unknown> {
  config: Config;
  helpers: Helpers<Req, Res>;
}

export interface Config {
  proxyTarget: string;
  forwardProxyHeaders: boolean;
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
  enableStickyBucketing: boolean;
  stickyBucketPrefix?: string;

  contentSecurityPolicy?: string; // __NONCE__ will be replaced with a generated nonce string
  nonce?: string; // can be used instead of __NONCE__ if known

  crypto?: any;
  localStorage?: LocalStorageCompat;

  // growthbook
  apiHost: string;
  clientKey: string;
  decryptionKey?: string;
  trackingCallback?: string; // (experiment, result) => void;
  edgeTrackingCallback?: TrackingCallback;
  attributes?: Attributes;
  edgeStickyBucketService?: StickyBucketService;
  payload?: FeatureApiResponse;

  persistUuid: boolean; // true: write cookie from edge, false: write cookie from browser
  noAutoCookies: boolean; // true: don't write any cookies until user permission
  uuidCookieName: string;
  uuidKey: string;

  skipAutoAttributes: boolean;
}

export type ExperimentRunEnvironment =
  | "everywhere"
  | "edge"
  | "browser"
  | "skip";

export interface Helpers<Req, Res> {
  // routing
  getRequestURL?: (req: Req) => string;
  getRequestMethod?: (req: Req) => string;
  getRequestHeader?: (req: Req, key: string) => string | undefined;
  sendResponse?: (
    ctx: Context<Req, Res>,
    res?: Res,
    headers?: Record<string, any>,
    body?: string,
    cookies?: Record<string, string>,
    status?: number,
  ) => unknown;
  fetch?: (ctx: Context<Req, Res>, url: string) => Promise<Res>;
  proxyRequest?: (
    ctx: Context<Req, Res>,
    req: Req,
    res?: Res,
    next?: any,
  ) => Promise<unknown>;
  getCookie?: (req: Req, key: string) => string;
  setCookie?: (res: Res, key: string, value: string) => void;
}

export type Route = {
  pattern: string;
  type?: "regex" | "simple";
  behavior?: "intercept" | "proxy" | "error";
  includeFileExtensions?: boolean;
  statusCode?: number;
  body?: string;
};
