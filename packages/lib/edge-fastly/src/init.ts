import {
  Context,
  defaultContext,
  getConfig,
  Config,
  ConfigEnv,
  Helpers,
  Hooks,
} from "@growthbook/edge-utils";
import { FeatureApiResponse } from "@growthbook/growthbook";
import {
  getRequestURL,
  getRequestMethod,
  getRequestHeader,
  sendResponse,
  fetchFn,
  proxyRequest,
  getCookie,
  setCookie,
} from "./helpers";

export interface FastlyConfig extends Config {
  apiHostBackend?: string;
  backends?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gbCacheStore?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gbPayloadStore?: any;
  fetchFeaturesCall?: Config["fetchFeaturesCall"];
}

export async function init(
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
): Promise<Context<Request, Response>> {
  const baseConfig = env
    ? (getConfig(env) as FastlyConfig)
    : { ...defaultContext.config };
  const apiHostBackend = config?.apiHostBackend;
  const fetchFeaturesCall = apiHostBackend
    ? ({
        host,
        clientKey,
        headers,
      }: {
        host: string;
        clientKey: string;
        headers?: Record<string, string>;
      }) =>
        fetch(`${host}/api/features/${clientKey}`, {
          headers,
          // @ts-expect-error Fastly backend
          backend: apiHostBackend,
        })
    : undefined;
  let configObj: FastlyConfig = {
    ...baseConfig,
    ...(config?.gbCacheStore && {
      localStorage: getKVLocalStoragePolyfill(config.gbCacheStore),
    }),
    ...(config?.gbPayloadStore && {
      payload: await getPayloadFromKV(config.gbPayloadStore),
    }),
    ...(fetchFeaturesCall && { fetchFeaturesCall }),
    ...config,
  };
  return {
    config: configObj,
    helpers: {
      ...defaultContext.helpers,
      getRequestURL,
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
  } as Context<Request, Response>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getKVLocalStoragePolyfill(store: any) {
  return {
    getItem: async (key: string) => {
      const entry = await store.get(key);
      return (await entry?.text()) ?? null;
    },
    setItem: async (key: string, value: string) => await store.put(key, value),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPayloadFromKV(store: any, key: string = "gb_payload") {
  const entry = await store.get(key);
  const value = await entry?.text();
  let payload = undefined;
  if (value) {
    try {
      payload = JSON.parse(value) as FeatureApiResponse;
    } catch (e) {
      console.warn("Unable to parse payload", e);
    }
  }
  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConfigEnvFromStore(store: any): ConfigEnv {
  const configEnv: ConfigEnv = {};

  // replace: `\s*(.*)\?.*` with: `    "$1",\n`
  const fields = [
    "PROXY_TARGET",
    "FORWARD_PROXY_HEADERS",
    "FOLLOW_REDIRECTS",
    "USE_DEFAULT_CONTENT_TYPE",
    "PROCESS_TEXT_HTML_ONLY",
    "NODE_ENV",
    "MAX_PAYLOAD_SIZE",
    "ROUTES",
    "RUN_VISUAL_EDITOR_EXPERIMENTS",
    "DISABLE_JS_INJECTION",
    "ALWAYS_PARSE_DOM",
    "RUN_URL_REDIRECT_EXPERIMENTS",
    "RUN_CROSS_ORIGIN_URL_REDIRECT_EXPERIMENTS",
    "INJECT_REDIRECT_URL_SCRIPT",
    "MAX_REDIRECTS",
    "EXPERIMENT_URL_TARGETING",
    "SCRIPT_INJECTION_PATTERN",
    "DISABLE_INJECTIONS",
    "ENABLE_STREAMING",
    "ENABLE_STICKY_BUCKETING",
    "STICKY_BUCKET_PREFIX",
    "CONTENT_SECURITY_POLICY",
    "NONCE",
    "EMIT_TRACE_HEADERS",
    "GROWTHBOOK_API_HOST",
    "GROWTHBOOK_CLIENT_KEY",
    "GROWTHBOOK_DECRYPTION_KEY",
    "GROWTHBOOK_TRACKING_CALLBACK",
    "GROWTHBOOK_PAYLOAD",
    "STALE_TTL",
    "PERSIST_UUID",
    "NO_AUTO_COOKIES",
    "UUID_COOKIE_NAME",
    "UUID_KEY",
    "SKIP_AUTO_ATTRIBUTES",
  ];

  fields.forEach((key) => {
    const val = store.get(key);
    if (val !== null) {
      configEnv[key] = val;
    }
  });
  return configEnv;
}
