# GrowthBook Proxy

[GrowthBook](https://www.growthbook.io) is a modular Feature Flagging and Experimentation platform.

The GrowthBook Proxy server sits between your application and GrowthBook. It turbocharges your GrowthBook implementation by providing **speed**, **scalability**, **security**, and **real-time** feature rollouts.

### Features

- :zap: **Caching** - Significantly faster feature lookups!
  - In-memory cache plus an optional distributed layer (Redis or MongoDB)
  - Automatic cache invalidation when features change in GrowthBook (using WebHooks)
- :satellite: **Streaming** - Updates your application in real-time as features are changed or toggled (Javascript and React only)
- :lock: **Remote Evaluation** - Hide your features' business logic in insecure environments
- :key: **Secure** - Private-key authentication between GrowthBook and GrowthBook Proxy
- :left_right_arrow: **Horizontally Scalable** - Support millions of concurrent users

### See more

This GrowthBook Proxy package (`@growthbook/proxy`) is a part of the larger GrowthBook Proxy mono-repo. See the [main project](https://github.com/growthbook/growthbook-proxy) for more information and configuration examples.
