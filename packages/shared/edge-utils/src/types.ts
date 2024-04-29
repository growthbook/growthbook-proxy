/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Attributes,
  FeatureApiResponse,
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
  enableStickyBucketing: boolean;

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
    payload?: FeatureApiResponse;
  };

  persistUuid: boolean;
  uuidCookieName: string;
  uuidKey: string;
  skipAutoAttributes: boolean;
}

export type ExperimentRunEnvironment =
  | "everywhere"
  | "edge"
  | "browser"
  | "skip";

export interface Helpers {
  // routing
  getRequestURL?: (req: Request) => string;
  getRequestMethod?: (req: Request) => string;
  getRequestHeader?: (req: Request, key: string) => string | undefined;
  setResponseHeader?: (res: Response, key: string, value: string) => void;
  sendResponse?: (res: Response, body: string, status?: number) => unknown;
  fetch?: (ctx: Context, url: string) => Promise<Response>;
  proxyRequest?: (
    ctx: Context,
    req: Request,
    res?: Response,
    next?: any,
  ) => Promise<unknown>;
  getCookie?: (req: Request, key: string) => string;
  setCookie?: (res: Response, key: string, value: string) => void;
}

export type Route = {
  pattern: string;
  type?: "regex" | "simple";
  behavior?: "intercept" | "proxy" | "error";
  includeFileExtensions?: boolean;
  statusCode?: number;
  body?: string;
};
