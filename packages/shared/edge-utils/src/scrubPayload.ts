import {
  Attributes,
  StoredPayload,
  TrackingData,
} from "@growthbook/growthbook";
import { sdkWrapper } from "./generated/sdkWrapper";
import { Context } from "./types";

export function scrubPayload({
  context,
  sdkPayload,
  trackedExperiments
}: {
  context: Context;
  sdkPayload?: StoredPayload;
  trackedExperiments: { keys: string[], hashes: string[] };
}) {
  if (!sdkPayload) return sdkPayload;

  // if encypted, decrypt

  // scrub

  // if was encrypted, re-encrypt

  // blacklist logic?

  return sdkPayload;
}
