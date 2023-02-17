import { FeatureDefinition, GrowthBook } from "@growthbook/growthbook";

export let sdk: GrowthBook | null = null;

export async function initializeFeatureEvaluation() {
  sdk = new GrowthBook();
}

export function evaluateFeature(features: unknown, id: string) {
  if (!sdk) throw new Error("SDK not initialized");
  if (!features) throw new Error("No features provided");
  sdk.setFeatures(features as Record<string, FeatureDefinition>);
  const result = sdk.evalFeature(id);
  return result;
}
