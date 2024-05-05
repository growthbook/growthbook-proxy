import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import type { Request, Response } from "express";
import {
  Context,
  defaultContext,
  Helpers,
  getConfig,
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
dotenv.config({ path: "./.env.local" });

export default () => {
  const context = defaultContext as Context<Request, Response>;
  context.config = getConfig(process.env as Record<string, string>);

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

  // Express configuration consts:
  const USE_HTTP2 = process.env.USE_HTTP2;
  const HTTPS_CERT = process.env.HTTPS_CERT;
  const HTTPS_KEY = process.env.HTTPS_KEY;

  function getPort() {
    if (process.env.PORT) {
      const port = parseInt(process.env.PORT);
      if (!isNaN(port) && port > 0) {
        return port;
      }
    }
    return 3301;
  }
  const PROXY_PORT = getPort();

  // Start Express
  const app = express();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let server: any = null;

  // Start app
  if (USE_HTTP2) {
    server = spdy.createServer(
      {
        key: HTTPS_KEY,
        cert: HTTPS_CERT,
      },
      app,
    );
    server.listen(PROXY_PORT, () => {
      console.info(
        `GrowthBook edge for Express running over HTTP2, port ${PROXY_PORT}`,
      );
    });
  } else {
    server = app.listen(PROXY_PORT, () => {
      console.info(
        `GrowthBook edge for Express running over HTTP1.1, port ${PROXY_PORT}`,
      );
    });
  }

  return { app, server, context };
};
