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
	const context: Context = defaultContext;

	// config
	context.config.proxyTarget = env.PROXY_TARGET ?? 'http://localhost';
	context.config.environment = env.NODE_ENV ?? 'production';

	'MAX_PAYLOAD_SIZE' in env ? (context.config.maxPayloadSize = env.MAX_PAYLOAD_SIZE) : '2mb';
	'UUID_COOKIE_NAME' in process.env ? (context.config.uuidCookieName = process.env.UUID_COOKIE_NAME) : 'gbuuid';
	'SCRIPT_INJECTION_PATTERN' in process.env ? (context.config.scriptInjectionPattern = process.env.SCRIPT_INJECTION_PATTERN) : '</body>';
	context.config.crypto = crypto;
	// config.crypto
	context.config.crypto = crypto;

	// config.attributeKeys
	'ATTRIBUTE_UUID' in env && (context.config.attributeKeys.uuid = env.ATTRIBUTE_UUID);
	'ATTRIBUTE_BROWSER' in env && (context.config.attributeKeys.browser = env.ATTRIBUTE_BROWSER);
	'ATTRIBUTE_DEVICE_TYPE' in env && (context.config.attributeKeys.deviceType = env.ATTRIBUTE_DEVICE_TYPE);
	'ATTRIBUTE_URL' in env && (context.config.attributeKeys.url = env.ATTRIBUTE_URL);
	'ATTRIBUTE_PATH' in env && (context.config.attributeKeys.path = env.ATTRIBUTE_PATH);
	'ATTRIBUTE_HOST' in env && (context.config.attributeKeys.host = env.ATTRIBUTE_HOST);
	'ATTRIBUTE_QUERY' in env && (context.config.attributeKeys.query = env.ATTRIBUTE_QUERY);

	// config.helpers
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
