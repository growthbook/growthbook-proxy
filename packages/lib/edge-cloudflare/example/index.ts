import { handleRequest, Env } from "@growthbook/edge-cloudflare";
import {
  Hooks,
  OnBeforeOriginFetchParams,
  OnBeforeResponseParams,
  OnOriginFetchParams,
  OnRouteParams
} from "@growthbook/edge-utils";

const hooks: Hooks<Request, Response> = {
  onRoute: (params: OnRouteParams<Request, Response>) => {
    console.log("will route", params.route);
  },
  onBeforeOriginFetch: (params: OnBeforeOriginFetchParams<Request, Response >) => {
    console.log("before origin fetch", params.redirectRequestUrl)
  },
  onOriginFetch: (params: OnOriginFetchParams<Request, Response>) => {
    console.log("origin fetch", params.originStatus)
  },
  onBeforeResponse: (params: OnBeforeResponseParams<Request, Response>) => {
    console.log("will send...")
    params.setBody(params.body + `<script>console.log("manually injected content")</script>`)
  }
}

export default {
  fetch: async function (
    request: Request,
    env: Env,
    _: ExecutionContext,
  ): Promise<Response> {
    return await handleRequest(request, env, undefined, hooks);
  },
};
