import * as https from "https";
import { Context } from "../../types";
import { featuresCache } from "../cache";
import logger from "../logger";
import { eventStreamManager } from "../eventStreamManager";
import { parseJsonSafely } from "../utils/jsonParser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeFetches: Record<string, any> = {};

interface FetchFeaturesOptions {
  apiKey: string;
  ctx: Context;
  remoteEvalEnabled?: boolean;
  organization?: string; // for multi-orgs
}

function buildRequestHeaders(
  remoteEvalEnabled: boolean,
  ctx: Context,
  organization?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "GrowthBook Proxy",
  };

  if (remoteEvalEnabled) {
    if (!ctx.secretApiKey) {
      throw new Error("missing required context for fetching features");
    }
    headers["Authorization"] = `Bearer ${ctx.secretApiKey}`;
  }

  if (organization && ctx.multiOrg) {
    headers["X-Organization"] = organization;
  }

  return headers;
}

function buildFetchOptions(headers: Record<string, string>): RequestInit & { agent?: https.Agent } {
  const options: RequestInit & { agent?: https.Agent } = { headers };

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    options.agent = new https.Agent({ rejectUnauthorized: false });
  }

  return options;
}

async function fetchAndParseResponse(
  url: string,
  options: RequestInit & { agent?: https.Agent }
): Promise<unknown> {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return await parseJsonSafely(buffer);
}

export async function fetchFeatures({
  apiKey,
  ctx,
  remoteEvalEnabled = false,
  organization,
}: FetchFeaturesOptions) {
  if (!featuresCache) {
    return;
  }

  if (!ctx.growthbookApiHost) {
    throw new Error("missing required context for fetching features");
  }

  const endpoint = remoteEvalEnabled
    ? `/api/v1/sdk-payload/${apiKey}`
    : `/api/features/${apiKey}`;
  const url = `${ctx.growthbookApiHost}${endpoint}`;

  let promise = activeFetches[url];

  if (!promise) {
    ctx?.verboseDebugging && logger.info({ url }, "activeFetches debounce miss, creating new fetch");
    const headers = buildRequestHeaders(remoteEvalEnabled, ctx, organization);
    const fetchOptions = buildFetchOptions(headers);

    promise = fetchAndParseResponse(url, fetchOptions)
      .catch((e) => {
        logger.error(e, "Refresh stale cache error");
        return Promise.reject(e);
      })
      .finally(() => {
        delete activeFetches[url];
      });

    activeFetches[url] = promise;
  }

  let payload: unknown = null;
  try {
    payload = await promise;
  } catch (e) {
    // ignore, logging handled in promise
  }

  if (payload) {
    logger.debug("cache STALE, refreshing cache...");
    const oldEntry = await featuresCache.get(apiKey);
    await featuresCache?.set(apiKey, payload);

    if (ctx.enableEventStream && eventStreamManager) {
      eventStreamManager?.publish({
        apiKey,
        event: remoteEvalEnabled ? "features-updated" : "features",
        payload,
        oldPayload: oldEntry?.payload,
      });
    }

    return { payload, oldEntry };
  } else {
    logger.error("Unable to parse response");
    return;
  }
}
