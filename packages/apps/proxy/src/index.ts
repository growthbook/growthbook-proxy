import { hello } from "@growthbook/proxy-eval";
import init from "./init";
import { GrowthBookProxy, growthBookProxy } from "./app";

// Sample implementation for the GrowthBookProxy
(async () => {
  hello();
  const { app, server, context } = await init();

  // creating and starting the proxy is a one-liner
  const proxy = await growthBookProxy(app, context);

  process.on("SIGTERM", () => {
    console.info("SIGTERM signal received: closing HTTP server");
    onClose(server, proxy);
  });
  process.on("SIGINT", () => {
    console.info("SIGINT signal received: closing HTTP server");
    onClose(server, proxy);
  });
})();

/* eslint-disable @typescript-eslint/no-explicit-any */
function onClose(server: any, proxy: GrowthBookProxy) {
  proxy.services.eventStreamManager?.closeAll();
  server.close(() => {
    console.info("HTTP server closed");
    process.exit(0);
  });
}
