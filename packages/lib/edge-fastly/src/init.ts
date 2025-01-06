import {
  Context,
  defaultContext,
  getConfig,
  Config,
  ConfigEnv,
  Helpers,
  Hooks,
} from "@growthbook/edge-utils";
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
import { FeatureApiResponse } from "@growthbook/growthbook";

export interface FastlyConfig extends Config {
  apiHostBackend?: string;
  backends?: Record<string, string>;
  gbCacheStore?: any;
  gbPayloadStore?: any;
  fetchFeaturesCall?: Config['fetchFeaturesCall'];
}

export async function init(
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
): Promise<Context<Request, Response>> {
  const context = defaultContext as Context<Request, Response>;
  if (env) {
    context.config = getConfig(env) as FastlyConfig;
  }

  if (config?.gbCacheStore) {
    context.config.localStorage = getKVLocalStoragePolyfill(config.gbCacheStore);
  }
  if (config?.gbPayloadStore) {
    context.config.payload = await getPayloadFromKV(config.gbPayloadStore);
  }
  if (config?.apiHostBackend) {
    config.fetchFeaturesCall = ({ host, clientKey, headers }: {host: string, clientKey: string, headers?: Record<string, string>}) => {
      return fetch(
        `${host}/api/features/${clientKey}`,
        {
          headers,
          // @ts-ignore
          backend: config.apiHostBackend
        }
      );
    };
  }

  // apply overrides
  if (config) {
    context.config = {
      ...context.config,
      ...config,
    };
  }

  context.helpers.getRequestURL = getRequestURL;
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

export function getKVLocalStoragePolyfill(store: any) {
  return {
    getItem: async (key: string) => {
      const entry = await store.get(key);
      return await entry?.text() ?? null;
    },
    setItem: async (key: string, value: string) => await store.put(key, value),
  };
}

export async function getPayloadFromKV(
  store: any,
  key: string = "gb_payload",
) {
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
    "SCRIPT_INJECTION_PATTERN",
    "DISABLE_INJECTIONS",
    "ENABLE_STREAMING",
    "ENABLE_STICKY_BUCKETING",
    "STICKY_BUCKET_PREFIX",
    "CONTENT_SECURITY_POLICY",
    "NONCE",
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

  fields.forEach(key => {
    const val = store.get(key);
    if (val !== null) {
      configEnv[key] = val;
    }
  });
  return configEnv;
}
