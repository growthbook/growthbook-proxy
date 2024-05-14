/* eslint-disable @typescript-eslint/no-explicit-any */

import { edgeApp, Config } from "@growthbook/edge-utils";
import { init, Env } from "./init";

export async function handleRequest(
  event: any,
  callback: any,
  env?: Env,
  config?: Partial<Config>,
) {
  const request = event.Records[0].cf.request;
  const context = await init(env, config);
  const response = await edgeApp(context, request);
  if (env?.returnResponse) return response;
  callback(null, response);
}

export type { Env } from "./init";
export { mapHeadersToConfigEnv } from "./init";
