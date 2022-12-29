import {NextFunction, Request, Response} from "express";
import {channelManager} from "../services/sse";

export const getSubscribeToSse = async (req: Request, res: Response, next: NextFunction) => {
  channelManager.subscribe(req, res);
}