/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  GrowthBook,
  Attributes,
  FeatureApiResponse,
  LocalStorageCompat,
  StickyBucketService,
  TrackingCallback
} from "@growthbook/growthbook";
import { HTMLElement } from "node-html-parser";

export interface Context<Req, Res> {
  config: Config;
  helpers: Helpers<Req, Res>;
  hooks: Hooks<Req, Res>;
}

export interface Config {
  proxyTarget: string;
  followRedirects: boolean;
  forwardProxyHeaders: boolean;
  useDefaultContentType: boolean;
  processTextHtmlOnly: boolean;
  autoInflate: boolean;
  nocacheOrigin: boolean;
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
  getRequestURL: (req: Req) => string;
  getRequestMethod: (req: Req) => string;
  getRequestHeader?: (req: Req, key: string) => string | undefined;
  sendResponse: (
    ctx: Context<Req, Res>,
    res?: Res,
    headers?: Record<string, any>,
    body?: string,
    cookies?: Record<string, string>,
    status?: number,
  ) => unknown;
  fetch: (ctx: Context<Req, Res>, url: string, req: Req) => Promise<Res>;
  proxyRequest: (
    ctx: Context<Req, Res>,
    req: Req,
    res?: Res,
    next?: any,
  ) => Promise<unknown>;
  getCookie?: (req: Req, key: string) => string;
  setCookie?: (res: Res, key: string, value: string) => void;
}

export type BaseHookParams<Req, Res> = {
  context: Context<Req, Res>;
  req: Req;
  res?: Res;
  next?: any;
  requestUrl: string;
  originUrl: string;
};
export type OnRouteParams<Req, Res> = BaseHookParams<Req, Res> & {
  route: Route;
};
export type OnUserAttributesParams<Req, Res> = OnRouteParams<Req, Res> & {
  attributes: Attributes;
};
export type OnGrowthBookInitParams<Req, Res> = OnUserAttributesParams<Req, Res> & {
  growthbook: GrowthBook;
};
export type OnBeforeOriginFetchParams<Req, Res> = OnGrowthBookInitParams<Req, Res> & {
  redirectRequestUrl: string;
};
export type OnOriginFetchParams<Req, Res> = OnBeforeOriginFetchParams<Req, Res> & {
  originResponse: Res | undefined;
  originStatus: number;
};
export type OnBodyReadyParams<Req, Res> = OnOriginFetchParams<Req, Res> & {
  originHeaders: Record<string, string | undefined>;
  resHeaders: Record<string, string | undefined>;
  body: string;
  setBody: (s: string) => void;
  root?: HTMLElement;
};
export type OnBeforeResponseParams<Req, Res> = Omit<OnBodyReadyParams<Req, Res>, "root">;

type HookReturn<Res> = Res | undefined | void;

export interface Hooks<Req, Res> {
  onRequest?: (params: BaseHookParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onRoute?: (params: OnRouteParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onUserAttributes?: (params: OnUserAttributesParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onGrowthbookInit?: (params: OnGrowthBookInitParams<Req, Res> ) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onBeforeOriginFetch?: (params: OnBeforeOriginFetchParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onOriginFetch?: (params: OnOriginFetchParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onBodyReady?: (params: OnBodyReadyParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
  onBeforeResponse?: (params: OnBeforeResponseParams<Req, Res>) => Promise<HookReturn<Res>> | HookReturn<Res>;
}

export type Route = {
  pattern: string;
  type?: "regex" | "simple";
  behavior?: "intercept" | "proxy" | "error";
  includeFileExtensions?: boolean;
  statusCode?: number;
  body?: string;
};
