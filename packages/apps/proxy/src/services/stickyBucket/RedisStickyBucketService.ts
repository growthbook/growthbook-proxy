import Redis, { Cluster, ClusterNode, ClusterOptions } from "ioredis";
import { StickyAssignmentsDocument, StickyAttributeKey, StickyBucketService } from "@growthbook/growthbook";
import logger from "../logger";
import { StickyBucketSettings } from "./index";

// Mostly taken from the JS SDK, with write buffer for when remote eval finishes

export class RedisStickyBucketService extends StickyBucketService {
  private client: Redis | Cluster | undefined;
  private readonly connectionUrl: string | undefined;
  private readonly useCluster: boolean;
  private readonly clusterRootNodesJSON?: ClusterNode[];
  private readonly clusterOptions?: ClusterOptions;
  private readonly ttl?: number;

  private writeBuffer: Record<string, string> = {};

  public constructor({
    connectionUrl,
    useCluster = false,
    clusterRootNodesJSON,
    clusterOptionsJSON,
    ttl,
  }: StickyBucketSettings = {}) {
    super();
    this.connectionUrl = connectionUrl;
    this.useCluster = useCluster;
    this.clusterRootNodesJSON = clusterRootNodesJSON;
    this.clusterOptions = clusterOptionsJSON;
    this.ttl = ttl;
  }

  public async connect() {
    if (!this.useCluster) {
      this.client = this.connectionUrl
        ? new Redis(this.connectionUrl)
        : new Redis();
    } else {
      if (this.clusterRootNodesJSON) {
        this.client = new Redis.Cluster(
          this.clusterRootNodesJSON,
          this.clusterOptions,
        );
      } else {
        throw new Error("No cluster root nodes");
      }
    }
  }

  public async getAllAssignments(
    attributes: Record<string, string>,
  ): Promise<Record<StickyAttributeKey, StickyAssignmentsDocument>> {
    const docs: Record<StickyAttributeKey, StickyAssignmentsDocument> = {};
    const keys = Object.entries(attributes).map(
      ([attributeName, attributeValue]) =>
        `${attributeName}||${attributeValue}`,
    );
    if (!this.client || keys.length === 0) return docs;
      
    try {
      const values = await this.client.mget(...keys);
      values.forEach((raw) => {
        try {
          const data = JSON.parse(raw || "{}");
          if (data.attributeName && data.attributeValue && data.assignments) {
            const key = `${data.attributeName}||${data.attributeValue}`;
            docs[key] = data;
          }
        } catch (e) {
          logger.error(
            { err: e, rawValue: raw },
            "unable to parse sticky bucket json"
          );
        }
      });
    } catch (e) {
      logger.warn({ err: e }, "unable to load sticky buckets");
    }
    return docs;
  }

  public async getAssignments(_attributeName: string, _attributeValue: string) {
    // not implemented
    return null;
  }

  public async saveAssignments(doc: StickyAssignmentsDocument) {
    const key = `${doc.attributeName}||${doc.attributeValue}`;
    if (!this.client) return;
    this.writeBuffer[key] = JSON.stringify(doc);
  }

  public async onEvaluate() {
    if (!this.client) return;
    if (Object.keys(this.writeBuffer).length === 0) return;
    if (this.ttl !== undefined) {
      await this.client
        .multi(
          Object.entries(this.writeBuffer).map(([key, value]) => [
            "set",
            key,
            value,
            "ex",
            this.ttl,
          ]),
        )
        .exec();
    } else {
      this.client.mset(this.writeBuffer);
    }

    this.writeBuffer = {};
  }

  public getClient() {
    return this.client;
  }
}
