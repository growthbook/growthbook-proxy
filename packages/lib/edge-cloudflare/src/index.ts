import { edgeApp, Config, Hooks, Helpers } from "@growthbook/edge-utils";
import { init, Env } from "./init";

export async function handleRequest(
  request: Request,
  env: Env,
  config?: Partial<Config>,
  helpers?: Partial<Helpers<Request, Response>>,
  hooks?: Hooks<Request, Response>,
) {
  const context = await init(env, config, hooks, helpers);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export type { Env } from "./init";
export { getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
export * as helpers from "./helpers";
