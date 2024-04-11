import { GrowthBook } from "@growthbook/growthbook";
const MAX_REDIRECTS = 5;
export default async function Redirect(
  growthbook: GrowthBook,
  previousUrl: string,
  resetDomMutations: () => void,
) {
  let redirectCount = 0;
  let newUrl = growthbook.getRedirectUrl();
  // no redirect
  if (!newUrl || newUrl === "") {
    return previousUrl;
  }
  while (previousUrl != newUrl) {
    newUrl = previousUrl;
    if (redirectCount >= MAX_REDIRECTS) {
      return previousUrl;
    }
    resetDomMutations();
    await growthbook.setURL(newUrl);
    previousUrl = newUrl;
    newUrl = growthbook.getRedirectUrl();
    redirectCount++;
  }
  return newUrl;
}
