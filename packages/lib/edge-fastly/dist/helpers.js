import { getOriginUrl } from "@growthbook/edge-utils";
import { parse } from "cookie";
export function getRequestURL(req) {
    return req.url;
}
export function getRequestMethod(req) {
    return req.method.toUpperCase();
}
export function getRequestHeader(req, key) {
    return req.headers.get(key) || undefined;
}
export function sendResponse(ctx, _, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
headers, body, cookies, status) {
    const resp = new Response(body, { headers, status });
    if (cookies) {
        for (const key in cookies) {
            ctx.helpers.setCookie?.(resp, key, cookies[key]);
        }
    }
    return resp;
}
export async function fetchFn(ctx, url) {
    const maxRedirects = 5;
    const backend = getBackend(ctx, url);
    const init = { backend };
    // @ts-ignore
    let response = await fetch(url, init);
    let location = response.headers.get('location');
    let redirectCount = 0;
    while (response.status >= 300 && response.status < 400 && location && redirectCount < maxRedirects) {
        if (location) {
            const backend = getBackend(ctx, url);
            const init = { backend };
            // @ts-ignore
            response = await fetch(location, init);
            location = response.headers.get('location');
            redirectCount++;
        }
    }
    return response;
}
export function proxyRequest(ctx, req) {
    const originUrl = getOriginUrl(ctx, req.url);
    const backend = getBackend(ctx, originUrl);
    return fetch(originUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        // @ts-ignore
        backend: backend,
    });
}
export function getCookie(req, key) {
    const cookies = parse(req.headers.get("Cookie") || "");
    return cookies[key] || "";
}
export function setCookie(res, key, value) {
    const COOKIE_DAYS = 400; // 400 days is the max cookie duration for chrome
    const escapedKey = encodeURIComponent(key);
    const escapedValue = encodeURIComponent(value);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000 * COOKIE_DAYS);
    res.headers.append("Set-Cookie", `${escapedKey}=${escapedValue}; Path=/; Expires=${expires.toUTCString()};`);
}
function getBackend(ctx, url) {
    const config = ctx.config;
    if (!config.backends)
        return;
    const urlObj = new URL(url);
    return config?.backends?.[urlObj.origin];
}
//# sourceMappingURL=helpers.js.map