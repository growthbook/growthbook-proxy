import { GrowthBook, Context as GBContext, setPolyfills, helpers } from '@growthbook/growthbook';
import { evaluateFeatures } from '@growthbook/proxy-eval';
import { localStoragePolyfill } from './helpers';
export default {
	async fetch(request: any, env: any, ctx: any) {
		// handle the preflight check
		if (request.method === 'OPTIONS') {
			console.log('preflight');
			return handleOptions(request);
		}
		const localStorage = localStoragePolyfill(env);
		setPolyfills({ localStorage });

		const clientKey = getClientKey(request);

		helpers.fetchFeaturesCall = ({ host, clientKey, headers }) => {
			const headersWithAuth: Record<string, any> = { headers: { ...headers, Authorization: `Bearer ${env.SECRET_API_KEY}` } };
			return fetch(`${host}/api/v1/sdk-payload/${clientKey}`, headersWithAuth);
		};

		//get context data
		const attributes: Record<string, any> = request.body?.attributes || {};
		const forcedVariations: Record<string, number> = request.body?.forcedVariations || {};
		const forcedFeatures: Map<string, any> = new Map(request.body?.forcedFeatures || []);
		const url = request.body?.url;
		//set context
		const context: GBContext = { apiHost: env.API_HOST, clientKey };
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
			ctx,
		});
		console.log(evaluatedFeatures);
		const response = new Response(JSON.stringify(evaluatedFeatures), {
			headers: {
				...corsHeaders,
				'content-type': 'application/json;charset=UTF-8',
			},
		});
		return response;
	},
};

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

const handleOptions = (request) => {
	if (
		request.headers.get('Origin') !== null &&
		request.headers.get('Access-Control-Request-Method') !== null &&
		request.headers.get('Access-Control-Request-Headers') !== null
	) {
		return new Response(null, {
			headers: corsHeaders,
		});
	} else {
		return new Response(null, {
			headers: {
				Allow: 'GET, HEAD, POST, OPTIONS',
			},
		});
	}
};
const getClientKey = (request) => {
	const RE_CLIENT_KEY = /(?:api|sub|eval)\/.*?\/?([^/?]*)\/?(?:\?.*)?$/;
	const originalUrl = request.url as string;
	return request.headers?.['x-growthbook-api-key'] || originalUrl.match(RE_CLIENT_KEY)?.[1];
};
