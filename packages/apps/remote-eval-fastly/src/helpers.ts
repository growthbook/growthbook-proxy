import type { LocalStorageCompat } from "@growthbook/growthbook/dist/types/growthbook";

// export const localStoragePolyfill = (store: any): LocalStorageCompat => ({
//     getItem: (key: string) => store.get(key),
//     setItem: (key: string, value: any) => store.set(key, value),
// });
export const localStoragePolyfill = (store: any): LocalStorageCompat => ({
  getItem: (key: string) => store.get(key),
  setItem: (key: string, value: any) => store.set(key, value),
});
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export const handleOptions = (request: any) => {
  if (
    request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null
  ) {
    return new Response(null, {
      headers: corsHeaders,
    });
  } else {
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD, POST, OPTIONS",
      },
    });
  }
};
export const getClientKey = (request: any) => {
  const RE_CLIENT_KEY = /(?:api|sub|eval)\/.*?\/?([^/?]*)\/?(?:\?.*)?$/;
  const originalUrl = request.url as string;
  return (
    request.headers?.["x-growthbook-api-key"] ||
    originalUrl.match(RE_CLIENT_KEY)?.[1]
  );
};
