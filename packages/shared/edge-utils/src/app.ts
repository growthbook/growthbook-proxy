import {
  AutoExperiment,
  AutoExperimentVariation,
  GrowthBook,
  isURLTargeted,
} from "@growthbook/growthbook";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";
import { injectScript } from "./inject";
import { applyDomMutations } from "./domMutations";
import Redirect from "./redirect";
import { getRoute } from "./routing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function edgeApp(
  context: Context,
  req: any,
  res: any,
  next?: any,
) {

  const url = context.helpers.getRequestURL?.(req) || "";
  const newUrl = getDefaultDestinationURL(context, req);

  // Non GET requests are proxied
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }
  // Check the url for routing rules (default is intercept)
  const route = getRoute(context, url);
  if (route.behavior === "error") {
    return res.status(route.statusCode).send(route.body || "");
  }
  if (route.behavior === "proxy") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }

  const attributes = getUserAttributes(context, req);
  // todo: polyfill localStorage -> edge key/val for SDK cache?

  let domChanges: AutoExperimentVariation[] = [];
  let finalUrl: string = newUrl;
  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    decryptionKey: context.config.growthbook.decryptionKey,
    url,
    storePayload: true,
    isBrowser: true,
    attributes,
    applyDomChangesCallback: (changes: AutoExperimentVariation) => {
      domChanges.push(changes);
      return () => {};
    },
  });

  growthbook.debug = true;
  await growthbook.loadFeatures();
  const sdkPayload = growthbook.getPayload();

  const shouldFetch = true; // todo: maybe false if no SDK injection needed?
  const shouldInjectSDK = true; // todo: parameterize?
  const shouldInjectTrackingCalls = true; // todo: parameterize?

  let body = "";
  const resetDomMutations = () => {
    domChanges = [];
  };
  finalUrl = await Redirect(growthbook, newUrl, resetDomMutations);

  if (shouldFetch) {
    let response: Response | undefined;
    try {
      response = (await context.helpers.fetch?.(context, finalUrl)) as Response;
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
  console.log("proxyTarget", proxyTarget );
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

type TargetedAutoExperiments = {
  visualExperiments: AutoExperiment[];
  redirectExperiments: AutoExperiment[];
};
function getTargetedExperiments(
  growthbook: GrowthBook,
  url: string,
): TargetedAutoExperiments {
  const experiments = growthbook.getExperiments();
  const ret: TargetedAutoExperiments = {
    visualExperiments: [],
    redirectExperiments: [],
  };
  experiments.forEach((e) => {
    if (e.manual) return;
    if (!e.urlPatterns) return;
    if (isURLTargeted(url, e.urlPatterns)) {
      // @ts-ignore
      if (e.variations?.[0]?.urlRedirects) {
        ret.redirectExperiments.push(e);
      } else {
        ret.visualExperiments.push(e);
      }
    }
  });
  return ret;
}
