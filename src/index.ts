import init from "./init";
import { growthBookProxy } from "./app";

// Sample implementation for the GrowthBookProxy
(async () => {
  const { app, context } = await init();

  // creating and starting the proxy is a one-liner
  await growthBookProxy(app, context);
})();
