import express, {NextFunction, Request, Response} from "express";
import readThroughCacheMiddleware from "../middleware/readThroughCacheMiddleware";
import {featuresCache} from "../services/cache";
import {registrar} from "../services/registrar";
import {apiKeyMiddleware} from "../middleware/apiKeyMiddleware";
import webhookVerificationMiddleware from "../middleware/webhookVerificationMiddleware";
import {reencryptionMiddleware} from "../middleware/reencryptionMiddleware";
import {broadcastSseMiddleware} from "../middleware/broadcastSseMiddleware";


const getFeatures = async (req: Request, res: Response, next: NextFunction) => {
  const endpoints = registrar.getEndpointsByApiKey(res.locals.apiKey);
  if (!endpoints?.sdkBaseUrl) {
    return res.status(400).json({message: "Missing SDK endpoint"});
  }
  let entry = await featuresCache.get(res.locals.apiKey);
  const features = entry?.payload;

  if (features === undefined) {
    return readThroughCacheMiddleware({
      proxyTarget: endpoints.sdkBaseUrl,
    })(req, res, next);
  } else {
    console.debug("cache HIT")
    return res.status(200).json(features);
  }
};

const postFeatures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await featuresCache.set(res.locals.apiKey, req.body);
  } catch(e) {
    console.error("Unable to update features", e);
    return res.status(500).json({message: "Unable to update features"});
  }
  return res.status(200).json({message: "success"});
}


export const featuresRouter = express.Router();
featuresRouter.use(apiKeyMiddleware);

// proxy clients' "get features" endpoint call to GrowthBook, with cache layer
featuresRouter.get('/api/features/*', getFeatures);

// subscribe to GrowthBook's "post features" updates, refresh cache, publish to subscribed clients
featuresRouter.post(
  '/proxy/features',
  express.json({
    verify: (req: Request, res: Response, buf: Buffer) => res.locals.rawBody = buf
  }),
  webhookVerificationMiddleware,
  reencryptionMiddleware,
  broadcastSseMiddleware,
  postFeatures,
);