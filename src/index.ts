import init from "./init";
import { growthBookProxy } from "./app";

(async () => {
  const { app, context } = await init();
  const proxy = await growthBookProxy(app, context);
})();
