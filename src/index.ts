import init from "./init";
import { growthBookProxy } from "./app";

// Sample implementation for the GrowthBookProxy
(async () => {
  const { app, server, context } = await init();

  // creating and starting the proxy is a one-liner
  await growthBookProxy(app, context);

  process.on("SIGTERM", () => {
    console.info("SIGTERM signal received: closing HTTP server");
    // Todo: perform any cleanup
    server.close(() => {
      console.info("HTTP server closed");
      process.exit(0);
    });
  });
})();
