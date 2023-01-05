import { Context } from "../../app";
import { getEndpointsFromEnv } from "./helper";

const EndpointEntryFields: Set<string> = new Set([
  "apiKey",
  "apiHost",
  "signingKey",
  "encryptionKey",
]);

export interface EndpointsEntry {
  apiKey: string;
  apiHost: string;
  signingKey: string;
  encryptionKey?: string;
}

export class Registrar {
  private readonly endpoints: Map<string, EndpointsEntry> = new Map();

  public getEndpointsByApiKey(apiKey: string): EndpointsEntry | undefined {
    return this.endpoints.get(apiKey);
  }

  public getAllEndpoints(): Record<string, EndpointsEntry> {
    return Object.fromEntries(this.endpoints);
  }

  public setEndpointsByApiKey(apiKey: string, payload: unknown) {
    const e = this.getEndpointsFromPayload(payload);
    if (!e) {
      throw new Error("invalid payload");
    }
    this.endpoints.set(apiKey, e as EndpointsEntry);
  }

  public deleteEndpointsByApiKey(apiKey: string): boolean {
    return this.endpoints.delete(apiKey);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private getEndpointsFromPayload(payload: any): EndpointsEntry | null {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const e: any = {};
    for (const key in payload) {
      if (EndpointEntryFields.has(key) && payload[key]) {
        e[key] = payload[key];
      }
    }
    // if (e.apiKey && e.sdkApi && e.webhook && e.webhookSecret) {
    if (e.apiKey && e.apiHost && e.signingKey) {
      // e.sdkBaseUrl = new URL(e.sdkApi).origin;
      return e as EndpointsEntry;
    }
    return null;
  }
}

export const registrar = new Registrar();

export const initializeRegistrar = (context: Context) => {
  if (context?.endpoints?.apiKey) {
    registrar.setEndpointsByApiKey(context.endpoints.apiKey, context.endpoints);
  }

  if (context.createEndpointsFromEnv) {
    const envEndpoints = getEndpointsFromEnv();
    envEndpoints.forEach((e) => {
      if (!e.apiKey) {
        return;
      }
      registrar.setEndpointsByApiKey(e.apiKey, e);
    });
  }

  Object.freeze(registrar);
};
