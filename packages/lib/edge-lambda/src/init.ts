import {
  Context,
  defaultContext,
  getConfig,
  ConfigEnv,
  Config, Helpers, Hooks
} from "@growthbook/edge-utils";
import {
  buildGetRequestURL,
  getRequestMethod,
  getRequestHeader,
  sendResponse,
  fetchFn,
  proxyRequest,
  getCookie,
  setCookie,
} from "./helpers";

export interface Env extends ConfigEnv {
  // constants
  host?: string;
  protocol?: string;
  port?: number;
  // for local debugging:
  returnResponse?: boolean;
}

export async function init(
  env?: ConfigEnv,
  config?: Partial<Config>,
  helpers?: Partial<Helpers<Request, Response>>,
  hooks?: Hooks<Request, Response>,
): Promise<Context<Request, Response>> {
  const context = defaultContext;
  const configEnv = env || {};
  if (configEnv.STALE_TTL === undefined) {
    // 10 minute in-mem TTL if not set
    configEnv.STALE_TTL = (10 * 1000 * 60) + "";
  }
  context.config = getConfig(configEnv);

  // apply overrides
  if (config) {
    context.config = {
      ...context.config,
      ...config,
    };
  }

  // config.helpers
  context.helpers.getRequestURL = buildGetRequestURL(configEnv);
  context.helpers.getRequestMethod = getRequestMethod;
  context.helpers.getRequestHeader = getRequestHeader;
  context.helpers.sendResponse = sendResponse;
  context.helpers.fetch = fetchFn;
  context.helpers.proxyRequest = proxyRequest;
  context.helpers.getCookie = getCookie;
  context.helpers.setCookie = setCookie;

  if (helpers) {
    Object.assign(context.helpers, helpers);
  }

  if (hooks) {
    context.hooks = hooks;
  }

  return context;
}

export function mapHeadersToConfigEnv(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  originType: "custom" | "s3" = "custom",
  prefix: string = "x-env-",
): ConfigEnv {
  const config: ConfigEnv = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headersObj: Record<string, any> =
    req?.origin?.[originType]?.customHeaders || {};
  const headers = Object.entries(headersObj);
  headers.forEach(([key, header]) => {
    key = key.toLowerCase();
    const val = header?.[0]?.value;
    if (!val) return;
    if (key.startsWith(prefix)) {
      const envKey =
        key.slice(prefix.length)?.replace(/-/g, "_")?.toUpperCase?.() || "";
      config[envKey] = val;
    }
  });
  return config;
}
