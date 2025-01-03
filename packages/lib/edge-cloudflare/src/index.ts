import { edgeApp, Config } from "@growthbook/edge-utils";
import { init, Env } from "./init";

export async function handleRequest(
  request: Request,
  env: Env,
  config?: Partial<Config>,
) {
  const context = await init(env, config);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export type { Env } from "./init";
export { getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
export * as helpers from "./helpers";
