import { Request, Response, NextFunction } from "express";

export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // todo: lock these endpoints down using a secret (and possibly a limited IP range?)
  next();
};
