/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";
import { KVStore } from "fastly:kv-store";
import { FastlyConfig, gbHandleRequest, getConfigEnvFromStore } from "@growthbook/edge-fastly";
import {
  Hooks,
  OnBeforeResponseParams,
  OnRouteParams
} from "@growthbook/edge-utils";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event: FetchEvent) {
  const envVarsStore = new ConfigStore("env_vars");
  const env = getConfigEnvFromStore(envVarsStore);

  const config: Partial<FastlyConfig> = {
    apiHostBackend: "api_host",
    backends: { "https://www.growthbook.io": "growthbook" },
    // typically only need to choose one or the other:
    gbCacheStore: new KVStore("gb_cache"),
    // gbPayloadStore: new KVStore("gb_payload"),
  };

  const hooks: Hooks<Request, Response> = {
    onRoute: (params: OnRouteParams<Request, Response>) => {
      console.log("will route", params.route);
    },
    onBeforeResponse: (params: OnBeforeResponseParams<Request, Response>) => {
      console.log("will send...")
      params.setBody(params.body + `<script>console.log("manually injected content")</script>`)
    }
  }

  return await gbHandleRequest(event.request, env, config, undefined, hooks);
}
