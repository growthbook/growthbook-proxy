import { Config } from "./types";

const MAX_REDIRECTS = 5;
const CREDENTIAL_HEADERS = ["cookie", "authorization", "proxy-authorization"];

type FetchResponse = {
  status: number;
  headers: { get: (name: string) => string | null };
};

// Follows GET/HEAD redirects that stay on the same host (any host if followCrossOriginRedirects).
// Any other 3xx is returned as-is so the browser can follow it.
export async function fetchFollowingRedirects<R extends FetchResponse>(
  config: Pick<Config, "followRedirects" | "followCrossOriginRedirects">,
  url: string,
  method: string,
  headers: Headers,
  doFetch: (url: string, headers: Headers) => Promise<R>,
): Promise<R> {
  let response = await doFetch(url, headers);
  if (
    !config.followRedirects ||
    !["GET", "HEAD"].includes(method.toUpperCase())
  )
    return response;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      break;
    }
    if (next.host !== new URL(url).host) {
      if (!config.followCrossOriginRedirects) break;
      // Like fetch, don't send the visitor's credentials to another host
      headers = new Headers(headers);
      CREDENTIAL_HEADERS.forEach((h) => headers.delete(h));
    }
    url = next.href;
    response = await doFetch(url, headers);
  }
  return response;
}
