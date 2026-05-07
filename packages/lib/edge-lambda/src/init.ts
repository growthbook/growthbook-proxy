import {
  Context,
  defaultContext,
  getConfig,
  ConfigEnv,
  Config,
  Helpers,
  Hooks,
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
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
): Promise<Context<Request, Response>> {
  const configEnv = env || {};
  if (configEnv.STALE_TTL === undefined) {
    configEnv.STALE_TTL = 10 * 1000 * 60 + "";
  }
  const baseConfig = getConfig(configEnv);
  const context = {
    config: config ? { ...baseConfig, ...config } : baseConfig,
    helpers: {
      ...defaultContext.helpers,
      getRequestURL: buildGetRequestURL(configEnv),
      getRequestMethod,
      getRequestHeader,
      sendResponse,
      fetch: fetchFn,
      proxyRequest,
      getCookie,
      setCookie,
      ...helpers,
    },
    hooks: hooks ?? {},
  };
  return context as Context<Request, Response>;
}

// Reads env from CloudFront origin custom headers. At viewer_request, request.origin may be absent; pass env/config to init() instead.
export function mapHeadersToConfigEnv(
  req: {
    origin?: {
      custom?: { customHeaders?: Record<string, Array<{ value?: string }>> };
      s3?: { customHeaders?: Record<string, Array<{ value?: string }>> };
    };
  },
  originType: "custom" | "s3" = "custom",
  prefix: string = "x-env-",
): ConfigEnv {
  const config: ConfigEnv = {};
  const headersObj = req?.origin?.[originType]?.customHeaders ?? {};
  for (const [key, header] of Object.entries(headersObj)) {
    const k = key.toLowerCase();
    const val = header?.[0]?.value;
    if (!val || !k.startsWith(prefix)) continue;
    const envKey =
      k.slice(prefix.length).replace(/-/g, "_").toUpperCase() || "";
    config[envKey] = val;
  }
  return config;
}
