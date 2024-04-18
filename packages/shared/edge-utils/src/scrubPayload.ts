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
  trackedExperimentHashes
}: {
  context: Context;
  sdkPayload?: StoredPayload;
  trackedExperimentHashes: string[];
}) {
  if (!sdkPayload) return sdkPayload;

  // if encypted, decrypt

  // scrub

  // if was encrypted, re-encrypt

  // blacklist logic?

  return sdkPayload;
}
