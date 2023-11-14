/// <reference types="@fastly/js-compute" />
import { env } from "fastly:env";
import {
  GrowthBook,
  Context as GBContext,
  setPolyfills,
  helpers,
} from "@growthbook/growthbook";
import { evaluateFeatures } from "@growthbook/proxy-eval";
import { KVStore } from "fastly:kv-store";
import { SecretStore } from "fastly:secret-store";
import { allowDynamicBackends } from "fastly:experimental";
import { ConfigStore } from "fastly:config-store";
import { getClientKey, handleOptions, localStoragePolyfill } from "./helpers";
allowDynamicBackends(true);

const KV_STORE_KEY_NAME = "gb_remote_eval_features_store";
const KV_SECRET_STORE_NAME = "GB_REMOTE_EVAL_SECRET_STORE";
const SECRET_API_KEY_NAME = "SECRET_API_KEY";
const API_HOST_NAME = "API_HOST";
addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
allowDynamicBackends(true);
async function handleRequest(event: any) {
  const request = await event.request;

  const configStore = new ConfigStore(KV_SECRET_STORE_NAME);
  const API_KEY = configStore.get(SECRET_API_KEY_NAME);
  const API_HOST = configStore.get(API_HOST_NAME);
  if (!API_KEY || !API_HOST)
    throw Error("missing config data API_KEY or API_HOST");

  // handle the preflight check
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }
  // has to be after Preflight this got me for a good 10 mins lol
  const body = await request.json();

  const store = new KVStore(KV_STORE_KEY_NAME);
  const localStorage = localStoragePolyfill(store);
  setPolyfills({ localStorage });

  const clientKey = getClientKey(request);

  helpers.fetchFeaturesCall = ({ host, clientKey, headers }) => {
    const headersWithAuth: Record<string, any> = {
      headers: { ...headers, Authorization: `Bearer ${API_KEY}` },
    };
    return fetch(`${host}/api/v1/sdk-payload/${clientKey}`, headersWithAuth);
  };

  //get context data
  const attributes: Record<string, any> = body?.attributes || {};
  const forcedVariations: Record<string, number> = body?.forcedVariations || {};
  const forcedFeatures: Map<string, any> = new Map(body?.forcedFeatures || []);
  const url = body?.url;
  //set context
  const context: GBContext = { apiHost: API_HOST, clientKey };
  if (forcedVariations) {
    context.forcedVariations = forcedVariations;
  }
  if (url !== undefined) {
    context.url = url;
  }
  //Load SDK
  const gb = new GrowthBook(context);
  if (forcedFeatures) {
    gb.setForcedFeatures(forcedFeatures);
  }
  await gb.loadFeatures();
  const features = gb.getFeatures();
  const experiments = gb.getExperiments();
  const payload = { features, experiments };
  const evaluatedFeatures = evaluateFeatures({
    payload,
    attributes,
    forcedVariations,
    forcedFeatures,
    url,
  });
  console.log(evaluatedFeatures);
  const response = new Response(JSON.stringify(evaluatedFeatures), {
    headers: {
      ...corsHeaders,
      "content-type": "application/json;charset=UTF-8",
    },
  });
  return response;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};


