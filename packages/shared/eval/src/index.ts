/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  GrowthBook,
  Context as GBContext,
  StickyBucketService,
} from "@growthbook/growthbook";

export async function evaluateFeatures({
  payload,
  attributes,
  forcedVariations,
  forcedFeatures,
  url,
  stickyBucketService = null,
  ctx,
}: {
  payload: any;
  attributes: Record<string, any>;
  forcedVariations?: Record<string, number>;
  forcedFeatures?: Map<string, any>;
  url?: string;
  stickyBucketService?: (StickyBucketService & { onEvaluate?: () => Promise<void> }) | null;
  ctx?: any;
}) {
  const evaluatedFeatures: Record<string, any> = {};
  const evaluatedExperiments: any[] = [];

  const features = payload?.features;
  const experiments = payload?.experiments;
  const context: GBContext = { attributes };
  if (features) {
    context.features = features;
  }
  if (experiments) {
    context.experiments = experiments;
  }
  if (forcedVariations) {
    context.forcedVariations = forcedVariations;
  }
  if (url !== undefined) {
    context.url = url;
  }
  if (stickyBucketService) {
    context.stickyBucketService = stickyBucketService;
  }

  if (features || experiments) {
    const gb = new GrowthBook(context);
    if (forcedFeatures) {
      gb.setForcedFeatures(forcedFeatures);
    }
    if (ctx?.verboseDebugging) {
      gb.debug = true;
    }
    if (stickyBucketService) {
      await gb.refreshStickyBuckets();
    }

    const gbFeatures = gb.getFeatures();
    for (const key in gbFeatures) {
      const result = gb.evalFeature(key);
      if (result.on || result.experiment) {
        // reduced feature definition
        evaluatedFeatures[key] = {
          defaultValue: result.value,
        };
        if (result.source === "experiment") {
          // reduced experiment definition for tracking
          const scrubbedResultExperiment =
            result?.experimentResult?.variationId !== undefined
              ? scrubExperiment(
                  result.experiment,
                  result.experimentResult.variationId,
                )
              : result.experiment;
          evaluatedFeatures[key].rules = [
            {
              force: result.value,
              tracks: [{ experiment: scrubbedResultExperiment, result }],
            },
          ];
        }
      }
    }

    const gbExperiments = gb.getExperiments();
    for (const experiment of gbExperiments) {
      const result = gb.run(experiment);
      if (result.inExperiment) {
        // reduced experiment definition
        const evaluatedExperiment = scrubExperiment(
          experiment,
          result.variationId,
        );
        evaluatedExperiments.push(evaluatedExperiment);
      }
    }
  }

  stickyBucketService?.onEvaluate?.();

  return {
    ...payload,
    features: evaluatedFeatures,
    experiments: evaluatedExperiments,
  };
}

function scrubExperiment(experiment: any, allowedVariation: number) {
  const scrubbedExperiment = {
    ...experiment,
    variations: experiment.variations.map((v: any, i: number) =>
      allowedVariation === i ? v : {},
    ),
  };
  delete scrubbedExperiment.condition;
  return scrubbedExperiment;
}
