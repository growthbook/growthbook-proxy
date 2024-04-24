import { Context } from "./types";

export const defaultContext: Context = {
  config: {
    proxyTarget: "/",
    environment: "production",
    maxPayloadSize: "2mb",
    runVisualEditorExperiments: "everywhere",
    disableJsInjection: false,
    runUrlRedirectExperiments: "browser",
    runCrossOriginUrlRedirectExperiments: "browser",
    injectRedirectUrlScript: true,
    maxRedirects: 5,
    scriptInjectionPattern: "</body>",
    disableInjections: false,
    enableStreaming: false,
    enableStickyBucketing: false,
    growthbook: {
      apiHost: "",
      clientKey: "",
    },
    persistUuid: false,
    attributeKeys: {
      uuid: "id",
      browser: "browser",
      deviceType: "deviceType",
      url: "url",
      path: "path",
      host: "host",
      query: "query",
    },
    skipAutoAttributes: false,
  },
  helpers: {},
};
