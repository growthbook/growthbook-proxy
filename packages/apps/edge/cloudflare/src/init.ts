import { Context, defaultContext } from '@growthbook/edge-utils';
import {
	fetchFn,
	getCookieAttributes,
	getRequestHeader,
	getRequestMethod,
	getRequestURL,
	proxyRequest,
	sendResponse,
	setCookieAttributes,
	setResponseHeader,
} from './helpers';

export default (env: Env) => {
	// Build context from default + env
	const context: Context<Request, Response> = defaultContext;

	// config
	context.config.proxyTarget = env.PROXY_TARGET ?? 'http://localhost';
	context.config.environment = env.NODE_ENV ?? 'production';

	'MAX_PAYLOAD_SIZE' in env ? (context.config.maxPayloadSize = env.MAX_PAYLOAD_SIZE) : '2mb';
	'UUID_COOKIE_NAME' in process.env ? (context.config.uuidCookieName = process.env.UUID_COOKIE_NAME) : 'gbuuid';
	'SCRIPT_INJECTION_PATTERN' in process.env ? (context.config.scriptInjectionPattern = process.env.SCRIPT_INJECTION_PATTERN) : '</body>';

	// config.crypto
	context.config.crypto = crypto;

	// config.attributeKeys
	'ATTRIBUTE_UUID' in env && (context.config.attributeKeys.uuid = env.ATTRIBUTE_UUID);
	'ATTRIBUTE_BROWSER' in env && (context.config.attributeKeys.browser = env.ATTRIBUTE_BROWSER);
	//send response
	context.helpers.getRequestURL = getRequestURL;
	context.helpers.getRequestMethod = getRequestMethod;
	context.helpers.getRequestHeader = getRequestHeader;
	context.helpers.setResponseHeader = setResponseHeader;
	context.helpers.proxyRequest = proxyRequest;
	context.helpers.fetch = fetchFn;

	//send response
	context.helpers.sendResponse = sendResponse;

	return context;
};
