# Changelog

## **1.3.0** - Oct 30, 2026

- Look up a user's Remote Saved Groups before evaluating, with the new `savedGroupResolver` option. Client-sent remote group IDs are ignored when a resolver is set, and a failed lookup counts as in no groups
- Update the GrowthBook JS SDK to 2.0.0, which is strict about types in targeting conditions. See [Updating to 2.0.0](https://docs.growthbook.io/lib/js#updating-to-2-0-0)
