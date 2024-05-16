import {
  Context,
  defaultContext,
  getConfig,
  Config,
  ConfigEnv,
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

export interface FastlyConfig extends Config {
  backends?: Record<string, string>;
}
// export interface Env extends ConfigEnv {
//   KV_GB_CACHE?: KVNamespace;
// }

interface ConfigStore {
  get(key: string): string;
}

export async function init(
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
): Promise<Context<Request, Response>> {
  const context = defaultContext as Context<Request, Response>;
  if (env) {
    context.config = getConfig(env) as FastlyConfig;
  }

  // todo:
  // context.config.localStorage = getKVLocalStoragePolyfill(env);
  // context.config.payload = await getPayloadFromKV(env);

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

  return context;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConfigEnvFromStore(store: any): ConfigEnv {
  const configEnv: ConfigEnv = {};

  // replace: `\s*(.*)\?.*` with: `    "$1",\n`
  const fields = [
    "PROXY_TARGET",
    "FORWARD_PROXY_HEADERS",
    "NODE_ENV",
    "MAX_PAYLOAD_SIZE",
    "ROUTES",
    "RUN_VISUAL_EDITOR_EXPERIMENTS",
    "DISABLE_JS_INJECTION",
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
