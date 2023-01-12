import got from "got";
import { Context } from "../../app";
import { version } from "../../../package.json";
import { getApiHostFromEnv, getConnectionsFromEnv } from "./helper";

const ConnectionFields: Set<string> = new Set([
  "apiKey",
  "signingKey",
  "encryptionKey",
  "useEncryption",
]);

export type ApiKey = string;
export interface Connection {
  apiKey: string;
  signingKey: string;
  encryptionKey?: string;
  useEncryption: boolean;
  connected: boolean; // Set to true once used. When false, force a cache read-through so that GB server may validate the connection.
}

interface ConnectionDoc {
  key: string;
  encryptPayload: boolean;
  encryptionKey: string;
  proxySigningKey: string;
}

export class Registrar {
  private readonly connections: Map<ApiKey, Connection> = new Map();
  public apiHost = "";
  public authenticatedApiHost = "";
  private authenticatedApiSigningKey = "";
  private getConnectionsPollingInterval: NodeJS.Timeout | null = null;
  private getConnectionsPollingFrequency: number = 1000 * 60; // 1 min;

  public getConnection(apiKey: ApiKey): Connection | undefined {
    return this.connections.get(apiKey);
  }

  public getAllConnections(): Record<ApiKey, Connection> {
    return Object.fromEntries(this.connections);
  }

  public setConnection(apiKey: ApiKey, payload: unknown) {
    const connection = this.generateConnectionFromPayload(payload);
    if (!connection) {
      throw new Error("invalid payload");
    }
    const oldConnection = this.getConnection(apiKey);
    if (oldConnection) {
      connection.connected = oldConnection.connected;
    }
    this.connections.set(apiKey, connection as Connection);
  }

  public deleteConnection(apiKey: ApiKey): boolean {
    return this.connections.delete(apiKey);
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

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private generateConnectionFromPayload(payload: any): Connection | null {
    if (typeof payload !== "object" || payload === null) {
      return null;
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const connection: any = {};
    for (const key in payload) {
      if (ConnectionFields.has(key) && payload[key]) {
        connection[key] = payload[key];
      }
    }
    connection.connected = false;
    if (connection.apiKey && connection.signingKey) {
      return connection as Connection;
    }
    return null;
  }

  private async pollForConnections() {
    const url = `${this.authenticatedApiHost}/api/v1/sdk-connections?withProxy=1&limit=100`;
    const headers = {
      Authorization: `Bearer ${this.authenticatedApiSigningKey}`,
      "User-Agent": `GrowthBook Proxy ${version}`,
    };
    const resp = (await got
      .get(url, { headers })
      .json()
      .catch((e) => console.error("polling error", e.message))) as
      | { connections: ConnectionDoc[] }
      | undefined;
    if (resp?.connections) {
      resp.connections.forEach((doc: ConnectionDoc) => {
        const connection: Partial<Connection> = {
          apiKey: doc.key,
          signingKey: doc.proxySigningKey,
          encryptionKey: doc.encryptionKey,
          useEncryption: doc.encryptPayload,
        };
        this.setConnection(doc.key, connection);
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
      registrar.setConnection(connection.apiKey, connection);
    }
  }

  if (context.createConnectionsFromEnv) {
    registrar.apiHost = getApiHostFromEnv();
    const envConnections = getConnectionsFromEnv();
    envConnections.forEach((connection) => {
      if (connection.apiKey && connection.signingKey) {
        registrar.setConnection(connection.apiKey, connection);
      }
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
