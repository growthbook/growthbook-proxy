import { NextFunction, Request, Response } from "express";
import { createProxyMiddleware, RequestHandler } from "http-proxy-middleware";
import { registrar } from "../services/registrar";

const scopedMiddlewares: Record<string, RequestHandler> = {};

export default (req: Request, res: Response, next: NextFunction) => {
  if (!registrar?.growthbookApiHost) {
    return res.status(401).json({ message: "Missing API host" });
  }
  if (!scopedMiddlewares[registrar.growthbookApiHost]) {
    scopedMiddlewares[registrar.growthbookApiHost] = createProxyMiddleware({
      target: registrar.growthbookApiHost,
      changeOrigin: true,
      followRedirects: true,
      ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
        ? { secure: false }
        : {}),
    });
  }
  return scopedMiddlewares[registrar.growthbookApiHost](req, res, next);
};
