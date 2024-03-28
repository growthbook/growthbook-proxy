import {
  AutoExperiment,
  GrowthBook,
  isURLTargeted,
} from "@growthbook/growthbook";
import { JSDOM } from "jsdom";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";
import { sdkWrapper } from "./generated/sdkWrapper";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function edgeApp(
  context: Context,
  req: any,
  res: any,
  next?: any,
) {
  const newUrl = getDefaultDestinationURL(context, req);

  // todo: temp filters. replace with routing logic
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }
  if (newUrl.length > context.config.proxyTarget.length) {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }

  const attributes = getUserAttributes(context, req);
  attributes["wtf"] = "yes";
  // todo: polyfill localStorage -> edge key/val for SDK cache?
  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    url: newUrl,
    isBrowser: true,
    attributes,
  });
  await growthbook.loadFeatures();

  const { visualExperiments, redirectExperiments } = getTargetedExperiments(
    growthbook,
    newUrl,
  );

  const shouldFetch = true; // todo: maybe false if no SDK injection needed?
  let body = "";

  const mayMutateDOM = visualExperiments.length > 0;
  const shouldInjectSDK = true; // todo: parameterize?
  const shouldInjectTrackingCalls = true // todo: parameterize?

  if (shouldFetch) {
    let response: Response | undefined;
    try {
      response = (await context.helpers.fetch?.(context, newUrl)) as Response;
    } catch (e) {
      console.error(e);
      return res.status(500).send("Error fetching page");
    }
    body = await response.text();
  }

  // Visual experiments
  if (mayMutateDOM) {
    // todo: consider non-mutationObserver approach (no JSDOM)
    const dom = new JSDOM(body);
    // @ts-ignore
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;

    await growthbook.setURL(newUrl);
    body = dom.serialize();
  }

  // todo: handle other side effects

  // todo: write edge-computed attributes on top of auto-attributes
  if (shouldInjectSDK) {
    const scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"
  data-uuid="${attributes.uuid}"
>
  window.growthbook_queue = [
    (gb) => gb.setAttributes(${JSON.stringify(attributes)})
  ];
  
  ${sdkWrapper}
</script>
`;
    const pattern = context.config.scriptInjectionPattern || "</body>";
    body = body.replace(pattern, scriptTag + pattern);
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
