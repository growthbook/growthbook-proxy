import { GrowthBook, Context as GBContext } from "@growthbook/growthbook";

export function evaluateFeatures({
  payload,
  attributes,
  ctx,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx?: any;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evaluatedFeatures: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
