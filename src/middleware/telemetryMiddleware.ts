import {NextFunction, Request, Response} from "express";

export default async (req: Request, res: Response, next: NextFunction) => {
  console.log(`sending stats from ${req.originalUrl} somewhere...`);
  setTimeout(() => {
    console.log('stats sent')
  }, 2000);
  next();
};