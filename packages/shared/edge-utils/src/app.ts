import { GrowthBook, isURLTargeted } from "@growthbook/growthbook";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";
import { JSDOM } from "jsdom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function edgeApp(context: Context, req: any, res: any, next?: any) {
  const newUrl = getDefaultDestinationURL(context, req);
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }

  const attributes = getUserAttributes(context, req);
  // todo: polyfill localStorage -> edge key/val for SDK cache?
  const growthbook = new GrowthBook({
    apiHost: context.config.growthbook.apiHost,
    clientKey: context.config.growthbook.clientKey,
    attributes,
  });
  await growthbook.loadFeatures();
  const targetedExperiments = getTargetedExperiments(growthbook, newUrl);
  const shouldFetch = targetedExperiments.length > 0;

  if (shouldFetch) {
    // todo: abstract body fetcher to helper
    const response = await fetch(newUrl);
    let body = await response.text();

    let dom = new JSDOM(body);
    globalThis.document = dom.window.document;
    const bodyEl = document.body;
    const el = document.createElement("h1");
    const text = document.createTextNode("Growthbook Edge...");
    el.appendChild(text);
    bodyEl.appendChild(el);

    await growthbook.setURL(newUrl);

    body = dom.serialize();
    // todo: get mutations, apply to DOM -> body

    return res.send(body);
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
  } catch(e) {
    // ignore
  }
  return newUrl;
}

function getTargetedExperiments(
  growthbook: GrowthBook,
  url: string
): string[] {
  const experiments = growthbook.getExperiments();
  const targetedExperiments = experiments.filter((e) => {
    if (e.manual) return false;
    if (!e.urlPatterns) return false;
    return isURLTargeted(url, e.urlPatterns);
  });
  return targetedExperiments.map((e) => e.key);
}