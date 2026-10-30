# @growthbook/proxy-eval

Evaluates GrowthBook feature flags and experiments on a server, for [remote evaluation](https://docs.growthbook.io/self-host/remote-evaluation). The GrowthBook Proxy uses it, and you can use it in your own proxies, edge workers, or backend APIs. Clients send their attributes and get back evaluated results without seeing your targeting rules.

```bash
npm install @growthbook/proxy-eval
```

## Usage

Pass the SDK payload for a connection (from the GrowthBook API, a cache, or a webhook) and the user's attributes:

```ts
import { evaluateFeatures } from "@growthbook/proxy-eval";

const result = await evaluateFeatures({
  payload, // the SDK Connection's features payload
  attributes: { id: "user_123", country: "US" },
});

// { features, experiments, dateUpdated }
```

Remote evaluation clients send `attributes`, and optionally `forcedVariations`, `forcedFeatures` and `url`. Pass them through. To keep experiment assignments stable, also pass a `stickyBucketService`.

`example/cloudflare` is a complete Cloudflare Worker that reads the payload from KV.

## What clients see

Rules stay on the server. Suppose you have a feature with two targeting rules and an experiment:

```ts
const rules = [
  { condition: { email: { $regex: "@acme\\.com$" } }, force: "acme-deal" },
  { condition: { plan: "enterprise" }, force: "enterprise" },
  { key: "banner-test", variations: ["standard", "promo"], coverage: 0.5 },
];
```

A user with `plan: "enterprise"` matches the second rule. Their client receives only the resulting value with no conditions and no sign that other rules exist:

```json
{ "defaultValue": "enterprise" }
```

A user who doesn't match the first rules falls into the experiment rule. Their client receives only the variation they were assigned, and the others are emptied:

```json
{ "key": "banner-test", "variations": ["standard", {}] }
```

Experiment and feature exposure tracking still work when evaluating a reduced payload.

## Remote Saved Groups

To evaluate rules that use [Remote Saved Groups](https://docs.growthbook.io/features/remote-saved-groups), pass a `savedGroupResolver` that looks up the user's groups. The JS SDK's `redisResolver` reads the Redis that `@growthbook/remote-saved-groups-redis-loader` fills:

```ts
import { redisResolver } from "@growthbook/growthbook";

const result = await evaluateFeatures({
  payload,
  attributes,
  savedGroupResolver: redisResolver({ sMembers: (key) => redis.smembers(key) }),
  onSavedGroupResolverError: (err) => console.error(err),
});
```

With a resolver, remote group IDs sent by the client are ignored. If the lookup fails, the user is in no remote groups, and the result has no `dateUpdated`, so SDKs accept the next correct response.
