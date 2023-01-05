import express, { Request, Response } from "express";
import { registrar } from "../services/registrar";
import { adminMiddleware } from "../middleware/adminMiddleware";

const postEndpointsEntry = (req: Request, res: Response) => {
  const apiKey = req.body.apiKey;
  if (!apiKey) {
    return res.status(400).json({ message: "API key required" });
  }
  try {
    registrar.setEndpointsByApiKey(apiKey, req.body);
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: "API key required" });
  }
  return res.status(200).json({ message: "Success" });
};

const getEndpointsEntry = (req: Request, res: Response) => {
  const apiKey = req.params.apiKey;
  if (!apiKey) {
    return res.status(400).json({ message: "API key required" });
  }
  const data = registrar.getEndpointsByApiKey(apiKey);
  if (!data) {
    return res
      .status(404)
      .json({ message: "No endpoints found for that API key" });
  }
  return res.status(200).json(data);
};

const getAllEndpointsEntries = (req: Request, res: Response) => {
  const data = registrar.getAllEndpoints();
  return res.status(200).json(data);
};

const deleteEndpointsEntry = (req: Request, res: Response) => {
  const apiKey = req.params.apiKey;
  if (!apiKey) {
    return res.status(400).json({ message: "API key required" });
  }
  const status = registrar.deleteEndpointsByApiKey(apiKey);
  if (!status) {
    return res
      .status(404)
      .json({ message: "No endpoints found for that API key" });
  }
  // todo: cleanup cache, sse
  return res.status(200).json({ message: "Success" });
};

export const adminRouter = express.Router();

adminRouter.post(
  "/endpoint",
  adminMiddleware,
  express.json(),
  postEndpointsEntry
);

adminRouter.get("/endpoint/:apiKey", adminMiddleware, getEndpointsEntry);

adminRouter.get("/endpoints", adminMiddleware, getAllEndpointsEntries);

adminRouter.delete("/endpoint/:apiKey", adminMiddleware, deleteEndpointsEntry);
