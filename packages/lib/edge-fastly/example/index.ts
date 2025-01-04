/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";
import { KVStore } from "fastly:kv-store";
import { FastlyConfig, gbHandleRequest, getConfigEnvFromStore } from "@growthbook/edge-fastly";
import {
  BaseHookParams,
  Hooks,
  OnBeforeResponseParams, OnBodyReadyParams,
  OnOriginFetchParams,
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
    onOriginFetch: async(params: OnOriginFetchParams<Request, Response>) => {
      const resp = params.originResponse;
      console.log("fetched...", {requestUrl: params.requestUrl, originUrl: params.originUrl})
    },
    onBodyReady: (params: OnBodyReadyParams<Request, Response>) => {
      console.log("body ready", params.body, { OH: params.originHeaders, RH: params.resHeaders });
    },
    onBeforeResponse: (params: OnBeforeResponseParams<Request, Response>) => {
      console.log("will send...")
      params.setBody(params.body + `<script>console.log("WHOA BABY")</script>`)
    }
  }

  return await gbHandleRequest(event.request, env, config, undefined, hooks);
}
