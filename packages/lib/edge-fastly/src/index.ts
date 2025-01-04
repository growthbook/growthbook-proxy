import { ConfigEnv, edgeApp, Helpers, Hooks } from "@growthbook/edge-utils";
import { init, FastlyConfig } from "./init";

export async function gbHandleRequest(
  request: Request,
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
  helpers?: Helpers<Request, Response>,
  hooks?: Hooks<Request, Response>,
) {
  const context = await init(env, config, helpers, hooks);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export { getConfigEnvFromStore, getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
export type { FastlyConfig } from "./init";
export * as helpers from "./helpers";
