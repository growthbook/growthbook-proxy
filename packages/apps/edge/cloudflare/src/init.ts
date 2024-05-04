import {
	Context,
	defaultContext,
	ExperimentRunEnvironment,
	Helpers,
} from '@growthbook/edge-utils';
import {
	getRequestURL,
	getRequestMethod,
	getRequestHeader,
	sendResponse,
	fetchFn,
	proxyRequest,
	getCookie,
	setCookie,
} from './helpers';
import type { Request, Response } from "express";

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


	// config.helpers
	context.helpers.getRequestURL = getRequestURL;
	context.helpers.getRequestMethod = getRequestMethod;
	context.helpers.getRequestHeader = getRequestHeader;
	context.helpers.sendResponse = sendResponse;
	context.helpers.fetch = fetchFn;
	context.helpers.proxyRequest = proxyRequest as Helpers<
		Request,
		Response
	>["proxyRequest"];
	context.helpers.getCookie = getCookie;
	context.helpers.setCookie = setCookie;

	return context;
};
