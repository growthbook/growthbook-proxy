import * as crypto from "crypto";
import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { Context, defaultContext } from "@growthbook/edge-utils";
import { ExperimentRunEnvironment } from "@growthbook/edge-utils/dist/types";
import {
  getRequestMethod,
  getRequestHeader,
  sendResponse,
  fetchFn,
  proxyRequest,
  getRequestURL,
  setResponseHeader,
  getUUIDCookie,
} from "./helpers";
dotenv.config({ path: "./.env.local" });

export default async () => {
  // Build context from default + env
  const context: Context = defaultContext;

  // config
  context.config.proxyTarget =
    process.env.PROXY_TARGET ?? defaultContext.config.proxyTarget;
  context.config.environment =
    process.env.NODE_ENV ?? defaultContext.config.environment;
  context.config.maxPayloadSize =
    process.env.MAX_PAYLOAD_SIZE ?? defaultContext.config.maxPayloadSize;

  try {
    context.config.routes = JSON.parse(process.env.ROUTES || "[]");
  } catch (e) {
    console.error("Error parsing ROUTES", e);
    context.config.routes = [];
  }

  context.config.runVisualEditorExperiments = (process.env
    .RUN_VISUAL_EDITOR_EXPERIMENTS ??
    defaultContext.config
      .runVisualEditorExperiments) as ExperimentRunEnvironment;
  context.config.disableJsInjection = ["true", "1"].includes(
    process.env.DISABLE_JS_INJECTION ??
      "" + defaultContext.config.disableJsInjection,
  );

  context.config.runUrlRedirectExperiments = (process.env
    .RUN_URL_REDIRECT_EXPERIMENTS ??
    defaultContext.config
      .runUrlRedirectExperiments) as ExperimentRunEnvironment;
  context.config.runCrossOriginUrlRedirectExperiments = (process.env
    .RUN_CROSS_ORIGIN_URL_REDIRECT_EXPERIMENTS ??
    defaultContext.config
      .runCrossOriginUrlRedirectExperiments) as ExperimentRunEnvironment;
  context.config.injectRedirectUrlScript = ["true", "1"].includes(
    process.env.INJECT_REDIRECT_URL_SCRIPT ??
      "" + defaultContext.config.injectRedirectUrlScript,
  );
  context.config.maxRedirects = parseInt(
    process.env.MAX_REDIRECTS || "" + defaultContext.config.maxRedirects,
  );

  context.config.scriptInjectionPattern =
    process.env.SCRIPT_INJECTION_PATTERN ||
    defaultContext.config.scriptInjectionPattern;
  context.config.disableInjections = ["true", "1"].includes(
    process.env.DISABLE_INJECTIONS ??
    "" + defaultContext.config.disableInjections);

  context.config.enableStreaming = ["true", "1"].includes(
    process.env.ENABLE_STREAMING ??
      "" + defaultContext.config.enableStreaming);
  context.config.enableStickyBuckets = ["true", "1"].includes(
    process.env.ENABLE_STICKY_BUCKETS ??
    "" + defaultContext.config.enableStickyBuckets);

  context.config.contentSecurityPolicy =
    process.env.CONTENT_SECURITY_POLICY || "";
  // warning: for testing only; nonce should be unique per request
  context.config.nonce = process.env.NONCE || undefined;

  context.config.crypto = crypto;

  // config.growthbook
  context.config.growthbook.apiHost = process.env.GROWTHBOOK_API_HOST ?? "";
  context.config.growthbook.clientKey = process.env.GROWTHBOOK_CLIENT_KEY ?? "";
  "GROWTHBOOK_DECRYPTION_KEY" in process.env &&
    (context.config.growthbook.decryptionKey =
      process.env.GROWTHBOOK_DECRYPTION_KEY);
  "GROWTHBOOK_TRACKING_CALLBACK" in process.env &&
    (context.config.growthbook.trackingCallback =
      process.env.GROWTHBOOK_TRACKING_CALLBACK);

  context.config.uuidCookieName = process.env.UUID_COOKIE_NAME || "gbuuid";
  // config.attributeKeys
  "ATTRIBUTE_UUID" in process.env &&
    (context.config.attributeKeys.uuid = process.env.ATTRIBUTE_UUID);
  "ATTRIBUTE_BROWSER" in process.env &&
    (context.config.attributeKeys.browser = process.env.ATTRIBUTE_BROWSER);
  "ATTRIBUTE_DEVICE_TYPE" in process.env &&
    (context.config.attributeKeys.deviceType =
      process.env.ATTRIBUTE_DEVICE_TYPE);
  "ATTRIBUTE_URL" in process.env &&
    (context.config.attributeKeys.url = process.env.ATTRIBUTE_URL);
  "ATTRIBUTE_PATH" in process.env &&
    (context.config.attributeKeys.path = process.env.ATTRIBUTE_PATH);
  "ATTRIBUTE_HOST" in process.env &&
    (context.config.attributeKeys.host = process.env.ATTRIBUTE_HOST);
  "ATTRIBUTE_QUERY" in process.env &&
    (context.config.attributeKeys.query = process.env.ATTRIBUTE_QUERY);

  context.config.skipAutoAttributes = ["true", "1"].includes(
    process.env.SKIP_AUTO_ATTRIBUTES ??
    "" + defaultContext.config.skipAutoAttributes);

  // config.helpers
  context.helpers.getRequestURL = getRequestURL;
  context.helpers.getRequestMethod = getRequestMethod;
  context.helpers.getRequestHeader = getRequestHeader;
  context.helpers.setResponseHeader = setResponseHeader;
  context.helpers.sendResponse = sendResponse;
  context.helpers.fetch = fetchFn;
  context.helpers.proxyRequest = proxyRequest;
  context.helpers.getUUIDCookie = getUUIDCookie;

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
