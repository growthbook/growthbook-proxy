import {
  Context,
  ConfigEnv,
  defaultContext,
  getConfig,
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

export interface Env extends ConfigEnv {
  KV_GB_CACHE?: KVNamespace;
}

export async function init(env: Env): Promise<Context<Request, Response>> {
  const context = defaultContext as Context<Request, Response>;
  context.config = getConfig(env);
  context.config.localStorage = getKVLocalStoragePolyfill(env);
  context.config.growthbook.payload = await getPayloadFromKV(env);

  // config.helpers
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
