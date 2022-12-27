import {NextFunction, Request, Response} from "express";
import crypto from "crypto";
import {registrar} from "../services/registrar";

export default (req: Request, res: Response, next: NextFunction) => {
  const webhook = registrar.getWebhook(res.locals.apiKey);
  const sig = req.get("X-GrowthBook-Signature") || "";

  const computed = crypto
    .createHmac("sha256", webhook?.secret || "")
    .update(res.locals.rawBody || new Buffer(""))
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig))) {
    return res.status(401).json({message: "Signatures do not match!"});
  }
  next();
}