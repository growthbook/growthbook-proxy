import { GrowthBook } from "@growthbook/growthbook";
import { Context } from "./types";

export default async function redirect(
  context: Context,
  growthbook: GrowthBook,
  previousUrl: string,
  resetDomMutations: () => void,
) {
  const maxRedirects = context.config.maxRedirects || 5;
  let redirectCount = 0;

  let newUrl = growthbook.getRedirectUrl();
  // no redirect
  if (!newUrl) return previousUrl;

  while (previousUrl != newUrl) {
    newUrl = previousUrl;
    if (redirectCount >= maxRedirects) return previousUrl;

    resetDomMutations();
    await growthbook.setURL(newUrl);
    previousUrl = newUrl;
    newUrl = growthbook.getRedirectUrl();
    redirectCount++;
  }
  return newUrl;
}
