import {NextFunction, Request, Response} from "express";
import readThroughCacheMiddleware from "../middleware/readThroughCacheMiddleware";
import {featuresCache} from "../services/cache";
import {registrar} from "../services/registrar";
import {encrypt} from "../services/encryption";


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
    })(req, res, next);
  } else {
    console.debug("cache HIT")
    return res.status(200).json(features);
  }
};

export const postFeatures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoints = registrar.getEndpointsByApiKey(res.locals.apiKey);
    // when updating cache, decrypt payload if encrypted
    if (endpoints?.sdkEncryptionSecret) {
      req.body.encryptedFeatures = await encrypt(JSON.stringify(req.body.features), endpoints.sdkEncryptionSecret);
      req.body.features = {};
    }
    await featuresCache.set(res.locals.apiKey, req.body);
  } catch(e) {
    console.error("Unable to update features", e);
    return res.status(500).json({message: "Unable to update features"});
  }
  return res.status(200).json({message: "success"});
}