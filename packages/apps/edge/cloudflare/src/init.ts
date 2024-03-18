import { Context, defaultContext } from '@growthbook/edge-utils';
import { getCookieAttributes, getRequestHeader, getRequestMethod, getRequestURL, setCookieAttributes, setResponseHeader } from './helpers';

export default async (env) => {
	// Build context from default + env
	const context: Context = defaultContext;

	// config
	context.proxyTarget = env.PROXY_TARGET ?? '/';
	context.environment = env.NODE_ENV ?? 'production';

	'MAX_PAYLOAD_SIZE' in env ? (context.config.maxPayloadSize = env.MAX_PAYLOAD_SIZE) : '2mb';
	'ATTRIBUTE_COOKIE_NAME' in env ? (context.config.attributeCookieName = env.ATTRIBUTE_COOKIE_NAME) : 'gb-user-attributes';

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
	// need to add something for context.helpers.proxyRequest = proxyRequest;
	context.helpers.getCookieAttributes = getCookieAttributes;
	context.helpers.setCookieAttributes = setCookieAttributes;
	function getPort() {
		if (env.PORT) {
			const port = parseInt(env.PORT);
			if (!isNaN(port) && port > 0) {
				return port;
			}
		}
		return 3301;
	}
	context.proxy_port = getPort();
};
