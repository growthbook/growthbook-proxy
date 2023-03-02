import express, { Request, Response } from "express";
import { eventStreamManager } from "../services/eventStreamManager";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";
import { validateEventStreamChannelMiddleware } from "../middleware/eventStream/validateEventStreamChannelMiddleware";

const getSubscribeToEventStream = async (req: Request, res: Response) => {
  if (eventStreamManager) {
    eventStreamManager.subscribe(req, res);
  }
};

export const eventStreamRouter = express.Router();
eventStreamRouter.use(apiKeyMiddleware);

// subscribe clients to streaming updates
eventStreamRouter.get(
  "/:apiKey",
  validateEventStreamChannelMiddleware,
  getSubscribeToEventStream
);
