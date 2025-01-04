/* eslint-disable @typescript-eslint/no-explicit-any */

import { edgeApp, Config, Helpers, Hooks } from "@growthbook/edge-utils";
import { init, Env } from "./init";

export async function handleRequest(
  event: any,
  callback: any,
  env?: Env,
  config?: Partial<Config>,
  helpers?: Helpers<Request, Response>,
  hooks?: Hooks<Request, Response>,
) {
  const request = event.Records[0].cf.request;
  const context = await init(env, config, helpers, hooks);
  const response = await edgeApp(context, request);
  if (env?.returnResponse) return response;
  callback(null, response);
}

export type { Env } from "./init";
export { mapHeadersToConfigEnv } from "./init";
export * as helpers from "./helpers";
