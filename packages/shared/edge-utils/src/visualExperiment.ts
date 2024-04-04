import { GrowthBook } from "@growthbook/growthbook";
import { JSDOM } from "jsdom";
import { Context } from "./types";

export async function applyVisualExperiment({
  context,
  body,
  growthbook,
  url,
}: {
  context: Context;
  body: string;
  growthbook: GrowthBook;
  url: string;
}) {
  // todo: consider non-mutationObserver approach (no JSDOM)
  const dom = new JSDOM(body);
  // @ts-ignore
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;

  await growthbook.setURL(url);
  body = dom.serialize();

  return body;
}
