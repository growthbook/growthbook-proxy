import { edgeApp } from "@growthbook/edge-utils";
import { init, Env } from "./init";

export async function handleRequest(request: Request, env: Env) {
  const context = await init(env);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export type { Env } from "./init";
export { getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
