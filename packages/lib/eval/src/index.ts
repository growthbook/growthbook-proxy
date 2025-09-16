/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  GrowthBook,
  Context as GBContext,
  StickyBucketService,
  FeatureDefinition,
  FeatureRule,
  AutoExperiment,
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
  stickyBucketService?:
    | (StickyBucketService & {
        connect: () => Promise<void>;
        onEvaluate?: () => Promise<void>;
      })
    | null;
  ctx?: any;
}) {
  const evaluatedFeatures: Record<string, FeatureDefinition> = {};
  const evaluatedExperiments: AutoExperiment[] = [];

  const features = payload?.features;
  const experiments = payload?.experiments;
  const savedGroups = payload?.savedGroups;
  const context: GBContext = { attributes };
  if (features) {
    context.features = features;
  }
  if (experiments) {
    context.experiments = experiments;
  }
  if (savedGroups) {
    context.savedGroups = savedGroups;
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
      const featureResult = gb.evalFeature(key);
      
      // Check if we have any deferred tracking calls (including prerequisite experiments)
      const deferredCalls = gb.getDeferredTrackingCalls();
      const hasDeferredCalls = deferredCalls && deferredCalls.length > 0;
      const hasValue = featureResult.value !== undefined;
       
      // legacy check (if deferred calls are missing)
      const hasExperiment = featureResult.source === "experiment" && featureResult.experimentResult !== undefined;
      
      if (hasValue || hasDeferredCalls) {
        // reduced feature definition
        evaluatedFeatures[key] = {
          defaultValue: featureResult.value,
        };
        
        if (hasDeferredCalls) {
          // Process all experiment exposures (including prerequisites)
          const tracks: FeatureRule['tracks'] = deferredCalls
            .filter(call => call.experiment && call.result) // Defensive: ensure call has required properties
            .map(call => ({
              experiment: scrubExperiment(call.experiment, call.result.variationId),
              result: call.result,
            }));
          
          evaluatedFeatures[key].rules = [
            {
              force: featureResult.value,
              tracks,
            },
          ];
          gb.setDeferredTrackingCalls([]);

        } else if (hasExperiment) {
          // Fallback for direct experiments when no deferred calls
          const scrubbedResultExperiment =
            featureResult?.experimentResult?.variationId !== undefined
              ? scrubExperiment(
                  featureResult.experiment,
                  featureResult.experimentResult.variationId,
                )
              : featureResult.experiment;
          
          evaluatedFeatures[key].rules = [
            {
              force: featureResult.value,
              tracks: [{
                experiment: scrubbedResultExperiment,
                result: featureResult.experimentResult!,
              }],
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
