import { NextFunction, Request, Response } from "express";

export const sseSupportMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.setHeader("x-sse-support", "enabled");
  res.setHeader("Access-Control-Expose-Headers", "x-sse-support");
  next();
};
