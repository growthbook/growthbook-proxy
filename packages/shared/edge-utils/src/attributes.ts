import { Attributes } from "@growthbook/growthbook";
import { Context } from "./types";

// Get the user's attributes by merging the UUID cookie with any auto-attributes
export function getUserAttributes(
  ctx: Context,
  req: Request,
  res: Response,
  url: string,
): Attributes {
  const { config, helpers } = ctx;

  const providedAttributes = config.growthbook.attributes || {};
  if (config.skipAutoAttributes) {
    return providedAttributes;
  }
  // get any saved attributes from the cookie
  const uuid = getUUID(ctx, req);
  if (config.persistUuid) {
    if (!helpers?.setCookie) {
      throw new Error("Missing required dependencies");
    }
    helpers.setCookie(res, config.uuidCookieName, uuid);
  }

  const autoAttributes = getAutoAttributes(ctx, req, url);
  return { ...autoAttributes, ...providedAttributes };
}

// Get or create a UUID for the user:
// - Try to get the UUID from the cookie
// - Or create a new one and store in the cookie
export function getUUID(
  ctx: Context,
  req: Request,
) {
  const { config, helpers } = ctx;

  const crypto = config?.crypto || globalThis?.crypto;

  if (!crypto || !helpers?.getCookie) {
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
  return helpers.getCookie(req, config.uuidCookieName) || genUUID();
}

// Infer attributes from the request
// - UUID will come from the cookie or be generated
// - Other attributes come from the request headers and URL
export function getAutoAttributes(
  ctx: Context,
  req: Request,
  url: string,
): Attributes {
  const { config, helpers } = ctx;

  const getHeader = helpers?.getRequestHeader;

  const autoAttributes: Attributes = {
    [config.uuidKey]: getUUID(ctx, req),
  };

  const ua = getHeader?.(req, "user-agent") || "";
  autoAttributes.browser = ua.match(/Edg/)
    ? "edge"
    : ua.match(/Chrome/)
    ? "chrome"
    : ua.match(/Firefox/)
    ? "firefox"
    : ua.match(/Safari/)
    ? "safari"
    : "unknown";
  autoAttributes.deviceType = ua.match(/Mobi/)
    ? "mobile"
    : "desktop";

  autoAttributes.url = url;

  try {
    const urlObj = new URL(url);
    autoAttributes.path = urlObj.pathname;
    autoAttributes.host = urlObj.host;
    autoAttributes.query = urlObj.search;
  } catch (e) {
    // ignore
  }

  return autoAttributes;
}
