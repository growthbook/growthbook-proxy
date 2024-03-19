import {
  AutoExperiment,
  GrowthBook,
  isURLTargeted,
} from "@growthbook/growthbook";
import { JSDOM } from "jsdom";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function edgeApp(
  context: Context,
  req: Request,
  res: Response,
  next?: unknown,
) {
  const newUrl = getDefaultDestinationURL(context, req);
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }
  // todo: temp filter
  if (newUrl.length > "http://127.0.0.1:3001/".length) {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }

  const attributes = getUserAttributes(context, req);
  // todo: polyfill localStorage -> edge key/val for SDK cache?
  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    url: newUrl,
    isBrowser: true,
    attributes,
  });
  await growthbook.loadFeatures();
  const targetedExperiments = getTargetedExperiments(growthbook, newUrl);
  const shouldFetch = targetedExperiments.length > 0;

  if (shouldFetch) {
    // todo: abstract body fetcher to helper
    const response = await fetch(newUrl);
    let body = await response.text();

    // todo: switch DOM mutation mode (mutate, inject script) based on config?
    const dom = new JSDOM(body);
    // @ts-ignore
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    // get mutationObserver from JSDOM
    globalThis.MutationObserver = dom.window.MutationObserver;

    await growthbook.setURL(newUrl);

    body = dom.serialize();
    return context.helpers.sendResonse?.(res, body);
  }

  // todo: handle other side effects

  context.helpers.setCookieAttributes?.(context, res, attributes);

  // passthrough if no SDK side effects
  return context.helpers.proxyRequest?.(context, req, res, next);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultDestinationURL(context: Context, req: any): string {
  let newUrl = context.helpers.getRequestURL?.(req) || "";
  try {
    const newUrlObj = new URL(newUrl);
    newUrlObj.host = context.config.proxyTarget;
    newUrl = newUrlObj.href;
  } catch (e) {
    // ignore
  }
  return newUrl;
}

function getTargetedExperiments(
  growthbook: GrowthBook,
  url: string,
): AutoExperiment[] {
  const experiments = growthbook.getExperiments();
  return experiments.filter((e) => {
    if (e.manual) return false;
    if (!e.urlPatterns) return false;
    return isURLTargeted(url, e.urlPatterns);
  });
}
