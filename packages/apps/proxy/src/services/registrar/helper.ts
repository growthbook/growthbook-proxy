import { Connection } from "./index";

export const envToConnectionVarMap: Record<string, string> = {
  API_KEY: "apiKey",
  SIGNING_KEY: "signingKey",
  ENCRYPTION_KEY: "encryptionKey",
  USE_ENCRYPTION: "useEncryption",
  REMOTE_EVAL_ENABLED: "remoteEvalEnabled",
  ORGANIZATION: "organization", // multi-org
};

export const getApiHostFromEnv = (): string => {
  return process.env.GROWTHBOOK_API_HOST || "";
};

export const getConnectionsFromEnv = (): Connection[] => {
  const initialConnections: Connection[] = [];
  // Scan the env vars for CONNECTION. or CONNECTION.1. prefixes, return them as prefix groups
  const groupedConnectionVars = groupEnvVarsByPrefix(Object.keys(process.env));
  for (const prefix in groupedConnectionVars) {
    const group = groupedConnectionVars[prefix];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const connection: any = {};
    Object.entries(group).forEach((v) => {
      const [key, val] = v;
      const entryKey = envToConnectionVarMap[key];
      if (entryKey) {
        // boolean casts
        if (["useEncryption", "remoteEvalEnabled"].includes(entryKey)) {
          let boolVal = ["true", "1"].includes(val);
          connection[entryKey] = boolVal;
        } else {
          connection[entryKey] = val;
        }
      }
    });
    connection.connected = false;
    if (Object.keys(connection).length) {
      initialConnections.push(connection as Connection);
    }
  }
  return initialConnections;
};

/**
 * Arrange vars like [CONNECTION.API_KEY, CONNECTION.SIGNING_KEY]
 * or [CONNECTION.2.API_KEY, CONNECTION.2.SIGNING_KEY]
 * into { prefix: suffix[] } groups
 * */
const groupEnvVarsByPrefix = (
  strings: string[],
): Record<string, Record<string, string>> => {
  return strings.reduce(
    (groups: Record<string, Record<string, string>>, str) => {
      const prefixMatch = str.match(/^(CONNECTION(?:\.\d+)?\.)(.*)/);
      if (prefixMatch) {
        if (!groups[prefixMatch[1]]) {
          groups[prefixMatch[1]] = {};
        }
        // @ts-ignore
        groups[prefixMatch[1]][prefixMatch[2]] = process.env[prefixMatch[0]];
      }
      return groups;
    },
    {},
  );
};
