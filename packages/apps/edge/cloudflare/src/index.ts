import { edgeApp } from '@growthbook/edge-utils';
import init, { Env } from './init';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const context = init(env);
		return await edgeApp<Request, Response>(context, request) as Response;
	},
};
