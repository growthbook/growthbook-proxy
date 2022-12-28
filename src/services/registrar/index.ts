import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

export interface EndpointsEntry {
  apiKey: string;
  sdkUrl: string;
  sdkBaseUrl: string;
  webhookUrl: string;
  webhookSecret: string;
}

export interface Settings {
  initialEndpoints?: Partial<EndpointsEntry>[];
}

export class Registrar {
  private endpoints: Map<string, EndpointsEntry>;

  constructor() {
    this.endpoints = new Map();
    const settings = this.getInitialSettings();
    if (settings?.initialEndpoints) {
      settings.initialEndpoints.forEach(e => {
        try {
          if (e.apiKey && e.sdkUrl && e.webhookUrl && e.webhookSecret) {
            const u = new URL(e.sdkUrl);
            e.sdkBaseUrl = u.origin;
            this.endpoints.set(e.apiKey, e as EndpointsEntry);
          }
        } catch(e) {
          console.error(e);
        }
      });
    }
  }

  public getEndpointsByApiKey(apiKey: string): EndpointsEntry|undefined {
    return this.endpoints.get(apiKey);
  }

  public setEndpointsByApiKey(apiKey: string, endpointEntry: EndpointsEntry) {
    this.endpoints.set(apiKey, endpointEntry);
  }

  private getInitialSettings() {
    const ENDPOINTS = process.env?.ENDPOINTS ?? null;

    let registrarSettings: Settings = {};
    if (ENDPOINTS) {
      try {
        let o = JSON.parse(ENDPOINTS);
        if (o.length) {
          registrarSettings.initialEndpoints = [];
          o.forEach((e: any) => {
            if (e.apiKey && e.sdkUrl && e.webhookUrl && e.webhookSecret) {
              registrarSettings?.initialEndpoints?.push(e);
            }
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    return registrarSettings;
  }
}

export const registrar = new Registrar();
Object.freeze(registrar);
