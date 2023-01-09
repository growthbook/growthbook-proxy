import { NextFunction, Request, Response } from "express";
import { registrar } from "../../services/registrar";

export const validateEventStreamChannelMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.app.locals?.ctx?.enableEventStream) {
    const apiKey = res.locals.apiKey;
    const validApiKeys = Object.keys(registrar.getAllConnections());
    if (!validApiKeys.includes(apiKey)) {
      return res.status(400).json({ message: "No channel found" });
    }
  }
  next();
};
