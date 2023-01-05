import express, { Request, Response } from "express";
import { registrar } from "../services/registrar";
import { adminMiddleware } from "../middleware/adminMiddleware";

const postConnection = (req: Request, res: Response) => {
  const apiKey = req.body.apiKey;
  if (!apiKey) {
    return res.status(400).json({ message: "API key required" });
  }
  try {
    registrar.setConnectionByApiKey(apiKey, req.body);
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: "API key required" });
  }
  return res.status(200).json({ message: "Success" });
};

const getConnection = (req: Request, res: Response) => {
  const apiKey = req.params.apiKey;
  if (!apiKey) {
    return res.status(400).json({ message: "API key required" });
  }
  const data = registrar.getConnectionByApiKey(apiKey);
  if (!data) {
    return res
      .status(404)
      .json({ message: "No connection found for that API key" });
  }
  return res.status(200).json(data);
};

const getAllConnections = (req: Request, res: Response) => {
  const data = registrar.getAllConnections();
  return res.status(200).json(data);
};

const deleteConnection = (req: Request, res: Response) => {
  const apiKey = req.params.apiKey;
  if (!apiKey) {
    return res.status(400).json({ message: "API key required" });
  }
  const status = registrar.deleteConnectionByApiKey(apiKey);
  if (!status) {
    return res
      .status(404)
      .json({ message: "No connection found for that API key" });
  }
  // todo: cleanup cache, sse
  return res.status(200).json({ message: "Success" });
};

export const adminRouter = express.Router();

adminRouter.post(
  "/connection",
  adminMiddleware,
  express.json(),
  postConnection
);

adminRouter.get("/connection/:apiKey", adminMiddleware, getConnection);

adminRouter.get("/connections", adminMiddleware, getAllConnections);

adminRouter.delete("/connection/:apiKey", adminMiddleware, deleteConnection);
