import got from "got";
import { Request, Response } from "express";
import { featuresCache } from "../../services/cache";

export default ({ proxyTarget }: { proxyTarget: string }) =>
  async (req: Request, res: Response) => {
    const url = proxyTarget + req.originalUrl;
    const responseJson = await got
      .get(url)
      .json()
      .catch((e) => console.error("refresh stale cache error", e.message));
    if (responseJson) {
      featuresCache && console.debug("cache STALE, refreshing cache...");
      featuresCache &&
        (await featuresCache.set(res.locals.apiKey, responseJson));
    } else {
      console.error("Unable to parse response");
    }
  };
