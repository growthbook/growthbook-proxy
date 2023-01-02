import { NextFunction, Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registrar } from "../services/registrar";

export default (req: Request, res: Response, next: NextFunction) => {
  const endpoints = registrar.getEndpointsByApiKey(res.locals.apiKey);
  if (!endpoints?.sdkBaseUrl) {
    return res.status(401).json({ message: "Missing SDK endpoint" });
  }

  return createProxyMiddleware({
    target: endpoints.sdkBaseUrl,
    changeOrigin: true,
  })(req, res, next);
};
