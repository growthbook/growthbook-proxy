import {
  AutoExperimentVariation,
  GrowthBook,
} from "@growthbook/growthbook";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";
import { injectScript } from "./inject";
import { applyDomMutations } from "./domMutations";
import redirect from "./redirect";
import { getRoute } from "./routing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function edgeApp(
  context: Context,
  req: any,
  res: any,
  next?: any,
) {
  const url = context.helpers.getRequestURL?.(req) || "";
  let destinationURL = getDefaultDestinationURL(context, req);

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
    disableVisualExperiments: ["skip", "browser"].includes(context.config.runVisualEditorExperiments),
    disableJsInjection: context.config.disableJsInjection,
    disableUrlRedirectExperiments: ["skip", "browser"].includes(context.config.runUrlRedirectExperiments),
    disableCrossOriginUrlRedirectExperiments: ["skip", "browser"].includes(context.config.runCrossOriginUrlRedirectExperiments),
  });

  growthbook.debug = true;
  await growthbook.loadFeatures();
  let sdkPayload = growthbook.getPayload();

  // block edge experiements
  // todo: use these instead
  // disableVisualExperiments?: boolean;
  // disableJsInjection?: boolean;
  // disableUrlRedirectExperiments?: boolean;
  // disableCrossOriginRedirectExperiments?: boolean;
  // disableExperimentsOnLoad?: boolean;
  growthbook.setBlockedExperimentHashes(["9a3ac5b46bb84e4996b1f64c93da90bfb3521b4c338ec32ef95b70b887f8ff1d"]);

  growthbook.setURL(url);

  const shouldFetch = true; // todo: maybe false if no SDK injection needed?
  const shouldInjectSDK = true; // todo: parameterize?
  const shouldInjectTrackingCalls = true; // todo: parameterize?

  let body = "";
  destinationURL = await redirect({
    context,
    growthbook,
    previousUrl: destinationURL,
    resetDomChanges,
  });

  if (shouldFetch) {
    let response: Response | undefined;
    try {
      response = (await context.helpers.fetch?.(
        context,
        destinationURL,
      )) as Response;
    } catch (e) {
      console.error(e);
      return context.helpers.sendResponse?.(res, "Error fetching page", 500);
    }
    body = await response.text();
  }
  // todo: edge config gating?
  if (domChanges.length) {
    body = await applyDomMutations({
      context,
      body,
      domChanges,
    });
  }

  let trackedExperimentHashes = growthbook.getTrackedExperimentHashes();
  console.log({trackedExperimentHashes})

  if (shouldInjectSDK) {
    body = injectScript({
      context,
      body,
      sdkPayload,
      attributes,
      deferredTrackingCalls: shouldInjectTrackingCalls
        ? growthbook.getDeferredTrackingCalls()
        : undefined,
    });
  }

  if (shouldFetch) {
    return context.helpers.sendResponse?.(res, body);
  }
  // passthrough if no SDK side effects
  return context.helpers.proxyRequest?.(context, req, res, next);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultDestinationURL(context: Context, req: any): string {
  const currentURL = context.helpers.getRequestURL?.(req) || "";
  const proxyTarget = context.config.proxyTarget;
  const currentParsedURL = new URL(currentURL);
  console.log("proxyTarget", proxyTarget);
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
