/* eslint-disable @typescript-eslint/no-explicit-any */

import { edgeApp, Config, Hooks, Helpers } from "@growthbook/edge-utils";
import { init, Env } from "./init";
import { responseToCloudFrontFormat } from "./helpers";

// Viewer_request handler. CloudFront expects { status, headers?, body }; convert Fetch Response when needed.
export async function handleRequest(
  event: any,
  callback: any,
  env?: Env,
  config?: Partial<Config>,
  hooks?: Hooks<Request, Response>,
  helpers?: Partial<Helpers<Request, Response>>,
) {
  const request = event.Records[0].cf.request;
  const context = await init(env, config, hooks, helpers);
  let response = await edgeApp(context, request);

  if (response instanceof Response) {
    response = await responseToCloudFrontFormat(response);
  }

  if (env?.returnResponse) return response;
  if (typeof callback === "function") {
    callback(null, response);
  }
}

export type { Env } from "./init";
export { mapHeadersToConfigEnv } from "./init";
export * as helpers from "./helpers";
