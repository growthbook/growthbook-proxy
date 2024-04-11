import { edgeApp } from "@growthbook/edge-utils";
import init from './init';
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// init a blank response
		const res = new Response();
		// init the context
		const context = init(env);
		return edgeApp(context, request, res);
	},
};
