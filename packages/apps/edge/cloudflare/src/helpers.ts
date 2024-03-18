import { Context } from '@growthbook/edge-utils';
import { Attributes } from '@growthbook/growthbook';
import { parse } from 'cookie';

export function getRequestURL(url: URL) {
	return url.protocol + '://' + url.host + url.pathname;
}

export function getRequestMethod(req: Request) {
	return req.method.toUpperCase();
}

export function getRequestHeader(req: Request, key: string) {
	return req.headers.get(key);
}

export function setResponseHeader(res: Response, key: string, value: string) {
	res.headers.set(key, value);
}

export function getCookieAttributes(ctx: Context, req: Request): Attributes {
	const cookieName = ctx.config.attributeCookieName || 'gb-user-attributes';
	const cookies = parse(req.headers.get('Cookie') || '');
	const cookie = cookies[cookieName];
	if (!cookie) return {};
	try {
		return JSON.parse(cookie);
	} catch (e) {
		// ignore
	}
	return {};
}

export function setCookieAttributes(ctx: Context, res: Response, attributes: Attributes) {
	const cookieName = ctx.config.attributeCookieName || 'gb-user-attributes';
	res.headers.set(
		encodeURIComponent(cookieName),
		`${JSON.stringify(attributes)};
     maxAge=${365 * 24 * 60 * 60 * 1000};
      httpOnly: true;`,
	);
}
