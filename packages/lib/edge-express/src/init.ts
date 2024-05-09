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
  const context = defaultContext as Context<Request, Response>;
  context.config = getConfig(env);

  // config.helpers
  context.helpers.getRequestURL = getRequestURL;
  context.helpers.getRequestMethod = getRequestMethod;
  context.helpers.getRequestHeader = getRequestHeader;
  context.helpers.sendResponse = sendResponse;
  context.helpers.fetch = fetchFn;
  context.helpers.proxyRequest = proxyRequest as Helpers<
    Request,
    Response
  >["proxyRequest"];
  context.helpers.getCookie = getCookie;
  context.helpers.setCookie = setCookie;

  return context;
}
