import * as https from "https";
import { Context } from "../../types";
import { CacheEntry, featuresCache } from "../cache";
import logger from "../logger";
import { eventStreamManager } from "../eventStreamManager";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeFetches: Record<string, Promise<{ payload: any, oldEntry: CacheEntry | undefined }>> = {};

export async function fetchFeatures({
  apiKey,
  ctx,
  remoteEvalEnabled = false,
  organization,
}: {
  apiKey: string;
  ctx: Context;
  remoteEvalEnabled?: boolean;
  organization?: string; // for multi-orgs
}): Promise<{ payload: any, oldEntry: CacheEntry | undefined }> {
  const path = remoteEvalEnabled
    ? `/api/v1/sdk-payload/${apiKey}`
    : `/api/features/${apiKey}`;
  if (!featuresCache) {
    throw new Error("missing features cache");
  }
  if (!ctx.growthbookApiHost) {
    throw new Error("missing required context for fetching features");
  }
  const url = ctx.growthbookApiHost + path;

  // debounce requests
  let promise = activeFetches[url];

  if (!promise) {
    promise = (async () => {
      logger.debug("fetching features from GrowthBook API");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headers: any = {
        "User-Agent": `GrowthBook Proxy`,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchOptions: any = { headers };
      if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        fetchOptions.agent = new https.Agent({ rejectUnauthorized: false });
      }
      
      const resp = await fetch(url, fetchOptions);
      if (!resp.ok) {
        throw new Error(`HTTP error: ${resp.status}`);
      }
      const payload = await resp.json();

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
        logger.error({ apiKey, url }, "Unable to parse response");
        throw new Error("Unable to parse response");
      }
    })()
      .catch((e) => {
        logger.error({ err: e }, "Refresh stale cache error");
        return Promise.reject(e);
      })
      .finally(() => delete activeFetches[url]);

    activeFetches[url] = promise;
  }

  return await promise;
}
