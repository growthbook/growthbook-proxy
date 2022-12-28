import {NextFunction, Request, Response} from "express";
import readThroughCacheMiddleware from "../middleware/readThroughCacheMiddleware";
import {featuresCache} from "../services/cache";
import {channelManager} from "../services/sse";
import {registrar} from "../services/registrar";


export const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  const endpoints = registrar.getEndpointsByApiKey(res.locals.apiKey);
  if (!endpoints?.sdkBaseUrl) {
    return res.status(400).json({message: "Missing SDK endpoint"});
  }
  let entry = await featuresCache.get(res.locals.apiKey);
  const features = entry?.payload;

  if (features === undefined) {
    return readThroughCacheMiddleware({
      proxyTarget: endpoints.sdkBaseUrl,
      cache: featuresCache,
    })(req, res, next);
  } else {
    console.log("cache HIT")
    return res.send(JSON.stringify(features));
  }
};

export const postFeatures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = res.locals.apiKey;
    await featuresCache.set(apiKey, req.body);
    channelManager.publish(apiKey, "features", req.body);
  } catch(e) {
    console.error("Unable to update features");
  }
  return res.send("new features!");
}