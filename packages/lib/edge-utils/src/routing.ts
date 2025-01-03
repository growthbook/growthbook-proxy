import { isURLTargeted } from "@growthbook/growthbook";
import { Context, Route } from "./types";

const defaultRoute: Route = {
  pattern: "*",
  type: "simple",
  behavior: "intercept",
};

export function getRoute<Req, Res>(context: Context<Req, Res>, url: string): Route {
  const routes = [...(context.config.routes || []), defaultRoute];
  for (const route of routes) {
    route.type = route.type ?? "simple";
    route.behavior = route.behavior ?? "intercept";
    route.includeFileExtensions = !!route.includeFileExtensions;
    if (route.behavior === "error") {
      route.statusCode = route.statusCode ?? 404;
    }

    const target = {
      include: true,
      type: route.type ?? "simple",
      pattern: route.pattern,
    };
    const targeted = isURLTargeted(url, [target]);

    if (targeted) {
      if (route.includeFileExtensions) {
        return route;
      }
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        if (path.includes(".")) {
          // extensions will proxy if not explicitly included
          return { ...route, behavior: "proxy" };
        }
      } catch (e) {
        // ignore
      }
      return route;
    }
  }
  // Default route is intercept & process
  return defaultRoute;
}
