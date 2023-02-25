import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";
import logger from "../logger";
import { eventStreamManager } from "../eventStreamManager";
import { Context } from "../../types";
import { MemoryCache } from "./MemoryCache";
import { CacheEntry, CacheSettings } from "./index";

export class RedisCache {
  private client: ReturnType<typeof createClient> | undefined;
  private clientUUID: string = uuidv4();

  private readonly publishPayloadToChannel: boolean;
  private subscriberClient: ReturnType<typeof createClient> | undefined;

  private readonly memoryCacheClient: MemoryCache | undefined;
  private readonly connectionUrl: string | undefined;
  private readonly staleTTL: number;
  private readonly expiresTTL: number;
  public readonly allowStale: boolean;

  private readonly appContext?: Context;

  public constructor(
    {
      staleTTL = 60, //         1 minute
      expiresTTL = 10 * 60, //  10 minutes
      allowStale = true,
      connectionUrl,
      useAdditionalMemoryCache,
      publishPayloadToChannel = false,
    }: CacheSettings = {},
    appContext?: Context
  ) {
    this.connectionUrl = connectionUrl;
    this.staleTTL = staleTTL * 1000;
    this.expiresTTL = expiresTTL * 1000;
    this.allowStale = allowStale;
    this.publishPayloadToChannel = publishPayloadToChannel;

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
    this.client = this.connectionUrl
      ? createClient({ url: this.connectionUrl })
      : createClient();
    if (this.client) {
      this.client.on("error", (e: Error) => {
        logger.error(e, "Error connecting to redis client");
      });
      await this.client.connect();

      await this.subscribe();
    }
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
    const entry = {
      payload,
      staleOn: new Date(Date.now() + this.staleTTL),
      expiresOn: new Date(Date.now() + this.expiresTTL),
    };
    await this.client.set(key, JSON.stringify(entry), {
      EX: this.expiresTTL / 1000,
    });

    // pub/sub using "set" channel
    if (this.publishPayloadToChannel && this.subscriberClient) {
      this.client.publish(
        "set",
        JSON.stringify({
          uuid: this.clientUUID,
          key,
          payload,
        })
      );
    }

    // refresh MemoryCache
    if (this.memoryCacheClient) {
      await this.memoryCacheClient.set(key, entry);
    }
  }

  private async subscribe() {
    if (!this.publishPayloadToChannel) return;
    if (!this.client) {
      throw new Error("No redis client");
    }

    this.subscriberClient = this.client.duplicate();
    await this.subscriberClient.connect();

    // Redis will not subscribe to messages published from the same connection
    this.subscriberClient.subscribe("set", async (message, channel) => {
      if (channel === "set") {
        try {
          const { uuid, key, payload } = JSON.parse(message);
          // ignore messages published from this client
          if (uuid === this.clientUUID) return;

          const oldEntry = await this.get(key);
          // publish to eventStream clients
          if (this.appContext?.enableEventStream) {
            eventStreamManager.publish(
              key,
              "features",
              payload,
              oldEntry?.payload
            );
          }
        } catch (e) {
          logger.error(e, "Error parsing message from Redis pub/sub");
        }
      }
    });
  }

  public getClient() {
    return this.client;
  }

  public getsubscriberClient() {
    return this.subscriberClient;
  }
}
