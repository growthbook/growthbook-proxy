import { AutoExperimentVariation, GrowthBook } from "@growthbook/growthbook";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";
import { injectScript } from "./inject";
import { applyDomMutations } from "./domMutations";
import redirect from "./redirect";
import { getRoute } from "./routing";

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

  const attributes = getUserAttributes(context, req);
  // todo: polyfill localStorage -> edge key/val for SDK cache?

  // experiments?
  let domChanges: AutoExperimentVariation[] = [];
  const resetDomChanges = () => (domChanges = []);
  let preRedirectTrackedExperimentHashes: string[] = [];
  const setPreRedirectTrackedExperimentHashes = (experiments: string[]) =>
    (preRedirectTrackedExperimentHashes = experiments);

  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    decryptionKey: context.config.growthbook.decryptionKey,
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
  });

  // todo: remove
  growthbook.debug = true;

  await growthbook.loadFeatures();
  const sdkPayload = growthbook.getPayload();
  const experiments = growthbook.getExperiments();

  const shouldFetch = true; // todo: maybe false if no SDK injection needed?
  const shouldInjectSDK = true; // todo: parameterize?
  const shouldInjectTrackingCalls = true; // todo: parameterize?

  let body = "";

  const oldUrl = url;
  // todo: scrub tracking callbacks from visual experiments if a redirect has happened
  url = await redirect({
    context,
    growthbook,
    previousUrl: url,
    resetDomChanges,
    setPreRedirectTrackedExperimentHashes,
  });

  const originUrl = getDefaultOriginUrl(context, url);

  let fetchedResponse: Response | undefined = undefined;
  if (shouldFetch) {
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
  }
  // todo: edge config gating?
  if (domChanges.length) {
    body = await applyDomMutations({
      context,
      body,
      domChanges,
    });
  }

  const trackedExperimentHashes = growthbook.getTrackedExperimentHashes();
  console.log({
    trackedExperimentHashes,
    preRedirectTrackedExperimentHashes,
  });

  if (shouldInjectSDK) {
    body = injectScript({
      context,
      res,
      body,
      sdkPayload,
      attributes,
      deferredTrackingCalls: shouldInjectTrackingCalls
        ? growthbook.getDeferredTrackingCalls()
        : undefined,
      experiments,
      trackedExperimentHashes,
      preRedirectTrackedExperimentHashes,
      url,
      oldUrl,
    });
  }

  if (shouldFetch) {
    return context.helpers.sendResponse?.(res, body);
  }
  // passthrough if no SDK side effects
  return context.helpers.proxyRequest?.(context, req, res, next);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultOriginUrl(context: Context, currentURL: string): string {
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
