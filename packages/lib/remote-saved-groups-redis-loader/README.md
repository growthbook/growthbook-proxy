# @growthbook/remote-saved-groups-redis-loader

Loads GrowthBook [Remote Saved Groups](https://docs.growthbook.io/features/remote-saved-groups) into Redis. It polls GrowthBook for each group's current file, loads its IDs into Redis, and reports each load back to GrowthBook. The GrowthBook Proxy runs it for you; use this package to run it on its own, such as next to the Redis your servers or edge workers read.

The JS SDK's `redisResolver` reads the keys it writes, so SDKs can look up a user's groups from the same Redis.

```bash
npm install @growthbook/remote-saved-groups-redis-loader
```

## Requirements

- Redis 6.2 or later, single node or Cluster
- `maxmemory-policy noeviction`. If Redis evicts a key, users silently drop out of groups. The command logs a warning when it can see another policy; in your own service, call `warnIfRedisCanEvict`
- A GrowthBook secret API key with publish access, to report loads

## Running it

The `remote-saved-groups-redis-loader` command uses the same settings as the GrowthBook Proxy:

```bash
GROWTHBOOK_API_HOST=https://api.growthbook.io \
SECRET_API_KEY=secret_... \
REMOTE_SAVED_GROUPS_STORE_ID=redis-us-east \
REMOTE_SAVED_GROUPS_CONNECTION_URL=redis://localhost:6379 \
npx remote-saved-groups-redis-loader
```

- `GROWTHBOOK_API_HOST` and `SECRET_API_KEY` (required)
- `REMOTE_SAVED_GROUPS_STORE_ID` (required): identifies this Redis in GrowthBook's load reports, such as `redis-us-east`. Loaders sharing a Redis (or a Redis Cluster) use the same ID, and each Redis gets a different one
- `REMOTE_SAVED_GROUPS_CONNECTION_URL`: the Redis URL. Required unless using Redis Cluster
- `REMOTE_SAVED_GROUPS_USE_CLUSTER` and `REMOTE_SAVED_GROUPS_CLUSTER_ROOT_NODES_JSON`: for Redis Cluster
- `REMOTE_SAVED_GROUPS_POLL_INTERVAL_MS`: how often to check for new files (default: 5 minutes)

Several loaders can share a Redis. They take turns loading each group.

## Using it in your own service

```ts
import {
  createLoader,
  createRedisClient,
} from "@growthbook/remote-saved-groups-redis-loader";

const redis = createRedisClient({ connectionUrl: "redis://localhost:6379" });
const loader = createLoader({
  apiHost: "https://api.growthbook.io",
  apiKey: "secret_...",
  redis,
  storeId: "redis-us-east",
});

loader.start();

// On shutdown
await loader.stop();
redis.disconnect();
```

## License

MIT
