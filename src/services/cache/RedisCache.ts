import Redis, { Cluster, ClusterNode, ClusterOptions } from "ioredis";

import { v4 as uuidv4 } from "uuid";
import logger from "../logger";
import { eventStreamManager } from "../eventStreamManager";
import { Context } from "../../types";
import { MemoryCache } from "./MemoryCache";
import { CacheEntry, CacheSettings } from "./index";

export class RedisCache {
  private client: Redis | Cluster | undefined;
  private clientUUID: string = uuidv4();

  private readonly publishPayloadToChannel: boolean;
  private subscriberClient: Redis | Cluster | undefined;

  private readonly memoryCacheClient: MemoryCache | undefined;
  private readonly connectionUrl: string | undefined;
  private readonly staleTTL: number;
  private readonly expiresTTL: number;
  public readonly allowStale: boolean;

  private readonly useCluster: boolean;
  private readonly clusterRootNodes?: ClusterNode[];
  private readonly clusterOptions?: ClusterOptions;

  private readonly appContext?: Context;

  public constructor(
    {
      staleTTL = 60, //         1 minute
      expiresTTL = 10 * 60, //  10 minutes
      allowStale = true,
      connectionUrl,
      useAdditionalMemoryCache,
      publishPayloadToChannel = false,
      useCluster = false,
      clusterRootNodes,
      clusterRootNodesJSON,
      clusterOptionsJSON,
    }: CacheSettings = {},
    appContext?: Context
  ) {
    this.connectionUrl = connectionUrl;
    this.staleTTL = staleTTL * 1000;
    this.expiresTTL = expiresTTL * 1000;
    this.allowStale = allowStale;
    this.publishPayloadToChannel = publishPayloadToChannel;
    this.useCluster = useCluster;
    this.clusterRootNodes =
      clusterRootNodesJSON ?? this.transformRootNodes(clusterRootNodes);
    this.clusterOptions = clusterOptionsJSON;

    this.appContext = appContext;

    // wrap the RedisCache in a MemoryCache to avoid hitting Redis on every request
    if (useAdditionalMemoryCache) {
      this.memoryCacheClient = new MemoryCache({
        expiresTTL: 1, //  1 second,
        allowStale: false,
      });
    }
  }

  public async connect() {
    if (!this.useCluster) {
      this.client = this.connectionUrl
        ? new Redis(this.connectionUrl)
        : new Redis();
    } else {
      if (this.clusterRootNodes) {
        this.client = new Redis.Cluster(
          this.clusterRootNodes,
          this.clusterOptions
        );
      } else {
        throw new Error("No cluster root nodes");
      }
    }

    await this.subscribe();
  }

  public async get(key: string): Promise<CacheEntry | undefined> {
    if (!this.client) {
      throw new Error("No redis client");
    }
    let entry = undefined;

    // try fetching from MemoryCache first
    if (this.memoryCacheClient) {
      const memoryCacheEntry = await this.memoryCacheClient.get(key);
      if (memoryCacheEntry && memoryCacheEntry.expiresOn > new Date()) {
        entry = memoryCacheEntry.payload as CacheEntry;
      }
    }

    // if cache miss from MemoryCache, fetch from Redis
    if (!entry) {
      const entryRaw = await this.client.get(key);
      if (!entryRaw) {
        return undefined;
      }
      try {
        entry = JSON.parse(entryRaw);
      } catch (e) {
        logger.error("unable to parse cache json");
        return undefined;
      }
    }

    if (!entry) {
      return undefined;
    }
    if (!this.allowStale && entry.staleOn < new Date()) {
      return undefined;
    }
    if (entry.expiresOn < new Date()) {
      return undefined;
    }

    // refresh MemoryCache
    if (this.memoryCacheClient) {
      await this.memoryCacheClient.set(key, entry);
    }
    return entry;
  }

  public async set(key: string, payload: unknown) {
    if (!this.client) {
      throw new Error("No redis client");
    }

    const oldEntry = await this.get(key);

    const entry = {
      payload,
      staleOn: new Date(Date.now() + this.staleTTL),
      expiresOn: new Date(Date.now() + this.expiresTTL),
    };
    await this.client.set(
      key,
      JSON.stringify(entry),
      "EX",
      this.expiresTTL / 1000
    );

    // refresh MemoryCache
    if (this.memoryCacheClient) {
      await this.memoryCacheClient.set(key, entry);
    }

    // Publish with Redis pub/sub so that other proxy nodes can
    // 1. emit SSE to SDK subscribers
    // 2. update their MemoryCache
    if (this.publishPayloadToChannel) {
      // publish to Redis subscribers if new payload !== old payload
      const hasChanges =
        JSON.stringify(oldEntry?.payload) !== JSON.stringify(payload);
      if (hasChanges) {
        logger.info(
          { payload },
          "RedisCache.set: publish to Redis subscribers"
        );

        this.client.publish(
          "set",
          JSON.stringify({
            uuid: this.clientUUID,
            key,
            payload,
          })
        );
        return;
      }

      logger.info(
        { payload, oldPayload: oldEntry?.payload },
        "RedisCache.set: do not publish to Redis subscribers (no changes)"
      );
    }
  }

  private async subscribe() {
    if (!this.publishPayloadToChannel) return;
    this.appContext?.verboseDebugging && logger.info("RedisCache.subscribe");

    if (!this.client) {
      throw new Error("No redis client");
    }

    // Redis requires that subscribers use a separate client
    this.subscriberClient = this.client.duplicate();

    // Subscribe to Redis pub/sub so that this proxy node can:
    // 1. emit SSE to SDK subscribers
    // 2. update its MemoryCache
    this.subscriberClient.subscribe("set", (err) => {
      if (err) {
        logger.error(err, "RedisCache.subscribe: error subscribing to 'set'");
      } else {
        this.appContext?.verboseDebugging &&
          logger.info("RedisCache.subscribe: subscribed to 'set' channel");
      }
    });

    this.subscriberClient.on(
      "message",
      async (channel: string, message: string) => {
        if (channel === "set") {
          try {
            const { uuid, key, payload } = JSON.parse(message);

            // ignore messages published from this node (shouldn't subscribe to ourselves)
            if (uuid === this.clientUUID) return;

            this.appContext?.verboseDebugging &&
              logger.info(
                { payload },
                "RedisCache.subscribe: got 'set' message"
              );

            // 1. emit SSE to SDK clients
            if (this.appContext?.enableEventStream && eventStreamManager) {
              this.appContext?.verboseDebugging &&
                logger.info({ payload }, "RedisCache.subscribe: publish SSE");

              eventStreamManager.publish(key, "features", payload);
            }

            // 2. update MemoryCache
            if (this.memoryCacheClient) {
              const entry = {
                payload,
                staleOn: new Date(Date.now() + this.staleTTL),
                expiresOn: new Date(Date.now() + this.expiresTTL),
              };
              await this.memoryCacheClient.set(key, entry);
            }
          } catch (e) {
            logger.error(e, "Error parsing message from Redis pub/sub");
          }
        }
      }
    );
  }

  public getClient() {
    return this.client;
  }

  public getsubscriberClient() {
    return this.subscriberClient;
  }

  private transformRootNodes(rootNodes?: string[]): ClusterNode[] | undefined {
    if (!rootNodes) return undefined;
    return rootNodes
      .map((node) => {
        try {
          const url = new URL(node);
          const host = url.protocol + "//" + url.hostname + url.pathname;
          const port = parseInt(url.port);
          return { host, port };
        } catch (e) {
          logger.error(e, "Error parsing Redis cluster node");
          return undefined;
        }
      })
      .filter(Boolean) as ClusterNode[];
  }
}
