import cookieParser from "cookie-parser";
import { edgeApp } from "@growthbook/edge-utils";
import init from "./init";
import { initializeLogger } from "./logger";

(async () => {
  const { app, server, context } = await init();
  initializeLogger(context);

  app.use(cookieParser());

  app.all("/*", (req, res, next) => edgeApp(context, req, res, next));

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
