import {NextFunction, Request, Response} from "express";
import {channelManager} from "../services/sse";

export default async (req: Request, res: Response, next: NextFunction) => {
  channelManager.subscribe(req, res);
}