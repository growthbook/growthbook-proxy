import init from "./init";
import { growthBookProxy } from "./app";

(async () => {
  const { app, context } = await init();
  await growthBookProxy(app, context);
})();
