import { ConfigEnv, edgeApp } from "@growthbook/edge-utils";
import { init, FastlyConfig } from "./init";

export async function gbHandleRequest(
  request: Request,
  env?: ConfigEnv,
  config?: Partial<FastlyConfig>,
) {
  const context = await init(env, config);
  return (await edgeApp<Request, Response>(context, request)) as Response;
}

export { getConfigEnvFromStore } from "./init";
export type { FastlyConfig } from "./init";
