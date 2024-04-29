import {
  StickyAssignmentsDocument,
  StickyBucketService,
} from "@growthbook/growthbook";
import { Context } from "./types";
import { Request } from "express";

export class EdgeStickyBucketService extends StickyBucketService {
  private context: Context;
  private prefix: string;
  private req: Request;
  private docs: Record<string, StickyAssignmentsDocument>;

  constructor({
    context,
    prefix = "gbStickyBuckets__",
    req,
  }: {
    context: Context;
    prefix?: string;
    req: Request;
  }) {
    super();
    this.context = context;
    this.prefix = prefix;
    this.req = req;
    this.docs = {};
  }

  async getAssignments(attributeName: string, attributeValue: string) {
    const key = `${attributeName}||${attributeValue}`;
    let doc: StickyAssignmentsDocument | null = null;
    if (!this.req) return doc;
    try {
      // const raw = this.req.cookies[this.prefix + key] || "{}";
      const raw = this.context.helpers?.getCookie?.(this.req, this.prefix + key) || "{}";
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
