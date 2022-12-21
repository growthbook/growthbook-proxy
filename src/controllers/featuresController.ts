import {NextFunction, Request, Response} from "express";
import readThroughCacheMiddleware from "../middleware/readThroughCacheMiddleware";
import {featuresCache} from "../services/cache";
import {API_URL} from "../init";
import {channelManager} from "../services/sse";


export const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  let entry = await featuresCache.get(res.locals.apiKey);
  const features = entry?.payload;

  if (features === undefined) {
    console.log("api url", API_URL)
    return readThroughCacheMiddleware({
      targetUrl: API_URL,
      cache: featuresCache,
    })(req, res, next);
  } else {
    console.log("cache HIT")
    res.header("Access-Control-Allow-Origin", "*");
    return res.send(JSON.stringify(features.payload));
  }
};

// TODO: use a webhook with apiKey scoped features
// TODO: implement check using sharedSecret
export const postFeatures = async (req: Request, res: Response, next: NextFunction) => {
  console.log(req.body)
  try {
    await featuresCache.dangerouslySetAll(req.body, (apiKey) => {
      console.log("cool....", apiKey)
      channelManager.publish(apiKey, "features", req.body);
    })
  } catch(e) {
    console.error("Unable to update features");
  }
  return res.send("new features!");
}