import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { registrar } from "../services/registrar";

export default (req: Request, res: Response, next: NextFunction) => {
  const connection = registrar.getConnectionByApiKey(res.locals.apiKey);
  if (!connection?.signingKey) {
    return res.status(400).json({ message: "Missing signing key" });
  }
  const sig = req.get("X-GrowthBook-Signature") || "";

  const computed = crypto
    .createHmac("sha256", connection?.signingKey || "")
    .update(res.locals.rawBody || new Buffer(""))
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig))) {
    return res.status(401).json({ message: "Signatures do not match!" });
  }
  next();
};
