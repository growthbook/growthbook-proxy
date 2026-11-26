import { Config } from "./types";

const MAX_REDIRECTS = 5;
// The visitor's credentials and ID, which other hosts shouldn't get
const PRIVATE_HEADERS = [
  "cookie",
  "authorization",
  "proxy-authorization",
  "x-gbuuid",
];

type FetchResponse = {
  status: number;
  headers: { get: (name: string) => string | null };
  body?: { cancel: () => Promise<void> } | null;
};

// Follows GET/HEAD redirects that stay on the same host or go to the site's own (public) host;
// any host with followCrossOriginRedirects. Any other 3xx is returned so the browser can follow it.
export async function fetchFollowingRedirects<R extends FetchResponse>(
  config: Pick<Config, "followRedirects" | "followCrossOriginRedirects">,
  url: string,
  method: string,
  headers: Headers,
  publicUrl: string,
  doFetch: (url: string, headers: Headers) => Promise<R>,
): Promise<R> {
  const publicHost = new URL(publicUrl).host;
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
    if (next.protocol !== "http:" && next.protocol !== "https:") break;
    const prev = new URL(url);
    // Another host (other than the site's own), or an https -> http downgrade, is cross-origin
    if (
      (next.host !== prev.host && next.host !== publicHost) ||
      (prev.protocol === "https:" && next.protocol === "http:")
    ) {
      if (!config.followCrossOriginRedirects) break;
      headers = new Headers(headers);
      PRIVATE_HEADERS.forEach((h) => headers.delete(h));
    }
    response.body?.cancel().catch(() => {});
    url = next.href;
    response = await doFetch(url, headers);
  }
  return response;
}
