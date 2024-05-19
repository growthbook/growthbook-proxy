/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";
import { KVStore } from "fastly:kv-store";
import { FastlyConfig, gbHandleRequest, getConfigEnvFromStore } from "@growthbook/edge-fastly";
import { allowDynamicBackends } from "fastly:experimental";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event: FetchEvent) {
  const request = event.request;

  const envVarsStore = new ConfigStore("env_vars");
  const env = getConfigEnvFromStore(envVarsStore);

  allowDynamicBackends(true);
  const config: Partial<FastlyConfig> = {
    // apiHostBackend: "api_host",
    // backends: { "https://www.growthbook.io": "growthbook" },
    // typically only need to choose one or the other:
    // gbCacheStore: new KVStore("gb_cache"),
    // gbPayloadStore: new KVStore("gb_payload"),
  };

  try {
    return await gbHandleRequest(request, env, config);
  } catch (e) {
    console.error("error");
    console.error(e);
  }
  return new Response("fail");
}
