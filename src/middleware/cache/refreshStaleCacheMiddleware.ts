import got from "got";
import { Request, Response } from "express";
import { version } from "../../../package.json";
import { featuresCache } from "../../services/cache";
import logger from "../../services/logger";

export default ({ proxyTarget }: { proxyTarget: string }) =>
  async (req: Request, res: Response) => {
    if (!featuresCache) {
      return;
    }
    const url = proxyTarget + req.originalUrl;
    const responseJson = await got
      .get(url, { headers: { "User-Agent": `GrowthBook Proxy ${version}` } })
      .json()
      .catch((e) => logger.error(e, "refresh stale cache error"));
    if (responseJson) {
      logger.debug("cache STALE, refreshing cache...");
      await featuresCache.set(res.locals.apiKey, responseJson);
    } else {
      logger.error("Unable to parse response");
    }
  };
