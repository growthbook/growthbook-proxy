import init from "./init";
import { growthBookProxy } from "./app";

// Sample implementation for the GrowthBookProxy
(async () => {
  const { app, context } = await init();

  // creating and starting the proxy is a one-liner
  const proxy = await growthBookProxy(app, context);

  // example: use the public interface to do something trivial:
  setTimeout(() => {
    console.log(proxy.services.registrar.getAllConnections());
  }, 5000);
  // setInterval(() => {
  //   console.log('EventStream count:', eventStreamManager.getSubscriberCounts());
  // }, 5000);
})();
