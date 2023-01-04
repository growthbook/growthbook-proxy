import express, { Request, Response } from "express";
import { eventStreamManager } from "../services/sse";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";

const getSubscribeToSse = async (req: Request, res: Response) => {
  eventStreamManager.subscribe(req, res);
};

export const streamEventsRouter = express.Router();
streamEventsRouter.use(apiKeyMiddleware);

// subscribe clients to streaming updates
streamEventsRouter.get("/:apiKey", getSubscribeToSse);
