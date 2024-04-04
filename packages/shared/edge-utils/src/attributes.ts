import { Attributes } from "@growthbook/growthbook";
import { Context } from "./types";

// Get the user's attributes by merging the UUID cookie with any auto-attributes
export function getUserAttributes(
  ctx: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
): Attributes {
  // get any saved attributes from the cookie
  const uuid = getUUID(ctx, req);
  const attributes = {
    [ctx.config.attributeKeys.uuid || "id"]: uuid,
  };
  // enhance the attributes with any new information
  const autoAttributes = getAutoAttributes(ctx, req);
  return { ...attributes, ...autoAttributes };
}

// Get or create a UUID for the user:
// - Try to get the UUID from the cookie
// - Or create a new one and store in the cookie
export function getUUID(
  ctx: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
) {
  const { config, helpers } = ctx;

  const crypto = config?.crypto || globalThis?.crypto;
  const getUUIDCookie = helpers?.getUUIDCookie;

  if (!crypto || !getUUIDCookie) {
    throw new Error("Missing required dependencies");
  }

  const genUUID = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return ("" + 1e7 + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        (c as unknown as number) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] &
          (15 >> ((c as unknown as number) / 4)))
      ).toString(16),
    );
  };

  // get the existing UUID from cookie if set, otherwise create one
  return getUUIDCookie(ctx, req) || genUUID();
}

// Infer attributes from the request
// - UUID will come from the cookie or be generated
// - Other attributes come from the request headers and URL
export function getAutoAttributes(
  ctx: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
): Attributes {
  const { config, helpers } = ctx;

  const getHeader = helpers?.getRequestHeader;
  const getUrl = helpers?.getRequestURL;
  const attributeKeys = config?.attributeKeys || {};

  const autoAttributes: Record<string, unknown> = {};

  // UUID
  if (attributeKeys.uuid) {
    autoAttributes[attributeKeys.uuid] = getUUID(ctx, req);
  }

  // browser and deviceType
  if (attributeKeys?.browser || attributeKeys?.deviceType) {
    const ua = getHeader?.(req, "user-agent") || "";
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
      autoAttributes[attributeKeys.deviceType] = ua.match(/Mobi/)
        ? "mobile"
        : "desktop";
    }
  }

  // URL
  const url = getUrl?.(req) || "";
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
    } catch (e) {
      // ignore
    }
  }

  return autoAttributes;
}
