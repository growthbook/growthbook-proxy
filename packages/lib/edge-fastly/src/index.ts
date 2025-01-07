import { ConfigEnv, edgeApp, Hooks, Helpers } from "@growthbook/edge-utils";
import { init, FastlyConfig } from "./init";

export async function gbHandleRequest(
  request: Request,
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
) {
  const context = await init(env, config, hooks, helpers);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export { getConfigEnvFromStore, getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
export type { FastlyConfig } from "./init";
export * as helpers from "./helpers";
