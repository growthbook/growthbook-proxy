import { handleRequest, Env } from "@growthbook/edge-cloudflare";
import { Hooks, OnBeforeResponseParams } from "@growthbook/edge-utils";

// TODO: Remove once you're able to implement the worker on all routes
const hooks: Hooks<Request, Response> = {
  onBeforeResponse: (params: OnBeforeResponseParams<Request, Response>) => {
    const injection = `
<script>
  const gbTrackingCalls = ${JSON.stringify(params?.growthbook?.getDeferredTrackingCalls?.() || [])};
  window.dataLayer = window.dataLayer || [];
  gbTrackingCalls.forEach((trackingData) => {
    window.dataLayer.push({
      event: "experiment_viewed",
      experiment_id: trackingData.experiment.key,
      variation_id: trackingData.result.key,
    });
  });
  
${params.redirectRequestUrl !== params.requestUrl
  ? `  window.history.replaceState(undefined, undefined, ${JSON.stringify(
    params.redirectRequestUrl,
  )});`
: ""}
</script>
    `;
    params.setBody(params.body + injection);
  }
}

export default {
  fetch: async function (request: Request, env: Env): Promise<Response> {
    // TODO: Remove once you're able to implement the worker on all routes
    env.DISABLE_INJECTIONS = "true";

    return await handleRequest(request, env, undefined, hooks);
  },
};
