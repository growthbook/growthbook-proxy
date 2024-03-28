import { Context } from "./types";

export const defaultContext: Context = {
  config: {
    proxyTarget: "/",
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
