import { GrowthBook } from "@growthbook/growthbook";
const MAX_REDIRECTS = 5;
export default async function Redirect(
  growthbook: GrowthBook,
  previousUrl: string,
) {
  let redirectCount = 0;
  let newURL = growthbook.getUrl();
  while (previousUrl != newURL) {
    newURL = previousUrl;
    if (redirectCount >= MAX_REDIRECTS) {
      return previousUrl;
    }
    await growthbook.setURL(newURL);
    previousUrl = newURL;
    newURL = growthbook.getUrl();
    redirectCount++;
  }
  return newURL;
}
