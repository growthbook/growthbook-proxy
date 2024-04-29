import cookieParser from "cookie-parser";
import cors from "cors";
import { Request, Response } from "express";
import { edgeApp } from "@growthbook/edge-utils";
import init from "./init";
import { initializeLogger } from "./logger";

(async () => {
  const { app, server, context } = await init();
  initializeLogger<Request, Response>(context);

  app.use(cors());
  app.use(cookieParser());

  app.all("/*", (req, res, next) =>
    edgeApp<Request, Response>(
      context,
      req as unknown as Request,
      res as unknown as Response,
      next as any,
    ),
  );

  process.on("SIGTERM", () => {
    console.info("SIGTERM signal received: closing HTTP server");
    onClose(server);
  });
  process.on("SIGINT", () => {
    console.info("SIGINT signal received: closing HTTP server");
    onClose(server);
  });
})();

/* eslint-disable @typescript-eslint/no-explicit-any */
function onClose(server: any) {
  server.close(() => {
    console.info("HTTP server closed");
    process.exit(0);
  });
}
