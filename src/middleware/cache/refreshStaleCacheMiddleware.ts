import got from "got";
import { Request, Response } from "express";
import { version } from "../../../package.json";
import { featuresCache } from "../../services/cache";

export default ({ proxyTarget }: { proxyTarget: string }) =>
  async (req: Request, res: Response) => {
    if (!featuresCache) {
      return;
    }
    const url = proxyTarget + req.originalUrl;
    const responseJson = await got
      .get(url, { headers: { "User-Agent": `GrowthBook Proxy ${version}` } })
      .json()
      .catch((e) => console.error("refresh stale cache error", e.message));
    if (responseJson) {
      console.debug("cache STALE, refreshing cache...");
      await featuresCache.set(res.locals.apiKey, responseJson);
    } else {
      console.error("Unable to parse response");
    }
  };
