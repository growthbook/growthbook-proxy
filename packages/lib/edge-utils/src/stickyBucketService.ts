import {
  StickyAssignmentsDocument,
  StickyBucketService,
} from "@growthbook/growthbook";
import { Context } from "./types";

export class EdgeStickyBucketService<Req, Res> extends StickyBucketService {
  protected prefix: string;
  private context: Context<Req, Res>;
  private req: Req;

  constructor({
    context,
    prefix = "gbStickyBuckets__",
    req,
  }: {
    context: Context<Req, Res>;
    prefix?: string;
    req: Req;
  }) {
    super();
    this.context = context;
    this.prefix = prefix;
    this.req = req;
  }

  async getAssignments(attributeName: string, attributeValue: string) {
    const key = this.getKey(attributeName, attributeValue);
    let doc: StickyAssignmentsDocument | null = null;
    if (!this.req) return doc;
    try {
      // const raw = this.req.cookies[this.prefix + key] || "{}";
      const raw =
        this.context.helpers?.getCookie?.(this.req, key) || "{}";
      const data = JSON.parse(raw);
      if (data.attributeName && data.attributeValue && data.assignments) {
        doc = data;
      }
    } catch (e) {
      // Ignore cookie errors
    }
    return doc;
  }

  async saveAssignments(_: StickyAssignmentsDocument) {
    // Do nothing. User assignments will be hydrated from the SDK directly.
  }
}
