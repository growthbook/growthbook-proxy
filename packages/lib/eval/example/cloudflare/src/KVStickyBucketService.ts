import {
  StickyAssignmentsDocument,
  StickyAttributeKey,
  StickyBucketService,
} from "@growthbook/proxy-eval";

// KV-backed sticky bucketing. Construct per-request and pass flushWrites() to
// ctx.waitUntil() — un-awaited writes are cancelled when the worker responds.
// Note: KV is eventually consistent (~60s cross-colo) and expirationTtl must be >= 60s.
export class KVStickyBucketService extends StickyBucketService {
  private kv: KVNamespace;
  private ttl?: number; // seconds
  private writeBuffer: Record<string, string> = {};

  constructor({ kv, ttl, prefix }: { kv: KVNamespace; ttl?: number; prefix?: string }) {
    super({ prefix });
    this.kv = kv;
    this.ttl = ttl;
  }

  public async connect() {
    // no-op
  }

  public async getAssignments(attributeName: string, attributeValue: string) {
    const key = this.getKey(attributeName, attributeValue);
    try {
      return await this.kv.get<StickyAssignmentsDocument>(key, "json");
    } catch (e) {
      console.error("unable to load sticky bucket", e);
      return null;
    }
  }

  public async getAllAssignments(attributes: Record<string, string>) {
    const docs: Record<StickyAttributeKey, StickyAssignmentsDocument> = {};
    await Promise.all(
      Object.entries(attributes).map(async ([attributeName, attributeValue]) => {
        const doc = await this.getAssignments(attributeName, attributeValue);
        if (doc) docs[`${doc.attributeName}||${doc.attributeValue}`] = doc;
      }),
    );
    return docs;
  }

  public async saveAssignments(doc: StickyAssignmentsDocument) {
    const key = this.getKey(doc.attributeName, doc.attributeValue);
    this.writeBuffer[key] = JSON.stringify(doc);
  }

  public async flushWrites() {
    const buffer = this.writeBuffer;
    this.writeBuffer = {};
    await Promise.all(
      Object.entries(buffer).map(([key, value]) =>
        this.kv
          .put(key, value, this.ttl ? { expirationTtl: this.ttl } : undefined)
          .catch((e) => console.error("unable to save sticky bucket", e)),
      ),
    );
  }
}
