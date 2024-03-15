import { Context } from "./types";

export const getUUID = (
  ctx: Context
) => {
  const { config, helpers } = ctx;
  const crypto = config?.crypto || globalThis?.crypto;
  const getAttributes = helpers?.getAttributes;
  const setAttributes = helpers?.setAttributes;

  const attributeKeys = config?.attributeKeys || {};
  const uuidKey = attributeKeys?.uuid || "id";

  if (!crypto || !getAttributes || !setAttributes) {
    throw new Error("Missing required dependencies");
  }

  // const COOKIE_NAME = "gbuuid";
  // const COOKIE_DAYS = 400; // 400 days is the max cookie duration for chrome

  // use crypto.randomUUID if set
  const genUUID = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return ("" + 1e7 + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        ((c as unknown) as number) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] &
          (15 >> (((c as unknown) as number) / 4)))
      ).toString(16)
    );
  };

  // get the existing UUID from cookie if set, otherwise create one and store it in the cookie
  const attributes = getAttributes() || {};
  if (attributes[uuidKey]) return attributes[uuidKey];

  const uuid = genUUID();
  // todo: we're setting cookie here via setAttributes. do we need to do this, or handle it later?
  setAttributes({ ...attributes, [uuidKey]: uuid });
  return uuid;
};


export const getAutoAttributes = (
  ctx: Context
) => {
  const { config, helpers } = ctx;

  const getHeader = helpers?.getRequestHeader;
  const getUrl = helpers?.getRequestURL;
  const attributeKeys = config?.attributeKeys || {};

  const autoAttributes: Record<string, unknown> = {};

  // UUID
  if (attributeKeys.uuid) {
    autoAttributes[attributeKeys.uuid] = getUUID(ctx);
  }

  // browser and deviceType
  if (attributeKeys?.browser || attributeKeys?.deviceType) {
    const ua = getHeader?.("User-Agent") || "";
    if (attributeKeys?.browser) {
      autoAttributes[attributeKeys.browser] = ua.match(/Edg/)
        ? "edge"
        : ua.match(/Chrome/)
          ? "chrome"
          : ua.match(/Firefox/)
            ? "firefox"
            : ua.match(/Safari/)
              ? "safari"
              : "unknown";
    }
    if (attributeKeys?.deviceType) {
      autoAttributes[attributeKeys.deviceType] = ua.match(/Mobi/) ? "mobile" : "desktop";
    }
  }

  // URL
  const url = getUrl?.() || "";
  if (attributeKeys.url) {
    autoAttributes[attributeKeys.url] = url;
  }
  if (attributeKeys.path || attributeKeys.host || attributeKeys.query) {
    try {
      const urlObj = new URL(url);
      if (attributeKeys.path) {
        autoAttributes[attributeKeys.path] = urlObj.pathname;
      }
      if (attributeKeys.host) {
        autoAttributes[attributeKeys.host] = urlObj.host;
      }
      if (attributeKeys.query) {
        autoAttributes[attributeKeys.query] = urlObj.search;
      }
    } catch (e) {}
  }

  return attributeKeys;
}
