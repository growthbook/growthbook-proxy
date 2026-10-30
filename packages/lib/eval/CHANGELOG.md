# Changelog

## **1.3.0** - Oct 30, 2026

- Look up a user's Remote Saved Groups before evaluating, with the new `savedGroupResolver` option. Client-sent remote group IDs are ignored when a resolver is set, and a failed lookup counts as in no groups
- Update the GrowthBook JS SDK to 2.0.0, which is strict about types in targeting conditions. See [Updating to 2.0.0](https://docs.growthbook.io/lib/js#updating-to-2-0-0)

## **1.2.0** - Aug 12, 2026

- Update the GrowthBook JS SDK to 1.7.0 and evaluate contextual bandits
- Return only `features`, `experiments` and `dateUpdated`. Other fields of the incoming payload are no longer passed through
- Re-export the SDK types for payloads, features, experiments, attributes and sticky bucket documents, plus `StickyBucketService`, so you don't need to depend on `@growthbook/growthbook` directly
- Type the `payload` option as `FeatureApiResponse | null`

## **1.1.3** - May 13, 2026

- Update the GrowthBook JS SDK to 1.6.5

## **1.1.2** - Jan 27, 2026

- Update the GrowthBook JS SDK to 1.6.4

## **1.1.1** - Jan 22, 2026

- Update the GrowthBook JS SDK to 1.6.3

## **1.1.0** - Sep 16, 2025

- Fix experiment tracking in remote evaluation: record every experiment a feature evaluates, including prerequisite experiments, not only the feature's own
- Return a feature whenever it evaluates to a value, not only when it is on or part of an experiment
- Type the evaluated features and experiments instead of using `any`

## **1.0.7** and **1.0.8** - Aug 18, 2025

- Update the GrowthBook JS SDK to 1.6.1
- Require `connect()` on the sticky bucket service type

## **1.0.6** - Mar 17, 2025

- Update the GrowthBook JS SDK to 1.4.1

## **1.0.4** and **1.0.5** - Aug 5, 2024

- Support Saved Groups: targeting conditions that reference them now evaluate

## **1.0.3** - Jun 12, 2024

- Update the GrowthBook JS SDK to 1.0.1

## **1.0.2** - Mar 7, 2024

- Add the `stickyBucketService` option for sticky bucketing. `evaluateFeatures` is now async
- Update the GrowthBook JS SDK to 0.34

## **1.0.0** - Oct 9, 2023

- Initial release: evaluate a GrowthBook payload on the server for a given set of attributes, forced variations, forced features and URL
