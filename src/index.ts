import init from "./init";
import { growthBookProxy } from "./app";
import { eventStreamManager } from "./services/eventStreamManager";

// Sample implementation for the GrowthBookProxy
(async () => {
  const { app, context } = await init();

  // creating and starting the proxy is a one-liner
  const proxy = await growthBookProxy(app, context);

  // example: use the public interface to do something trivial:
  setInterval(() => {
    console.log("SDK connections count:", Object.keys(proxy.services.registrar.getAllConnections()).length);
    console.log("EventSource subscriber counts:", eventStreamManager.getSubscriberCounts(), "\n");
  }, 5000);
})();
