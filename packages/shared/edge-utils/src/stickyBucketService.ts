import {
  StickyAssignmentsDocument,
  StickyBucketService,
} from "@growthbook/growthbook";

interface RequestCompat {
  cookies: Record<string, string>;
  [key: string]: unknown;
}

export class EdgeStickyBucketService extends StickyBucketService {
  private prefix: string;
  private req: RequestCompat;
  private docs: Record<string, StickyAssignmentsDocument>;

  constructor({
    prefix = "gbStickyBuckets__",
    req,
  }: {
    prefix?: string;
    req: RequestCompat;
  }) {
    super();
    this.prefix = prefix;
    this.req = req;
    this.docs = {};
  }

  async getAssignments(attributeName: string, attributeValue: string) {
    const key = `${attributeName}||${attributeValue}`;
    let doc: StickyAssignmentsDocument | null = null;
    if (!this.req) return doc;
    try {
      const raw = this.req.cookies[this.prefix + key] || "{}";
      const data = JSON.parse(raw);
      if (data.attributeName && data.attributeValue && data.assignments) {
        doc = data;
      }
    } catch (e) {
      // Ignore cookie errors
    }
    if (doc) {
      this.docs[key] = doc;
    }
    return doc;
  }

  async saveAssignments(doc: StickyAssignmentsDocument) {
    const key = `${doc.attributeName}||${doc.attributeValue}`;
    this.docs[key] = doc;
  }

  exportAssignmentDocs(): Record<string, StickyAssignmentsDocument> {
    return this.docs;
  }
}
