import type { Request, Response } from "express";
import {
  Context,
  defaultContext,
  Helpers,
  getConfig,
  ConfigEnv,
} from "@growthbook/edge-utils";
import {
  getRequestURL,
  getRequestMethod,
  getRequestHeader,
  sendResponse,
  fetchFn,
  proxyRequest,
  getCookie,
  setCookie,
} from "./helpers";

export async function init(
  env: ConfigEnv,
): Promise<Context<Request, Response>> {
  const baseConfig = getConfig(env);
  return {
    config: baseConfig,
    helpers: {
      ...defaultContext.helpers,
      getRequestURL,
      getRequestMethod,
      getRequestHeader,
      sendResponse,
      fetch: fetchFn,
      proxyRequest: proxyRequest as Helpers<Request, Response>["proxyRequest"],
      getCookie,
      setCookie,
    },
    hooks: {},
  } as Context<Request, Response>;
}
