import {
  Context,
  ConfigEnv,
  defaultContext,
  getConfig,
  Config,
  Helpers,
  Hooks,
} from "@growthbook/edge-utils";
import { FeatureApiResponse } from "@growthbook/growthbook";
import { KVNamespace } from "@cloudflare/workers-types";
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

export interface Env extends ConfigEnv {
  KV_GB_CACHE?: KVNamespace;
}

export async function init(
  env: Env,
  config?: Partial<Config>,
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
): Promise<Context<Request, Response>> {
  const baseConfig = getConfig(env);
  const configObj: Config = {
    ...baseConfig,
    localStorage: getKVLocalStoragePolyfill(env),
    payload: await getPayloadFromKV(env),
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

export function getKVLocalStoragePolyfill(
  env: Env,
  namespace: string = "KV_GB_CACHE",
) {
  if (env?.[namespace]) {
    const KV: KVNamespace = env[namespace];
    return {
      getItem: async (key: string) => await KV.get(key),
      setItem: async (key: string, value: string) => await KV.put(key, value),
    };
  }
}

export async function getPayloadFromKV(
  env: Env,
  namespace: string = "KV_GB_PAYLOAD",
  key: string = "gb_payload",
) {
  if (env?.[namespace]) {
    const KV: KVNamespace = env[namespace];
    const value = (await KV.get(key)) || undefined;
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
}
