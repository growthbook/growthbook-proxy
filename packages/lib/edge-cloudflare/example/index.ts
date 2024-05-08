import { handleRequest, Env } from "@growthbook/edge-cloudflare";

export default {
  fetch: async function (
    request: Request,
    env: Env,
    _: ExecutionContext,
  ): Promise<Response> {
    return await handleRequest(request, env);
  },
};
