import init from "./init";
import { initializeLogger } from "./logger";

(async () => {
  const { app, server, context } = await init();
  initializeLogger(context);

  console.log('running...', context)

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
