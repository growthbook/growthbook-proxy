import * as crypto from "crypto";
import express from "express";
import * as spdy from "spdy";
import dotenv from "dotenv";
import type { Request, Response } from "express";
import {
  Context,
  defaultContext,
  ExperimentRunEnvironment,
  Helpers,
} from "@growthbook/edge-utils";
import {
  getRequestMethod,
  getRequestHeader,
  sendResponse,
  fetchFn,
  proxyRequest,
  getRequestURL,
  setResponseHeader,
  getCookie,
  setCookie,
} from "./helpers";
dotenv.config({ path: "./.env.local" });

export default async () => {
  // Build context from default + env
  const context = defaultContext as Context<Request, Response>;

  // config
  context.config.proxyTarget =
    process.env.PROXY_TARGET ?? defaultContext.config.proxyTarget;
  context.config.forwardProxyHeaders = ["true", "1"].includes(
    process.env.FORWARD_PROXY_HEADERS ??
    "" + defaultContext.config.forwardProxyHeaders,
  );
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
      "" + defaultContext.config.disableInjections,
  );

  context.config.enableStreaming = ["true", "1"].includes(
    process.env.ENABLE_STREAMING ?? "" + defaultContext.config.enableStreaming,
  );
  context.config.enableStickyBucketing = ["true", "1"].includes(
    process.env.ENABLE_STICKY_BUCKETING ??
      "" + defaultContext.config.enableStickyBucketing,
  );
  "STICKY_BUCKET_PREFIX" in process.env &&
    (context.config.stickyBucketPrefix = process.env.STICKY_BUCKET_PREFIX);

  context.config.contentSecurityPolicy =
    process.env.CONTENT_SECURITY_POLICY || "";
  // warning: for testing only; nonce should be unique per request
  context.config.nonce = process.env.NONCE || undefined;

  context.config.crypto = crypto;

  // config.growthbook
  context.config.growthbook.apiHost = (process.env.GROWTHBOOK_API_HOST ?? "")
    .replace(/\/*$/, "");
  context.config.growthbook.clientKey = process.env.GROWTHBOOK_CLIENT_KEY ?? "";
  "GROWTHBOOK_DECRYPTION_KEY" in process.env &&
    (context.config.growthbook.decryptionKey =
      process.env.GROWTHBOOK_DECRYPTION_KEY);
  "GROWTHBOOK_TRACKING_CALLBACK" in process.env &&
    (context.config.growthbook.trackingCallback =
      process.env.GROWTHBOOK_TRACKING_CALLBACK);
  try {
    "GROWTHBOOK_PAYLOAD" in process.env &&
      (context.config.growthbook.payload = JSON.parse(
        process.env.GROWTHBOOK_PAYLOAD || "",
      ));
  } catch (e) {
    console.error("Error parsing GROWTHBOOK_PAYLOAD", e);
  }

  context.config.persistUuid = ["true", "1"].includes(
    process.env.PERSIST_UUID ?? "" + defaultContext.config.persistUuid,
  );
  context.config.uuidCookieName =
    process.env.UUID_COOKIE_NAME || defaultContext.config.uuidCookieName;
  context.config.uuidKey =
    process.env.UUID_KEY || defaultContext.config.uuidKey;

  context.config.skipAutoAttributes = ["true", "1"].includes(
    process.env.SKIP_AUTO_ATTRIBUTES ??
      "" + defaultContext.config.skipAutoAttributes,
  );

  // config.helpers
  context.helpers.getRequestURL = getRequestURL;
  context.helpers.getRequestMethod = getRequestMethod;
  context.helpers.getRequestHeader = getRequestHeader;
  context.helpers.setResponseHeader = setResponseHeader;
  context.helpers.sendResponse = sendResponse;
  // no createNewResponse
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
