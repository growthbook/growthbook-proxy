import got from "got";
import { GrowthBook, Context as GBContext } from "@growthbook/growthbook";
import { Context } from "../../types";
import { featuresCache } from "../cache";
import logger from "../logger";
import { eventStreamManager } from "../eventStreamManager";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeFetches: Record<string, any> = {};

export async function fetchFeatures({
  apiKey,
  ctx,
  ssEvalEnabled = false,
}: {
  apiKey: string;
  ctx: Context;
  ssEvalEnabled?: boolean;
}) {
  const path = ssEvalEnabled
    ? `/api/eval/features/${apiKey}`
    : `/api/features/${apiKey}`;
  if (!featuresCache) {
    return;
  }
  if (!ctx.growthbookApiHost) {
    throw new Error("missing required context for fetching features");
  }
  const url = ctx.growthbookApiHost + path;

  // debounce requests
  let promise = activeFetches[url];

  if (!promise) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers: any = {
      "User-Agent": `GrowthBook Proxy`,
    };
    if (ssEvalEnabled) {
      if (!ctx.secretApiKey) {
        throw new Error("missing required context for fetching features");
      }
      headers["Authorization"] = `Bearer ${ctx.secretApiKey}`;
    }
    promise = got
      .get(url, { headers })
      .json()
      .catch((e) => logger.error(e, "Refresh stale cache error"))
      .finally(() => delete activeFetches[url]);

    activeFetches[url] = promise;
  }

  const payload = await promise;

  if (payload) {
    logger.debug("cache STALE, refreshing cache...");
    const oldEntry = await featuresCache.get(apiKey);
    await featuresCache?.set(apiKey, payload);

    if (ctx.enableEventStream && eventStreamManager) {
      eventStreamManager?.publish({
        apiKey,
        event: "features",
        payload,
        oldPayload: oldEntry?.payload,
        ssEvalEnabled,
      });
    }

    return { payload, oldEntry };
  } else {
    logger.error("Unable to parse response");
    return;
  }
}

export function evaluateFeatures({
  payload,
  attributes,
  ctx,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
  ctx?: Context;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evaluatedFeatures: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evaluatedExperiments: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let trackExperiments: { experiment: any; result: any }[] = [];

  const features = payload?.features;
  const experiments = payload?.experiments;
  const context: GBContext = {
    attributes,
    exportTrackEvents: true,
  };
  if (features) {
    context.features = features;
  }
  if (experiments) {
    context.experiments = experiments;
  }

  if (features || experiments) {
    const gb = new GrowthBook(context);
    if (ctx?.verboseDebugging) {
      gb.debug = true;
    }

    const gbFeatures = gb.getFeatures();
    for (const key in gbFeatures) {
      const result = gb.evalFeature(key);
      if (result.on) {
        // reduced feature definition
        evaluatedFeatures[key] = { defaultValue: true };
      }
    }
    const gbExperiments = gb.getExperiments();
    for (const experiment of gbExperiments) {
      const result = gb.run(experiment);
      if (result.inExperiment) {
        // reduced experiment definition
        const evaluatedExperiment = {
          key: experiment.key,
          coverage: 1,
          hashAttribute: experiment.hashAttribute,
          hashVersion: experiment.hashVersion,
          phase: experiment.phase,
          seed: experiment.seed,
          status: experiment.status,
          urlPatterns: experiment.urlPatterns,
          variations: experiment.variations.map((v, i) =>
            result.variationId === i ? v : {}
          ),
          weights: Array.from(
            { length: experiment.variations.length },
            (_, i) => (i === result.variationId ? 1 : 0)
          ),
        };
        evaluatedExperiments.push(evaluatedExperiment);
      }
    }

    trackExperiments = gb.getTrackedExperiments();
  }

  return {
    ...payload,
    features: evaluatedFeatures,
    experiments: evaluatedExperiments,
    trackExperiments: [
      ...(payload.trackExperiments ?? []),
      ...trackExperiments,
    ],
  };
}
