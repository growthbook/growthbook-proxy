import { ConfigEnv } from "@growthbook/edge-utils";

export { init } from "./init";

export function mapHeadersToConfigEnv(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  originType: "custom" | "s3" = "custom",
  prefix: string = "x-env-",
): ConfigEnv {
  const config: ConfigEnv = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headersObj: Record<string, any> =
    req?.origin?.[originType]?.customHeaders || {};
  const headers = Object.entries(headersObj);
  headers.forEach(([key, header]) => {
    key = key.toLowerCase();
    const val = header?.[0]?.value;
    if (!val) return;
    if (key.startsWith(prefix)) {
      const envKey =
        key.slice(prefix.length)?.replace(/-/g, "_")?.toUpperCase?.() || "";
      config[envKey] = val;
    }
  });
  return config;
}
