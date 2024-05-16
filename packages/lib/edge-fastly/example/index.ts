/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";
import { gbHandleRequest, FastlyConfig, getConfigEnvFromStore } from "packages/lib/edge-fastly/dist";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event: FetchEvent) {
  const envVarsStore = new ConfigStore("env_vars");
  const gbEnv = getConfigEnvFromStore(envVarsStore);
  const config: Partial<FastlyConfig> = {
    backends: { "https://www.growthbook.io": "growthbook" }
  }
  const res = await gbHandleRequest(event, gbEnv, config);
  console.log(res)
  return res;
}
