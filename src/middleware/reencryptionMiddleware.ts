import { NextFunction, Request, Response } from "express";
import { registrar } from "../services/registrar";
import { encrypt } from "../services/encryption";

export const reencryptionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const connection = registrar.getConnectionByApiKey(res.locals.apiKey);

  // If using an encrypted SDK endpoint AND the features webhook is unencrypted, we need to re-encrypt it.
  // Otherwise, we would mess up the format for (a) cached features and (b) SSE events
  if (connection?.encryptionKey && !("encryptedFeatures" in req.body)) {
    req.body.encryptedFeatures = await encrypt(
      JSON.stringify(req.body.features),
      connection.encryptionKey
    );
    req.body.features = {};
  }
  next();
};
