import { Request, Response, NextFunction } from "express";

export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (
    req.app.locals?.ctx?.adminKey &&
    req.headers["x-admin-key"] === req.app.locals.ctx.adminKey
  ) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
