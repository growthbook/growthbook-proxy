/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";
import { KVStore } from "fastly:kv-store";
import { gbHandleRequest, getConfigEnvFromStore } from "@growthbook/edge-fastly";
addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
async function handleRequest(event) {
    const envVarsStore = new ConfigStore("env_vars");
    const env = getConfigEnvFromStore(envVarsStore);
    const config = {
        apiHostBackend: "api_host",
        backends: { "https://www.growthbook.io": "growthbook" },
        // typically only need to choose one or the other:
        gbCacheStore: new KVStore("gb_cache"),
        gbPayloadStore: new KVStore("gb_payload"),
    };
    return await gbHandleRequest(event.request, env, config);
}
