import { GrowthBook } from "@growthbook/growthbook";
import { Context } from "./types";

export default async function redirect({
  context,
  growthbook,
  previousUrl,
  resetDomChanges,
  setPreRedirectChangeIds,
}: {
  context: Context;
  growthbook: GrowthBook;
  previousUrl: string;
  resetDomChanges: () => void;
  setPreRedirectChangeIds: (changeIds: string[]) => void;
}): Promise<string> {
  const disableUrlRedirectExperiments = ["skip", "browser"].includes(
    context.config.runUrlRedirectExperiments,
  );
  if (disableUrlRedirectExperiments) return previousUrl;

  const maxRedirects = context.config.maxRedirects || 5;
  let redirectCount = 0;

  let newUrl = growthbook.getRedirectUrl();
  // no redirect
  if (!newUrl) return previousUrl;

  while (previousUrl != newUrl) {
    newUrl = previousUrl;
    if (redirectCount >= maxRedirects) return previousUrl;

    // clear visual experiment effects since we're no longer on the same page
    resetDomChanges();
    // keep track of experiments that triggered prior to final redirect
    setPreRedirectChangeIds(
      growthbook.getCompletedChangeIds(),
    );

    // change the URL to trigger the experiment
    await growthbook.setURL(newUrl);
    previousUrl = newUrl;
    newUrl = growthbook.getRedirectUrl();
    redirectCount++;
  }
  return newUrl;
}
