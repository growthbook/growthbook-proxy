/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";
import { FastlyConfig, gbHandleRequest, getConfigEnvFromStore } from "@growthbook/edge-fastly";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event: FetchEvent) {
  const request = event.request;

  const envVarsStore = new ConfigStore("env_vars");

  // typically only need to choose one or the other:
  const gbCacheStore = new ConfigStore("gb_cache");
  const gbPayloadStore = new ConfigStore("gb_payload");

  const gbEnv = getConfigEnvFromStore(envVarsStore);

  const config: Partial<FastlyConfig> = {
    backends: { "https://www.growthbook.io": "growthbook" },
    gbCacheStore,
    gbPayloadStore,
  };
  return await gbHandleRequest(request, gbEnv, config);
}
