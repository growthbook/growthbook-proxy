import got from "got";
import { Context } from "../../app";
import { getApiHostFromEnv, getConnectionsFromEnv } from "./helper";

const ConnectionFields: Set<string> = new Set([
  "apiKey",
  "signingKey",
  "useEncryption",
  "encryptionKey",
]);

export type ApiKey = string;
export interface Connection {
  apiKey: string;
  signingKey: string;
  useEncryption: boolean;
  encryptionKey?: string;
  connected: boolean; // Set to true once used. When false, force a cache read-through so that GB server may validate the connection.
}

interface ConnectionDoc {
  key: string,
  encryptPayload: boolean,
  encryptionKey: string,
  proxy: {
    signingKey: string,
  }
}

export class Registrar {
  private readonly connections: Map<ApiKey, Connection> = new Map();
  public apiHost = "";
  public authenticatedApiHost = "";
  private authenticatedApiSigningKey = "";
  private getConnectionsPollingInterval: NodeJS.Timeout | null = null;
  private getConnectionsPollingFrequency: number = 1000 * 60; // 1 min;

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
    const oldConnection = this.getConnectionByApiKey(apiKey);
    if (oldConnection) {
      connection.connected = oldConnection.connected;
    } else {
      connection.connected = false;
    }
    this.connections.set(apiKey, connection as Connection);
  }

  public deleteConnectionByApiKey(apiKey: ApiKey): boolean {
    return this.connections.delete(apiKey);
  }

  // todo: deprecate this method in favor of connection polling
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

  public async startConnectionPolling(
    authenticatedApiHost: string,
    authenticatedApiSigningKey: string,
    connectionPollingFrequency?: number
  ) {
    this.authenticatedApiHost = authenticatedApiHost;
    this.authenticatedApiSigningKey = authenticatedApiSigningKey;
    if (connectionPollingFrequency) {
      this.getConnectionsPollingFrequency = connectionPollingFrequency;
    }

    this.getConnectionsPollingInterval = setInterval(async () => {
      await this.pollForConnections();
    }, this.getConnectionsPollingFrequency);
    await this.pollForConnections();
  }

  private async pollForConnections() {
    const url = `${this.authenticatedApiHost}/api/sdk-connections`;
    const headers = {
      Authorization: `Bearer ${this.authenticatedApiSigningKey}`,
    };
    const connectionDocs = (await got
      .get(url, { headers })
      .json()
      .catch((e) => console.error("polling error", e.message))) as
      | ConnectionDoc[]
      | undefined;
    if (connectionDocs) {
      connectionDocs.forEach((doc: ConnectionDoc) => {
        const connection = {
          apiKey: doc.key,
          signingKey: doc.proxy.signingKey,
          encryptionKey: doc.encryptionKey,
          useEncryption: doc.encryptPayload,
        };
        this.setConnectionByApiKey(connection.apiKey, connection);
      });
    }
  }
}

export const registrar = new Registrar();

export const initializeRegistrar = async (context: Context) => {
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

  if (context.pollForConnections) {
    if (!context.authenticatedApiHost || !context.authenticatedApiSigningKey) {
      throw new Error("missing required context for polling for connections");
    }
    await registrar.startConnectionPolling(
      context.authenticatedApiHost,
      context.authenticatedApiSigningKey,
      context.connectionPollingFrequency
    );
  }

  Object.freeze(registrar);
};
