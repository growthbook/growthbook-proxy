import { Context, Context, Context, Context } from '@growthbook/edge-utils';
import { Attributes } from '@growthbook/growthbook';
import { parse } from 'cookie';

export function getRequestURL(req: Request) {
	return req.url;
}

export function getRequestMethod(req: Request) {
	return req.method.toUpperCase();
}

export function getRequestHeader(req: Request, key: string) {
	return req.headers.get(key) || undefined;
}

export function setResponseHeader(res: Response, key: string, value: string) {
	res.headers.set(key, value);
}

export function sendResponse(res: Response, body: string, status: number = 200) {
	return new Response(body, { ...res, status });
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
export function fetchFn(_: Context, url: string) {
	return fetch(url);
}

export function proxyRequest(ctx: Context, req: Request, res: Response) {
	return fetch(ctx.config.proxyTarget + req.url, {
		method: req.method,
		headers: req.headers,
		body: req.body,
	});

}

export function getUUIDCookie(ctx: Context, req: Request): string {
	const cookieName = ctx.config.uuidCookieName || "gbuuid";
	const cookie = req.headers.get(cookieName);
	return cookie || "";
}
