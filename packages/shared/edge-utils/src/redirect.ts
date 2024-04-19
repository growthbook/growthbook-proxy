import { GrowthBook } from "@growthbook/growthbook";
import { Context } from "./types";

export default async function redirect({
  context,
  growthbook,
  previousUrl,
  resetDomChanges,
  setPreRedirectTrackedExperimentHashes,
}: {
  context: Context;
  growthbook: GrowthBook;
  previousUrl: string;
  resetDomChanges: () => void;
  setPreRedirectTrackedExperimentHashes: (experiments: string[]) => void;
}): Promise<string> {
  const disableUrlRedirectExperiments = ["skip", "browser"].includes(
    context.config.runUrlRedirectExperiments,
  );
  const maxRedirects = context.config.maxRedirects || 5;

  if (disableUrlRedirectExperiments) {
    return previousUrl;
  }

  let redirectCount = 0;

  let newUrl = growthbook.getRedirectUrl();
  // no redirect
  if (!newUrl) return previousUrl;

  while (previousUrl != newUrl) {
    newUrl = previousUrl;
    if (redirectCount >= maxRedirects) return previousUrl;

    resetDomChanges();
    setPreRedirectTrackedExperimentHashes(
      growthbook.getTrackedExperimentHashes(),
    );

    await growthbook.setURL(newUrl);
    previousUrl = newUrl;
    newUrl = growthbook.getRedirectUrl();
    redirectCount++;
  }
  return newUrl;
}
