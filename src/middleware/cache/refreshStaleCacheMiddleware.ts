import got from "got";
import {NextFunction, Request, Response} from "express";
import {featuresCache} from "../../services/cache";

export default ({
  proxyTarget,
}: {
  proxyTarget: string;
}) => async (req: Request, res: Response, next: NextFunction) => {
  const url = proxyTarget + req.originalUrl;
  const responseJson = await got.get(url).json();
  if (responseJson) {
    console.debug('cache STALE, refreshing cache...');
    await featuresCache.set(res.locals.apiKey, responseJson);
  } else {
    console.error("Unable to parse response");
  }
}