/* eslint-disable @typescript-eslint/no-explicit-any */
import { GrowthBook, Context as GBContext } from "@growthbook/growthbook";

export function evaluateFeatures({
  payload,
  attributes,
  forcedVariations,
  forcedFeatures,
  url,
  ctx,
}: {
  payload: any;
  attributes: Record<string, any>;
  forcedVariations?: Record<string, number>;
  forcedFeatures?: Map<string, any>;
  url?: string;
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

  if (features || experiments) {
    const gb = new GrowthBook(context);
    if (forcedFeatures) {
      gb.setForcedFeatures(forcedFeatures);
    }
    if (ctx?.verboseDebugging) {
      gb.debug = true;
    }

    const gbFeatures = gb.getFeatures();
    for (const key in gbFeatures) {
      const result = gb.evalFeature(key);
      if (result.on) {
        // reduced feature definition
        evaluatedFeatures[key] = {
          defaultValue: result.value,
        };
        if (result.source === "experiment") {
          evaluatedFeatures[key].rules = [
            {
              force: result.value,
              tracks: [{ experiment: result.experiment, result }],
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
        const evaluatedExperiment = {
          ...experiment,
          variations: experiment.variations.map((v: any, i: number) =>
            result.variationId === i ? v : {}
          ),
        };
        delete evaluatedExperiment.condition;
        evaluatedExperiments.push(evaluatedExperiment);
      }
    }
  }

  return {
    ...payload,
    features: evaluatedFeatures,
    experiments: evaluatedExperiments,
  };
}
