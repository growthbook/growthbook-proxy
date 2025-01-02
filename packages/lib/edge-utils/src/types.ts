/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Attributes,
  FeatureApiResponse, GrowthBook,
  LocalStorageCompat,
  StickyBucketService,
  TrackingCallback
} from "@growthbook/growthbook";
import { HTMLElement } from "node-html-parser";

export interface Context<Req = unknown, Res = unknown> {
  config: Config;
  helpers: Helpers<Req, Res>;
  hooks: Hooks<Req, Res>;
}

export interface Config {
  proxyTarget: string;
  forwardProxyHeaders: boolean;
  useDefaultContentType: boolean;
  processTextHtmlOnly: boolean;
  environment: string;
  maxPayloadSize?: string;
  routes?: Route[];

  runVisualEditorExperiments: ExperimentRunEnvironment; // default: everywhere
  disableJsInjection: boolean;
  alwaysParseDOM: boolean;

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
  staleTTL?: number;
  fetchFeaturesCall?: ({host, clientKey, headers}: {
    host: string;
    clientKey: string;
    headers?: Record<string, string>;
  }) => Promise<any>;

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
  fetch?: (ctx: Context<Req, Res>, url: string, req: Req) => Promise<Res>;
  proxyRequest?: (
    ctx: Context<Req, Res>,
    req: Req,
    res?: Res,
    next?: any,
  ) => Promise<unknown>;
  getCookie?: (req: Req, key: string) => string;
  setCookie?: (res: Res, key: string, value: string) => void;
}

type BaseHookParams<Req> = {
  req: Req;
  requestUrl: string;
  originUrl: string;
};
type OnRequestParams<Req> = BaseHookParams<Req> & {
  route: Route;
};
type OnUserAttributesParams<Req> = OnRequestParams<Req> & {
  attributes: Attributes;
};
type OnGrowthBookInitParams<Req> = OnUserAttributesParams<Req> & {
  growthbook: GrowthBook;
};
type OnBeforeOriginFetchParams<Req> = OnGrowthBookInitParams<Req> & {
  redirectRequestUrl: string;
};
type OnOriginFetchParams<Req, Res> = OnBeforeOriginFetchParams<Req> & {
  response: Res | undefined;
  status: number;
};
type OnBodyReadyParams<Req, Res> = OnOriginFetchParams<Req, Res> & {
  body: string;
  root?: HTMLElement;
};
type OnBeforeResponseParams<Req, Res> = Omit<OnBodyReadyParams<Req, Res>, "root">;

export interface Hooks<Req, Res> {
  onRequest?: (params: BaseHookParams<Req>) => Promise<Res | undefined>;
  onRoute?: (params: OnRequestParams<Req>) => Promise<Res | undefined>;
  onUserAttributes?: (params: OnUserAttributesParams<Req>) => Promise<Res | undefined>;
  onGrowthbookInit?: (params: OnGrowthBookInitParams<Req> ) => Promise<Res | undefined>;
  onBeforeOriginFetch?: (params: OnBeforeOriginFetchParams<Req>) => Promise<Res | undefined>;
  onOriginFetch?: (params: OnOriginFetchParams<Req, Res>) => Promise<Res | undefined>;
  onBodyReady?: (params: OnBodyReadyParams<Req, Res>) => Promise<Res | undefined>;
  onBeforeResponse?: (params: OnBeforeResponseParams<Req, Res>) => Promise<Res | undefined>;
}

export type Route = {
  pattern: string;
  type?: "regex" | "simple";
  behavior?: "intercept" | "proxy" | "error";
  includeFileExtensions?: boolean;
  statusCode?: number;
  body?: string;
};
