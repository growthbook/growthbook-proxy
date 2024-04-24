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

export async function edgeApp(
  context: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next?: any,
) {
  let url = context.helpers.getRequestURL?.(req) || "";

  // Non GET requests are proxied
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }
  // Check the url for routing rules (default behavior is intercept)
  const route = getRoute(context, url);
  if (route.behavior === "error") {
    return context.helpers.sendResponse?.(
      res,
      route.body || "",
      route.statusCode,
    );
  }
  if (route.behavior === "proxy") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }

  const attributes = getUserAttributes(context, req, res);

  let domChanges: AutoExperimentVariation[] = [];
  const resetDomChanges = () => (domChanges = []);

  let preRedirectTrackedExperimentHashes: string[] = [];
  const setPreRedirectTrackedExperimentHashes = (experiments: string[]) =>
    (preRedirectTrackedExperimentHashes = experiments);

  if (context.config.localStorage) {
    setPolyfills({ localStorage: context.config.localStorage });
  }
  if (context.config.crypto) {
    setPolyfills({ SubtleCrypto: context.config.crypto });
  }
  let stickyBucketService:
    | EdgeStickyBucketService
    | StickyBucketService
    | undefined = undefined;
  if (context.config.enableStickyBuckets) {
    stickyBucketService =
      context.config.growthbook.edgeStickyBucketService ??
      new EdgeStickyBucketService({ req });
  }
  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    decryptionKey: context.config.growthbook.decryptionKey,
    payload: context.config.growthbook.payload,
    storePayload: true,
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

  await growthbook.loadFeatures();

  let body = "";

  const oldUrl = url;
  url = await redirect({
    context,
    growthbook,
    previousUrl: url,
    resetDomChanges,
    setPreRedirectTrackedExperimentHashes,
  });

  const originUrl = getOriginUrl(context, url);

  let fetchedResponse: Response | undefined = undefined;
  try {
    fetchedResponse = (await context.helpers.fetch?.(
      context,
      originUrl,
    )) as Response;
    if (!fetchedResponse.ok) {
      throw new Error("Fetch: non-2xx status returned");
    }
  } catch (e) {
    console.error(e);
    return context.helpers.sendResponse?.(res, "Error fetching page", 500);
  }
  body = await fetchedResponse.text();

  const { csp, nonce } = getCspInfo(context);
  if (csp) {
    context.helpers?.setResponseHeader?.(res, "Content-Security-Policy", csp);
  }

  body = await applyDomMutations({
    body,
    nonce,
    domChanges,
  });

  body = injectScript({
    context,
    body,
    nonce,
    growthbook,
    stickyBucketService,
    attributes,
    preRedirectTrackedExperimentHashes,
    url,
    oldUrl,
  });

  return context.helpers.sendResponse?.(res, body);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOriginUrl(context: Context, currentURL: string): string {
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
