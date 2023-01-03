import dotenv from "dotenv";
import { EndpointsEntry } from "./index";
dotenv.config({ path: "./.env.local" });

export const envToEntryVarMap: Record<string, string> = {
  API_KEY: "apiKey",
  SDK_API: "sdkApi",
  SDK_ENCRYPTION_KEY: "sdkEncryptionKey",
  WEBHOOK: "webhook",
  WEBHOOK_SECRET: "webhookSecret",
};

export const getEndpointsFromEnv = (): Partial<EndpointsEntry>[] => {
  const initialEndpoints: Partial<EndpointsEntry>[] = [];
  // Scan the env vars for ENDPOINT. or ENDPOINT.1. prefixes, return them as prefix groups
  const groupedEndpointVars = groupEnvVarsByPrefix(Object.keys(process.env));
  for (const prefix in groupedEndpointVars) {
    const group = groupedEndpointVars[prefix];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const entry: any = {};
    Object.entries(group).forEach((v) => {
      const [key, val] = v;
      const entryKey = envToEntryVarMap[key];
      if (entryKey) {
        entry[entryKey] = val;
      }
    });
    if (Object.keys(entry).length) {
      initialEndpoints.push(entry as Partial<EndpointsEntry>);
    }
  }
  return initialEndpoints;
};

/** Arrange vars like [ENDPOINT.API_KEY, ENDPOINT.SDK_API] or [ENDPOINT.2.API_KEY, ENDPOINT.2.SDK_API] into [prefix, suffix[]] groups */
const groupEnvVarsByPrefix = (
  strings: string[]
): Record<string, Record<string, string>> => {
  return strings.reduce(
    (groups: Record<string, Record<string, string>>, str) => {
      const prefixMatch = str.match(/^(ENDPOINT(?:\.\d+)?\.)(.*)/);
      if (prefixMatch) {
        if (!groups[prefixMatch[1]]) {
          groups[prefixMatch[1]] = {};
        }
        // @ts-ignore
        groups[prefixMatch[1]][prefixMatch[2]] = process.env[prefixMatch[0]];
      }
      return groups;
    },
    {}
  );
};
