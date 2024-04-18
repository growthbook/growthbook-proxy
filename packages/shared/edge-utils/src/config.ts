import { Context } from "./types";

export const defaultContext: Context = {
  config: {
    proxyTarget: "/",
    environment: "production",
    maxPayloadSize: "2mb",
    runVisualEditorExperiments: "everywhere",
    disableJsInjection: false,
    runUrlRedirectExperiments: "edge",
    runCrossOriginUrlRedirectExperiments: "skip",
    maxRedirects: 5,
    scriptInjectionPattern: "</body>",
    growthbook: {
      apiHost: "",
      clientKey: "",
    },
    attributeKeys: {
      uuid: "id",
      browser: "browser",
      deviceType: "deviceType",
      url: "url",
      path: "path",
      host: "host",
      query: "query",
    },
  },
  helpers: {},
};
