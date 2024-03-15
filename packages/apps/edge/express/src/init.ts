import express from "express";
import * as crypto from "crypto";
import * as spdy from "spdy";
import dotenv from "dotenv";
import { Context, defaultContext } from "@growthbook/edge-utils";
import {
  getCookieAttributes,
  getRequestHeader,
  getRequestURL,
  setCookieAttributes,
  setResponseHeader
} from "./helpers";
dotenv.config({ path: "./.env.local" });

export default async () => {
  // Build context from default + env
  const context: Context = defaultContext;

  // config
  context.config.environment = process.env.NODE_ENV ?? "production";
  "MAX_PAYLOAD_SIZE" in process.env ? (context.config.maxPayloadSize = process.env.MAX_PAYLOAD_SIZE) : "2mb";
  "ATTRIBUTE_COOKIE_NAME" in process.env ? (context.config.attributeCookieName = process.env.ATTRIBUTE_COOKIE_NAME) : "gb-user-attributes";

  // config.crypto
  context.config.crypto = crypto;

  // config.attributeKeys
  "ATTRIBUTE_UUID" in process.env && (context.config.attributeKeys.uuid = process.env.ATTRIBUTE_UUID);
  "ATTRIBUTE_BROWSER" in process.env && (context.config.attributeKeys.browser = process.env.ATTRIBUTE_BROWSER);
  "ATTRIBUTE_DEVICE_TYPE" in process.env && (context.config.attributeKeys.deviceType = process.env.ATTRIBUTE_DEVICE_TYPE);
  "ATTRIBUTE_URL" in process.env && (context.config.attributeKeys.url = process.env.ATTRIBUTE_URL);
  "ATTRIBUTE_PATH" in process.env && (context.config.attributeKeys.path = process.env.ATTRIBUTE_PATH);
  "ATTRIBUTE_HOST" in process.env && (context.config.attributeKeys.host = process.env.ATTRIBUTE_HOST);
  "ATTRIBUTE_QUERY" in process.env && (context.config.attributeKeys.query = process.env.ATTRIBUTE_QUERY);

  // config.helpers
  context.helpers.getRequestURL = getRequestURL;
  context.helpers.getRequestHeader = getRequestHeader;
  context.helpers.setResponseHeader = setResponseHeader;
  context.helpers.getCookieAttributes = getCookieAttributes;
  context.helpers.setCookieAttributes = setCookieAttributes;


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
      console.info(`GrowthBook edge for Express running over HTTP2, port ${PROXY_PORT}`);
    });
  } else {
    server = app.listen(PROXY_PORT, () => {
      console.info(`GrowthBook edge for Express running over HTTP1.1, port ${PROXY_PORT}`);
    });
  }

  return { app, server, context };
};
