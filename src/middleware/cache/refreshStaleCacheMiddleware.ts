import got from "got";
import { Request, Response } from "express";
import { version } from "../../../package.json";
import { featuresCache } from "../../services/cache";
import logger from "../../services/logger";
import { eventStreamManager } from "../../services/eventStreamManager";

const scopedPromises: Map<string, Promise<any>> = new Map();

export default ({ proxyTarget }: { proxyTarget: string }) =>
  async (req: Request, res: Response) => {
    if (!featuresCache) {
      return;
    }
    const apiKey = res.locals.apiKey;
    const url = proxyTarget + req.originalUrl;

    // debounce requests
    let promise = scopedPromises.get(url);
    if (!promise) {
      // eslint-disable-next-line no-async-promise-executor
      promise = new Promise(async (resolve, reject) => {
        const resp = await got
          .get(url, {
            headers: { "User-Agent": `GrowthBook Proxy ${version}` },
          })
          .json()
          .catch((e) => logger.error(e, "refresh stale cache error"));
        resolve(resp);
        scopedPromises.delete(url);
      });
      scopedPromises.set(url, promise);
    }

    const responseJson = await promise;

    if (responseJson) {
      logger.info("cache STALE, refreshing cache...");

      const oldEntry = await featuresCache.get(apiKey);
      await featuresCache.set(apiKey, responseJson);

      eventStreamManager.publish(
        apiKey,
        "features",
        responseJson,
        oldEntry?.payload
      );
    } else {
      logger.error("Unable to parse response");
    }
  };
