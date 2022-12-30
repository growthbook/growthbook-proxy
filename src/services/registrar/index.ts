import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

const envToEntryVarMap: Record<string, string> = {
  API_KEY: "apiKey",
  SDK_API: "sdkApi",
  SDK_ENCRYPTION_KEY: "sdkEncryptionKey",
  WEBHOOK: "webhook",
  WEBHOOK_SECRET: "webhookSecret",
};

export interface EndpointsEntry {
  apiKey: string;
  sdkApi: string;
  sdkBaseUrl: string;
  sdkEncryptionKey?: string;
  webhook: string;
  webhookSecret: string;
}

export interface Settings {
  initialEndpoints?: Partial<EndpointsEntry>[];
}

export class Registrar {
  private endpoints: Map<string, EndpointsEntry>;

  constructor(settings: Settings = {}) {
    this.endpoints = new Map();
    settings.initialEndpoints = this.getEndpointsFromEnv();
    settings.initialEndpoints.forEach(e => {
      if (e.apiKey && e.sdkApi && e.webhook && e.webhookSecret) {
        e.sdkBaseUrl= new URL(e.sdkApi).origin;
        this.endpoints.set(e.apiKey, e as EndpointsEntry);
      }
    });
  }

  public getEndpointsByApiKey(apiKey: string): EndpointsEntry|undefined {
    return this.endpoints.get(apiKey);
  }

  public setEndpointsByApiKey(apiKey: string, endpointEntry: EndpointsEntry) {
    this.endpoints.set(apiKey, endpointEntry);
  }

  private getEndpointsFromEnv(): Partial<EndpointsEntry>[] {
    const initialEndpoints: Partial<EndpointsEntry>[] = [];
    // Scan the env vars for ENDPOINT. or ENDPOINT.1. prefixes, return them as prefix groups
    const groupedEndpointVars = this.groupVarsByPrefix(Object.keys(process.env));
    for (const prefix in groupedEndpointVars) {
      const group = groupedEndpointVars[prefix];
      const entry: any = {};
      Object.entries(group).forEach(v => {
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
  }

  /** Arrange vars like [ENDPOINT.API_KEY, ENDPOINT.SDK_API] or [ENDPOINT.2.API_KEY, ENDPOINT.2.SDK_API] into [prefix, suffix[]] groups */
  private groupVarsByPrefix(strings: string[]): Record<string, Record<string, string>> {
    return strings.reduce((groups: Record<string, Record<string, string>>, str) => {
      const prefixMatch = str.match(/^(ENDPOINT(?:\.\d+)?\.)(.*)/);
      if (prefixMatch) {
        if (!groups[prefixMatch[1]]) {
          groups[prefixMatch[1]] = {};
        }
        // @ts-ignore
        groups[prefixMatch[1]][prefixMatch[2]] = process.env[prefixMatch[0]];
      }
      return groups;
    }, {});
  }
}

export const registrar = new Registrar();
Object.freeze(registrar);
