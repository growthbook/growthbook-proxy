import got from "got";
import { Request, Response } from "express";
import { version } from "../../../package.json";
import { featuresCache } from "../../services/cache";
import logger from "../../services/logger";
import { eventStreamManager } from "../../services/eventStreamManager";

const activeFetchUrls = new Set<string>();

export default ({ proxyTarget }: { proxyTarget: string }) =>
  async (req: Request, res: Response) => {
    if (!featuresCache) {
      return;
    }
    const apiKey = res.locals.apiKey;
    const url = proxyTarget + req.originalUrl;

    // debounce requests
    if (activeFetchUrls.has(url)) {
      return;
    }
    activeFetchUrls.add(url);
    // eslint-disable-next-line no-async-promise-executor
    const entry = await got
      .get(url, { headers: { "User-Agent": `GrowthBook Proxy ${version}` } })
      .json()
      .catch((e) => logger.error(e, "Refresh stale cache error"))
      .finally(() => activeFetchUrls.delete(url));

    if (entry) {
      logger.debug("cache STALE, refreshing cache...");

      const oldEntry = await featuresCache.get(apiKey);
      await featuresCache.set(apiKey, entry);

      eventStreamManager.publish(apiKey, "features", entry, oldEntry?.payload);
    } else {
      logger.error("Unable to parse response");
    }
  };
