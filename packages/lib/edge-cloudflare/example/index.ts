import { handleRequest, Env } from "@growthbook/edge-cloudflare";

export default {
  fetch: async function (
    request: Request,
    env: Env,
    _: ExecutionContext,
  ): Promise<Response> {
    const config = {
      edgeTrackingCallback: (experiment: Experiment<any>, results: Result<any>) => {
        console.log('tracking callback', {experiment, results});
      }
    }
    return await handleRequest(request, env, config);
  },
};
