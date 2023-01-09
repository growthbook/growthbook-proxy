import { NextFunction, Request, Response } from "express";
import { createProxyMiddleware, RequestHandler } from "http-proxy-middleware";
import { registrar } from "../services/registrar";

const scopedMiddlewares: Record<string, RequestHandler> = {};

export default (req: Request, res: Response, next: NextFunction) => {
  if (!registrar?.apiHost) {
    return res.status(401).json({ message: "Missing API host" });
  }
  if (!scopedMiddlewares[registrar.apiHost]) {
    scopedMiddlewares[registrar.apiHost] = createProxyMiddleware({
      target: registrar.apiHost,
      changeOrigin: true,
    });
  }
  return scopedMiddlewares[registrar.apiHost](req, res, next);
};
