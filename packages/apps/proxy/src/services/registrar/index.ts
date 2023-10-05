import { Context } from "../../types";
import logger from "../logger";
import { getApiHostFromEnv, getConnectionsFromEnv } from "./helper";

const ConnectionFields: Set<string> = new Set([
  "apiKey",
  "signingKey",
  "encryptionKey",
  "useEncryption",
  "remoteEvalEnabled",
]);

export type ApiKey = string;
export interface Connection {
  apiKey: string;
  signingKey: string;
  encryptionKey?: string;
  useEncryption: boolean;
  remoteEvalEnabled: boolean;
  connected: boolean; // Set to true once used. When false, force a cache read-through so that GB server may validate the connection.
}

interface ConnectionDoc {
  key: string;
  encryptPayload: boolean;
  encryptionKey: string;
  proxySigningKey: string;
  remoteEvalEnabled?: boolean;
}

export class Registrar {
  private readonly connections: Map<ApiKey, Connection> = new Map();
  public growthbookApiHost = "";
  private secretApiKey = "";
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
    secretApiKey: string,
    connectionPollingFrequency?: number
  ) {
    this.secretApiKey = secretApiKey;
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
    const url = `${this.growthbookApiHost}/api/v1/sdk-connections?withProxy=1&limit=100`;
    const headers = {
      Authorization: `Bearer ${this.secretApiKey}`,
      "User-Agent": `GrowthBook Proxy`,
    };
    const resp = (await fetch(url, { headers })
      .then(resp => resp.json())
      .catch((e) => logger.error(e, "polling error"))) as
      | { connections: ConnectionDoc[] }
      | undefined;

    if (resp?.connections) {
      const oldConnections = this.getAllConnections();

      const newKeys: Set<string> = new Set();
      resp.connections.forEach((doc: ConnectionDoc) => {
        const connection: Partial<Connection> = {
          apiKey: doc.key,
          signingKey: doc.proxySigningKey,
          encryptionKey: doc.encryptionKey,
          useEncryption: doc.encryptPayload,
          remoteEvalEnabled: !!doc.remoteEvalEnabled,
        };
        this.setConnection(doc.key, connection);
        newKeys.add(doc.key);
      });

      // clean up stale connections
      for (const key in oldConnections) {
        if (!newKeys.has(key)) {
          this.deleteConnection(key);
        }
      }

      const newConnections = this.getAllConnections();
      const hasChanges =
        JSON.stringify(newConnections) !== JSON.stringify(oldConnections);
      if (hasChanges) {
        logger.info(
          `SDK connections count: ${Object.keys(newConnections).length}`
        );
      }
    }
  }
}

export const registrar = new Registrar();

export const initializeRegistrar = async (context: Context) => {
  if (context?.growthbookApiHost) {
    registrar.growthbookApiHost = context.growthbookApiHost;
  }
  if (context?.connections?.length) {
    for (const connection of context.connections) {
      registrar.setConnection(connection.apiKey, connection);
    }
  }

  if (context.createConnectionsFromEnv) {
    registrar.growthbookApiHost =
      registrar.growthbookApiHost || getApiHostFromEnv();
    const envConnections = getConnectionsFromEnv();
    envConnections.forEach((connection) => {
      if (connection.apiKey && connection.signingKey) {
        registrar.setConnection(connection.apiKey, connection);
      }
    });
  }

  if (context.pollForConnections) {
    if (!context.growthbookApiHost || !context.secretApiKey) {
      throw new Error("missing required context for polling for connections");
    }
    await registrar.startConnectionPolling(
      context.secretApiKey,
      context.connectionPollingFrequency
    );
  }

  Object.freeze(registrar);
};
