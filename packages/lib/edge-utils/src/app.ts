import {
  AutoExperimentVariation, configureCache,
  GrowthBook,
  helpers,
  setPolyfills,
  StickyBucketService
} from "@growthbook/growthbook";
import {
  BaseHookParams,
  Context,
  OnRouteParams,
  OnUserAttributesParams,
  OnGrowthBookInitParams,
  OnBeforeOriginFetchParams,
  OnOriginFetchParams,
  OnBodyReadyParams,
  OnBeforeResponseParams
} from "./types";
import { getUserAttributes } from "./attributes";
import { getCspInfo, injectScript } from "./inject";
import { applyDomMutations } from "./domMutations";
import redirect from "./redirect";
import { getRoute } from "./routing";
import { EdgeStickyBucketService } from "./stickyBucketService";
import { HTMLElement, parse } from "node-html-parser";
import pako from "pako";

interface OriginResponse {
  status: number;
  headers: Record<string, string | undefined>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export async function edgeApp<Req, Res>(
  context: Context<Req, Res>,
  req: Req,
  res?: Res,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next?: any,
) {
  /**
   * 1. Init app variables
   */
    // Request vars:
  let requestUrl = context.helpers.getRequestURL(req);
  let originUrl = getOriginUrl(context, requestUrl);
  // Response vars:
  let originResponse: (OriginResponse & Res) | undefined = undefined;
  let resHeaders: Record<string, string | undefined> = {};
  const respCookies: Record<string, string> = {};
  const setRespCookie = (key: string, value: string) => {
    respCookies[key] = value;
  };

  // Loop check
  const requestCount = parseInt(context.helpers?.getRequestHeader?.(req, "x-gb-request-count") || "0") + 1;
  if (requestCount > 1) {
    console.error("Edge request loop detected. Count: " + requestCount, requestUrl);
  }
  if (requestCount > context.config.maxRedirects) {
    throw new Error("Edge request loop: max requests reached: " + requestCount);
  }

  // Initial hook:
  let hookResp: Res | undefined | void;
  let onRequestParams: BaseHookParams<Req, Res> = { context, req, res, next, requestUrl, originUrl, requestCount };
  hookResp = await context?.hooks?.onRequest?.(onRequestParams);
  if (hookResp) return hookResp;

  // DOM mutations
  let domChanges: AutoExperimentVariation[] = [];
  const resetDomChanges = () => (domChanges = []);

  // Experiments that triggered prior to final redirect
  let preRedirectChangeIds: string[] = [];
  const setPreRedirectChangeIds = (changeIds: string[]) =>
    (preRedirectChangeIds = changeIds);

  /**
   * 2. Early exits based on method, routes, etc
   */
  // Non GET requests are proxied
  if (context.helpers.getRequestMethod(req) !== "GET") {
    return context.helpers.proxyRequest(context, req, res, next);
  }
  // Check the url for routing rules (default behavior is intercept)
  const route = getRoute(context, requestUrl);
  if (route.behavior === "error") {
    return context.helpers.sendResponse(context, res, {}, route.body || "", {}, route.statusCode);
  }
  if (route.behavior === "proxy") {
    return context.helpers.proxyRequest(context, req, res, next);
  }
  // Custom route behavior via hook:
  const onRouteParams: OnRouteParams<Req, Res> = { ...onRequestParams, route };
  hookResp = await context?.hooks?.onRoute?.(onRouteParams);
  if (hookResp) return hookResp;

  /**
   * 3. User attributes & uuid
   */
  const attributes = getUserAttributes(context, req, requestUrl, setRespCookie);

  // Hook to allow enriching user attributes, etc
  const onUserAttributesParams: OnUserAttributesParams<Req, Res> = { ...onRouteParams, attributes };
  hookResp = await context?.hooks?.onUserAttributes?.(onUserAttributesParams);
  if (hookResp) return hookResp;

  /**
   * 4. Init GrowthBook SDK
   */
  setPolyfills({
    localStorage: context.config?.localStorage,
    SubtleCrypto: context.config?.crypto,
  });
  if (context.config.staleTTL !== undefined)
    configureCache({ staleTTL: context.config.staleTTL });
  if (context.config.fetchFeaturesCall)
    helpers.fetchFeaturesCall = context.config.fetchFeaturesCall;

  let stickyBucketService: EdgeStickyBucketService<Req, Res> | StickyBucketService | undefined;
  if (context.config.enableStickyBucketing) {
    stickyBucketService =
      context.config.edgeStickyBucketService ??
      new EdgeStickyBucketService({
        context,
        prefix: context.config.stickyBucketPrefix,
        req,
      });
  }
  const growthbook = new GrowthBook({
    apiHost: context.config.apiHost,
    clientKey: context.config.clientKey,
    decryptionKey: context.config.decryptionKey,
    attributes,
    applyDomChangesCallback: (changes: AutoExperimentVariation) => {
      domChanges.push(changes);
      return () => {
      };
    },
    url: context.config.experimentUrlTargeting === "origin" ? originUrl: requestUrl,
    disableVisualExperiments: ["skip", "browser"].includes(
      context.config.runVisualEditorExperiments,
    ),
    disableJsInjection: context.config.disableJsInjection,
    disableUrlRedirectExperiments: ["skip", "browser"].includes(
      context.config.runUrlRedirectExperiments,
    ),
    disableCrossOriginUrlRedirectExperiments: ["skip", "browser"].includes(
      context.config.runCrossOriginUrlRedirectExperiments,
    ),
    stickyBucketService,
    trackingCallback: context.config.edgeTrackingCallback,
  });

  await growthbook.init({
    payload: context.config.payload,
  });

  // Hook to perform any custom logic given the initialized SDK
  const onGrowthbookInitParams: OnGrowthBookInitParams<Req, Res> = { ...onUserAttributesParams, growthbook };
  hookResp = await context?.hooks?.onGrowthbookInit?.(onGrowthbookInitParams);
  if (hookResp) return hookResp;

  /**
   * 5. Run URL redirect tests before fetching from origin
   */
  const redirectRequestUrl = await redirect({
    context,
    req,
    setRespCookie,
    growthbook,
    previousUrl: context.config.experimentUrlTargeting === "origin" ? originUrl : requestUrl,
    resetDomChanges,
    setPreRedirectChangeIds: setPreRedirectChangeIds,
  });
  originUrl = getOriginUrl(context, redirectRequestUrl, redirectRequestUrl !== requestUrl);

  // Pre-origin-fetch hook (after redirect logic):
  const onBeforeOriginFetchParams: OnBeforeOriginFetchParams<Req, Res> = { ...onGrowthbookInitParams, redirectRequestUrl, originUrl };
  hookResp = await context?.hooks?.onBeforeOriginFetch?.(onBeforeOriginFetchParams);
  if (hookResp) return hookResp;

  /**
   * 6. Fetch from origin, parse body / DOM
   */
  try {
    originResponse = await context.helpers.fetch(
      context,
      originUrl,
      req,
      context.config.emitTraceHeaders ? {
        additionalHeaders: {
          "x-gb-request-count": ("" + requestCount),
          "x-gbuuid": growthbook.getAttributes()?.[context.config.uuidKey],
        }
      } : undefined,
    ) as OriginResponse & Res;
  } catch (e) {
    console.error(e);
  }
  const originStatus = originResponse ? parseInt(originResponse.status ? originResponse.status + "" : "400") : 500;

  // On fetch hook (for custom response processing, etc)
  const onOriginFetchParams: OnOriginFetchParams<Req, Res> = { ...onBeforeOriginFetchParams, originResponse, originStatus };
  hookResp = await context?.hooks?.onOriginFetch?.(onOriginFetchParams);
  if (hookResp) return hookResp;

  // Standard error response handling
  if (originStatus >= 500 || !originResponse) {
    return context.helpers.sendResponse(context, res, {}, "Error fetching page", {}, 500);
  }
  if (originStatus >= 400) {
    return originResponse;
  }

  // Got a valid response, begin processing
  const originHeaders = headersToObject(originResponse.headers);
  if (context.config.forwardProxyHeaders) {
    resHeaders = { ...originHeaders, ...resHeaders };
  }
  // At minimum, the content-type is forwarded
  resHeaders["content-type"] = originHeaders?.["content-type"];

  if (context.config.useDefaultContentType && !resHeaders["content-type"]) {
    resHeaders["content-type"] = "text/html";
  }
  if (context.config.processTextHtmlOnly && !(resHeaders["content-type"] ?? "").includes("text/html")) {
    return context.helpers.proxyRequest(context, req, res, next);
  }

  const { csp, nonce } = getCspInfo(context);
  if (csp) {
    resHeaders["content-security-policy"] = csp;
  }

  const autoInflate = context.config.autoInflate; // fastly only!!!
  let body = "";
  const isGzipped = originHeaders["content-encoding"] === "gzip";
  try {
    const buffer = await originResponse.arrayBuffer();
    try {
      if (isGzipped && autoInflate) {
        body = pako.inflate(new Uint8Array(buffer), { to: "string" });
      } else {
        body = new TextDecoder().decode(buffer);
      }
    } catch {
      if (isGzipped) {
        body = pako.inflate(new Uint8Array(buffer), { to: "string" });
      } else {
        throw new Error("Failed to decode response as text.");
      }
    }
    if (isGzipped) {
      delete resHeaders["content-encoding"]; // Remove to prevent double decompression
    }
  } catch (e) {
    console.error("Response decoding error", e);
  }
  let setBody = (s: string) => {
    body = s;
  }

  let root: HTMLElement | undefined;
  if (context.config.alwaysParseDOM) {
    root = parse(body, { comment: context.config.preserveHtmlComments });
  }

  // Body ready hook (pre-DOM-mutations):
  const onBodyReadyParams: OnBodyReadyParams<Req, Res> = { ...onOriginFetchParams, originHeaders, resHeaders, body, setBody, root };
  hookResp = await context?.hooks?.onBodyReady?.(onBodyReadyParams);
  if (hookResp) return hookResp;

  /**
   * 7. Apply visual editor DOM mutations
   */
  await applyDomMutations({
    body,
    setBody,
    root,
    nonce,
    domChanges,
    preserveHtmlComments: context.config.preserveHtmlComments,
  });

  /**
   * 8. Inject the client-facing GrowthBook SDK (auto-wrapper)
   */
  injectScript({
    context,
    body,
    setBody,
    nonce,
    growthbook,
    attributes,
    preRedirectChangeIds,
    url: redirectRequestUrl,
    oldUrl: requestUrl,
  });

  // Final hook (post-mutations) before sending back
  const onBeforeResponseParams: OnBeforeResponseParams<Req, Res> = { ...onOriginFetchParams, originHeaders, resHeaders, body, setBody };
  hookResp = await context?.hooks?.onBeforeResponse?.(onBeforeResponseParams);
  if (hookResp) return hookResp;

  /**
   * 9. Send mutated response
   */
  return context.helpers.sendResponse(context, res, resHeaders, body, respCookies);
}


export function getOriginUrl<Req, Res>(context: Context<Req, Res>, currentURL: string, wasRedirected?: boolean): string {
  const proxyTarget = context.config.proxyTarget;
  const currentParsedURL = new URL(currentURL);
  const proxyParsedURL = wasRedirected && ["edge", "everywhere"].includes(context.config.runCrossOriginUrlRedirectExperiments)
    ? new URL(currentURL)
    : new URL(proxyTarget);

  const protocol = proxyParsedURL.protocol
    ? proxyParsedURL.protocol
    : currentParsedURL.protocol;
  const hostname = proxyParsedURL.hostname
    ? proxyParsedURL.hostname
    : currentParsedURL.hostname;
  const port = proxyParsedURL.port
    ? proxyParsedURL.port
    : protocol === "http:"
    ? "80"
    : "443";

  let newURL = `${protocol}//${hostname}`;
  if ((protocol === "http" && port !== "80") || port !== "443") {
    newURL += `:${port}`;
  }
  newURL += `${currentParsedURL.pathname}`;
  if (currentParsedURL.search) {
    newURL += currentParsedURL.search;
  }
  if (currentParsedURL.hash) {
    newURL += currentParsedURL.hash;
  }

  return newURL;
}

function headersToObject(headers: any) {
  if (headers && typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }
  return headers || {};
}
