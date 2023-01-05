import { NextFunction, Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registrar } from "../services/registrar";

export default (req: Request, res: Response, next: NextFunction) => {
  if (!registrar?.apiHost) {
    return res.status(401).json({ message: "Missing API host" });
  }
  return createProxyMiddleware({
    target: registrar.apiHost,
    changeOrigin: true,
  })(req, res, next);
};
