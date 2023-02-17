import express, { Request, Response } from "express";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";
import { featuresCache } from "../services/cache";
import { evaluateFeature, sdk } from "../services/featureEvaluation";
import refreshStaleCacheMiddleware from "../middleware/cache/refreshStaleCacheMiddleware";
import { registrar } from "../services/registrar";
import logger from "../services/logger";

const getFeatureEvaluation = async (req: Request, res: Response) => {
  if (!featuresCache) {
    return res.status(400).json({ message: "Missing features cache" });
  }
  if (!sdk) {
    return res.status(400).json({ message: "Missing SDK" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resp = (await featuresCache.get(res.locals.apiKey)) as any;
  console.log("features?", resp);

  if (!resp?.payload) {
    await refreshStaleCacheMiddleware({
      proxyTarget: registrar.growthbookApiHost,
      overrideOriginalUrl: `/api/features/${res.locals.apiKey}`,
    })(req, res).catch((e) => {
      logger.error(e, "Unable to refresh stale cache");
    });

    resp = await featuresCache.get(res.locals.apiKey);
    console.log("refreshed features?", resp);
  }

  if (!resp?.payload) {
    return res.status(400).json({ message: "Missing features" });
  }

  let features = resp.payload.features ?? {};
  if (resp.payload.encryptedFeatures) {
    const connection = registrar.getConnection(res.locals.apiKey);
    if (connection?.useEncryption && connection?.encryptionKey) {
      features = decrypt(resp.payload.encryptedFeatures);
    }
  }

  features = resp?.payload;
  const result = evaluateFeature(features, req.query.feature as string);
  console.log("result?", result);

  return res.status(200).json({
    data: result,
    message: "Success",
  });
};

export const featureEvaluationRouter = express.Router();

featureEvaluationRouter.get("/", apiKeyMiddleware, getFeatureEvaluation);
