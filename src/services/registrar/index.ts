import { Context } from "../../app";
import { getApiHostFromEnv, getConnectionsFromEnv } from "./helper";

const ConnectionFields: Set<string> = new Set([
  "apiKey",
  "signingKey",
  "encryptionKey",
]);

export type ApiKey = string;
export interface Connection {
  apiKey: string;
  signingKey: string;
  encryptionKey?: string;
}

export class Registrar {
  public apiHost = "";
  private readonly connections: Map<ApiKey, Connection> = new Map();

  public getConnectionByApiKey(apiKey: ApiKey): Connection | undefined {
    return this.connections.get(apiKey);
  }

  public getAllConnections(): Record<ApiKey, Connection> {
    return Object.fromEntries(this.connections);
  }

  public setConnectionByApiKey(apiKey: ApiKey, payload: unknown) {
    const connection = this.getConnectionFromPayload(payload);
    if (!connection) {
      throw new Error("invalid payload");
    }
    this.connections.set(apiKey, connection as Connection);
  }

  public deleteConnectionByApiKey(apiKey: ApiKey): boolean {
    return this.connections.delete(apiKey);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private getConnectionFromPayload(payload: any): Connection | null {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const connection: any = {};
    for (const key in payload) {
      if (ConnectionFields.has(key) && payload[key]) {
        connection[key] = payload[key];
      }
    }
    if (connection.apiKey && connection.signingKey) {
      return connection as Connection;
    }
    return null;
  }
}

export const registrar = new Registrar();

export const initializeRegistrar = (context: Context) => {
  if (context?.apiHost) {
    registrar.apiHost = context.apiHost;
  }
  if (context?.connections?.length) {
    for (const connection of context.connections) {
      registrar.setConnectionByApiKey(connection.apiKey, connection);
    }
  }

  if (context.createConnectionsFromEnv) {
    registrar.apiHost = getApiHostFromEnv();
    const envConnections = getConnectionsFromEnv();
    envConnections.forEach((connection) => {
      if (!connection.apiKey) {
        return;
      }
      registrar.setConnectionByApiKey(connection.apiKey, connection);
    });
  }

  Object.freeze(registrar);
};
