import { Context, ConfigEnv, defaultContext, Helpers, getConfig } from '@growthbook/edge-utils';
import { getRequestURL, getRequestMethod, getRequestHeader, sendResponse, fetchFn, proxyRequest, getCookie, setCookie } from './helpers';

export interface Env extends ConfigEnv {
	KV_CACHE_NAMESPACE?: KVNamespace;
}

export default (env: Env) => {
	const context = defaultContext as Context<Request, Response>;
	context.config = getConfig(env);

	if (env.KV_CACHE_NAMESPACE) {
		const KV = env.KV_CACHE_NAMESPACE;
		context.config.localStorage = {
			getItem: async (key: string) => await KV.get(key),
			setItem: async (key: string, value: string) => await KV.put(key, value),
		};
	}

	// config.helpers
	context.helpers.getRequestURL = getRequestURL;
	context.helpers.getRequestMethod = getRequestMethod;
	context.helpers.getRequestHeader = getRequestHeader;
	context.helpers.sendResponse = sendResponse;
	context.helpers.fetch = fetchFn;
	context.helpers.proxyRequest = proxyRequest as Helpers<Request, Response>['proxyRequest'];
	context.helpers.getCookie = getCookie;
	context.helpers.setCookie = setCookie;

	return context;
};
