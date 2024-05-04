import { edgeApp } from '@growthbook/edge-utils';
import init from './init';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// init the context
		const context = init(env);
		return edgeApp<Request, Response>(context, request);
	},
};
