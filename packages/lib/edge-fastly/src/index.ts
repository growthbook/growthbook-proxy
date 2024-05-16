import { ConfigEnv, edgeApp } from "@growthbook/edge-utils";
import { init, FastlyConfig } from "./init";

interface FetchEvent {
  readonly request: Request;
}

export async function gbHandleRequest(
  event: FetchEvent,
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
) {
  const request = event.request;
  console.log("event", event);
  console.log("request", request);
  const context = await init(env, config);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export { getConfigEnvFromStore } from "./init";
export type { FastlyConfig } from "./init";
