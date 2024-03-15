import { Context } from "./types";

export const defaultContext: Context = {
  config: {
    attributeKeys: {
      uuid: "uuid",
      browser: "browser",
      deviceType: "deviceType",
      url: "url",
      path: "path",
      host: "host",
      query: "query",
    }
  },
  helpers: {}
}
