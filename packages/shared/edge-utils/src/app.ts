import { GrowthBook } from "@growthbook/growthbook";
import { Context } from "./types";
import { getUserAttributes } from "./attributes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function edgeApp(context: Context, req: any, res: any, next?: any) {
  if (context.helpers.getRequestMethod?.(req) !== "GET") {
    return context.helpers.proxyRequest?.(context, req, res, next);
  }
  const attributes = getUserAttributes(context, req);

  // todo: create growthbook SDK
  // todo: polyfill localStorage for SDK cache

  // todo: await side effects

  context.helpers.setCookieAttributes?.(context, res, attributes);

  // todo: handle SDK side effects

  // passthrough if no SDK side effects
  context.helpers.setResponseHeader?.(
    res,
    "X-Cool-Beans",
    "cool " + Math.random(),
  );
  return context.helpers.proxyRequest?.(context, req, res, next);
}
