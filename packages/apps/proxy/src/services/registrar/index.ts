import https from "https";
import { Context } from "../../types";
import logger from "../logger";
import { getApiHostFromEnv, getConnectionsFromEnv } from "./helper";

const ConnectionFields: Set<string> = new Set([
  "apiKey",
  "signingKey",
  "organization",
  "encryptionKey",
  "useEncryption",
  "remoteEvalEnabled",
]);

export type ApiKey = string;
export interface Connection {
  apiKey: string;
  signingKey: string;
  organization?: string;
  encryptionKey?: string;
  useEncryption: boolean;
  remoteEvalEnabled: boolean;
  connected: boolean; // Set to true once used. When false, force a cache read-through so that GB server may validate the connection.
}

interface ConnectionDoc {
  key: string;
  organization?: string;
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
  private multiOrg = false;

  public status: "pending" | "connected" | "disconnected" | "unknown" = "pending";

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

  public async startConnectionPolling(context: Context) {
    this.secretApiKey = context.secretApiKey;
    if (context.connectionPollingFrequency) {
      this.getConnectionsPollingFrequency = context.connectionPollingFrequency;
    }
    if (context.multiOrg) {
      this.multiOrg = context.multiOrg;
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
    const limit = 100; // max 100
    let offset = 0;
    let page = 0;
    const maxPages = 10;
    const respConnections: { [key: string]: Partial<Connection> } = {};

    while (page <= maxPages) {
      page++;
      const url = `${
        this.growthbookApiHost
      }/api/v1/sdk-connections?withProxy=1&limit=${limit}&offset=${offset}${
        this.multiOrg ? "&multiOrg=1" : ""
      }`;
      const headers = {
        Authorization: `Bearer ${this.secretApiKey}`,
        "User-Agent": `GrowthBook Proxy`,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchOptions: any = { headers };
      if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        fetchOptions.agent = new https.Agent({ rejectUnauthorized: false });
      }

      let data:
        | {
        connections: ConnectionDoc[];
        limit?: number;
        offset?: number;
        total?: number;
        hasMore?: boolean;
        nextOffset?: number | null;
      }
        | undefined = undefined;

      try {
        const resp = await fetch(url, fetchOptions);
        if (!resp.ok) {
          const text = await resp.text();
          logger.error({ status: resp.status, body: text }, "connection polling error");
          this.status = "disconnected";
          return;
        }
        data = await resp.json();

      } catch (e) {
        logger.error({ err: e }, "connection polling error: API server unreachable");
        this.status = "disconnected";
      }

      if (!data?.connections) {
        logger.error({ url, hasData: !!data, hasConnections: !!data?.connections }, "connection polling error: no data");
        this.status = "disconnected";
        return;
      }
      if (Object.keys(data.connections).length === 0) {
        logger.warn({ url, connectionCount: 0 }, "connection polling: no connections found");
        this.status = "unknown";
        return;
      }

      data.connections.forEach((doc: ConnectionDoc) => {
        respConnections[doc.key] = {
          apiKey: doc.key,
          signingKey: doc.proxySigningKey,
          organization: doc?.organization,
          encryptionKey: doc.encryptionKey,
          useEncryption: doc.encryptPayload,
          remoteEvalEnabled: !!doc.remoteEvalEnabled,
        };
      });

      if (data.hasMore && data.nextOffset) {
        offset = data.nextOffset;
      } else {
        break; // No more results to fetch
      }
    }

    const oldConnections = this.getAllConnections();

    // add any new connections
    for (const key in respConnections) {
      const connection = respConnections[key];
      this.setConnection(key, connection);
    }
    // clean up stale connections
    const newKeys: Set<string> = new Set(Object.keys(respConnections));
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
        { count: Object.keys(newConnections).length },
        "SDK connections count",
      );
    }
    this.status = "connected";
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
    registrar.status = "connected";
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
    registrar.status = "connected";
  }

  if (context.pollForConnections) {
    if (!context.growthbookApiHost || !context.secretApiKey) {
      throw new Error("missing required context for polling for connections");
    }
    await registrar.startConnectionPolling(context);
  }
};
