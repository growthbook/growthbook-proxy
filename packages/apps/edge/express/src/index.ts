import init from "./init";
import { initializeLogger } from "./logger";
import cookieParser from "cookie-parser";
import { getUserAttributes } from "@growthbook/edge-utils";

(async () => {
  const { app, server, context } = await init();
  initializeLogger(context);

  app.use(cookieParser());
  app.all("/*", (req, res) => {
    const attributes = getUserAttributes(context, req);
    context.helpers.setCookieAttributes?.(context, res, attributes);
    console.info("Request", { url: req.url, attributes });
    res.send("Hello World");
  });

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
