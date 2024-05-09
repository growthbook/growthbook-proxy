import {
  AutoExperimentVariation,
  GrowthBook,
  setPolyfills,
  StickyBucketService,
} from "@growthbook/growthbook";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";
import { getCspInfo, injectScript } from "./inject";
import { applyDomMutations } from "./domMutations";
import redirect from "./redirect";
import { getRoute } from "./routing";
import { EdgeStickyBucketService } from "./stickyBucketService";

export async function edgeApp<Req, Res>(
  context: Context<Req, Res>,
  req: Req,
  res?: Res,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next?: any,
) {
  let url = context.helpers.getRequestURL?.(req) || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let headers: Record<string, any> = {
    "Content-Type": "text/html",
  };
  const cookies: Record<string, string> = {};
  const setCookie = (key: string, value: string) => {
    cookies[key] = value;
  };
  const { csp, nonce } = getCspInfo(context as Context<unknown, unknown>);
  if (csp) {
    headers["Content-Security-Policy"] = csp;
  }
  let body = "";

  // Non GET requests are proxied
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }
  // Check the url for routing rules (default behavior is intercept)
  const route = getRoute(context as Context<unknown, unknown>, url);
  if (route.behavior === "error") {
    return context.helpers.sendResponse?.(
      context,
      res,
      headers,
      route.body || "",
      cookies,
      route.statusCode,
    );
  }
  if (route.behavior === "proxy") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }

  const attributes = getUserAttributes(context, req, url, setCookie);

  let domChanges: AutoExperimentVariation[] = [];
  const resetDomChanges = () => (domChanges = []);

  let preRedirectChangeIds: string[] = [];
  const setPreRedirectChangeIds = (changeIds: string[]) =>
    (preRedirectChangeIds = changeIds);

  context.config.localStorage &&
    setPolyfills({ localStorage: context.config.localStorage });
  context.config.crypto &&
    setPolyfills({ SubtleCrypto: context.config.crypto });

  let stickyBucketService:
    | EdgeStickyBucketService<Req, Res>
    | StickyBucketService
    | undefined = undefined;
  if (context.config.enableStickyBucketing) {
    stickyBucketService =
      context.config.growthbook.edgeStickyBucketService ??
      new EdgeStickyBucketService<Req, Res>({
        context,
        prefix: context.config.stickyBucketPrefix,
        req,
      });
  }
  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    decryptionKey: context.config.growthbook.decryptionKey,
    attributes,
    applyDomChangesCallback: (changes: AutoExperimentVariation) => {
      domChanges.push(changes);
      return () => {};
    },
    url,
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
    trackingCallback: context.config.disableInjections
      ? context.config.growthbook.edgeTrackingCallback
      : undefined,
  });

  await growthbook.init({
    payload: context.config.growthbook.payload,
  });

  const oldUrl = url;
  url = await redirect({
    context: context as Context<unknown, unknown>,
    req,
    setCookie,
    growthbook,
    previousUrl: url,
    resetDomChanges,
    setPreRedirectChangeIds: setPreRedirectChangeIds,
  });

  const originUrl = getOriginUrl(context as Context<unknown, unknown>, url);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let fetchedResponse:
    | (Res & { ok: boolean; headers: Record<string, any>; text: any })
    | undefined = undefined;
  try {
    fetchedResponse = (await context.helpers.fetch?.(
      context as Context<Req, Res>,
      originUrl,
      /* eslint-disable @typescript-eslint/no-explicit-any */
    )) as Res & { ok: boolean; headers: Record<string, any>; text: any };
    if (!fetchedResponse?.ok) {
      throw new Error("Fetch: non-2xx status returned");
    }
  } catch (e) {
    console.error(e);
    return context.helpers.sendResponse?.(
      context,
      res,
      headers,
      "Error fetching page",
      cookies,
      500,
    );
  }
  if (context.config.forwardProxyHeaders && fetchedResponse?.headers) {
    headers = { ...fetchedResponse.headers, ...headers };
  }
  body = await fetchedResponse.text();

  body = await applyDomMutations({
    body,
    nonce,
    domChanges,
  });

  body = injectScript({
    context: context as Context<unknown, unknown>,
    body,
    nonce,
    growthbook,
    attributes,
    preRedirectChangeIds,
    url,
    oldUrl,
  });

  return context.helpers.sendResponse?.(context, res, headers, body, cookies);
}

export function getOriginUrl(context: Context, currentURL: string): string {
  const proxyTarget = context.config.proxyTarget;
  const currentParsedURL = new URL(currentURL);
  const proxyParsedURL = new URL(proxyTarget);

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
