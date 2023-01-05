import express, { Request, Response } from "express";
import { eventStreamManager } from "../services/eventStreamManager";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";

const getSubscribeToEventStream = async (req: Request, res: Response) => {
  eventStreamManager.subscribe(req, res);
};

export const eventStreamRouter = express.Router();
eventStreamRouter.use(apiKeyMiddleware);

// subscribe clients to streaming updates
eventStreamRouter.get("/:apiKey", getSubscribeToEventStream);
