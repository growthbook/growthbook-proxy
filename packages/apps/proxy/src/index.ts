import init from "./init";
import { GrowthBookProxy, growthBookProxy } from "./app";
import logger from "./services/logger";
import { startDraining } from "./controllers/healthController";

// Sample implementation for the GrowthBookProxy
(async () => {
  const { app, server, context } = await init();

  // creating and starting the proxy is a one-liner
  const proxy = await growthBookProxy(app, context);

  // pm2 forwards `docker stop` as SIGINT by default, so both signals drain.
  process.on("SIGTERM", () => {
    console.info("SIGTERM signal received: closing HTTP server");
    onClose(server, proxy, context.shutdownDelayMs);
  });
  process.on("SIGINT", () => {
    console.info("SIGINT signal received: closing HTTP server");
    onClose(server, proxy, context.shutdownDelayMs);
  });
  // A rejected promise with no .catch() (e.g. a transient Mongo/Redis error in
  // a timer callback) crashes the whole process on modern Node unless handled
  // here — log it and keep serving instead of taking the instance down.
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception: closing HTTP server");
    onClose(server, proxy);
  });
})().catch((err) => {
  // startup failure; the process guards above are not registered yet
  console.error("Fatal error during startup", err);
  process.exit(1);
});

let closing = false;
/* eslint-disable @typescript-eslint/no-explicit-any */
function onClose(server: any, proxy: GrowthBookProxy, delayMs = 0) {
  if (closing) return;
  closing = true;
  startDraining();
  if (delayMs > 0) {
    console.info(`Draining: /healthcheck returns 503 for ${delayMs}ms`);
  }
  // Keep serving while load balancers notice the 503 and stop routing traffic here.
  setTimeout(() => {
    proxy.services.eventStreamManager?.closeAll();
    proxy.services.cacheRefreshScheduler?.stop();
    server.close(() => {
      console.info("HTTP server closed");
      process.exit(0);
    });
    server.closeIdleConnections();
  }, delayMs);
}
