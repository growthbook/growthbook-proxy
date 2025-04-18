import { ConfigEnv, edgeApp, Hooks, Helpers } from "@growthbook/edge-utils";
import { init, FastlyConfig } from "./init";

export async function gbHandleRequest(
  request: Request,
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
) {
  const fastlyConfig = {
    autoInflate: true, // Fastly requires manually inflating gzipped content
    nocacheOrigin: true, // Fastly does not hydrate response body for 304 origin statuses. Send nocache header
    ...config,
  };
  const context = await init(env, fastlyConfig, hooks, helpers);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export { getConfigEnvFromStore, getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
export type { FastlyConfig } from "./init";
export * as helpers from "./helpers";
