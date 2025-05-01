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

### Coming soon

- Realtime feature usage monitoring and alerting
- Additional support for edge deployments
- Streaming and Remote Evaluation support for more SDKs

## About this Repository ###

The GrowthBook Proxy repository is a mono-repo containing the following packages:

| Package                       | link                                                | description                                                                                                                               |
|-------------------------------|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `@growthbook/proxy`           | [apps/proxy](packages/apps/proxy)                   | The GrowthBook Proxy server. The remainder of this document pertains to this package.                                                     |
| `@growthbook/proxy-eval`      | [lib/eval](packages/lib/eval)                       | The remote evaluation engine used by the GrowthBook Proxy server. This package may be included into other back ends, edge functions, etc. |
| `@growthbook/edge-utils`      | [lib/edge-utils](packages/lib/edge-utils)           | The base GrowthBook Edge App. Can be used standalone. Used in vendor-specific edge libs.                                                  |
| `@growthbook/edge-cloudflare` | [lib/edge-cloudflare](packages/lib/edge-cloudflare) | The Cloudflare Workers implementation of the GrowthBook Edge App.                                                                         |
| `@growthbook/edge-fastly`     | [lib/edge-fastly](packages/lib/edge-fastly)         | The Fastly Compute implementation of the GrowthBook Edge App.                                                                             |
| `@growthbook/edge-lambda`     | [lib/edge-lambda](packages/lib/edge-lambda)         | The AWS Lambda@Edge implementation of the GrowthBook Edge App.                                                                            |

### What's new

**Version 1.2.5**
- Fix bugs parsing sticky bucket settings, allow for separate redis configs for proxy cache & sticky bucket service

**Version 1.2.4**
- Support expiring sticky buckets in Redis remote eval sticky bucket service

**Version 1.2.3**
- Update SDK version
- Minimum supported Node.js version is now 20.0.0.

**Version 1.2.1**
- Move detailed healthcheck statuses to new /healthcheck/checks endpoint
- Keep /healthcheck endpoint simple & synchronous
- Add Zod validation and sanitization to remote eval endpoint

**Version 1.2.0**
- ARM support (via Depot)
- More detailed /healthcheck status 

**Version 1.1.11**
- Guard against crashes when API server is down

**Version 1.1.8**
- Auto-instrument OpenTelemetry when using `yarn start:with-tracing`

**Version 1.1.4**
- Support Redis-based sticky bucketing for remote evaluation
- Update remote evaluation to allow for buffered sticky bucket writes
- Update SDK version to support sticky bucketing and prerequisite flags

**Version 1.1.2**
- Fix max payload size bug
- Deprecate `CLUSTER_ROOT_NODES` in favor of `CLUSTER_ROOT_NODES_JSON`

**Version 1.1.1**
- Multi organization support
- Support paginated SDK Connection polling

**Version 1.1.0**
- Remote evaluation support added
- Released `@growthbook/proxy-eval` package; reformatted codebase as a mono-repo
- Minimum supported Node.js version is now 18.0.0.

**Older versions**
- Redis cluster support
- Horizontal scaling support for proxy cluster using Redis pub/sub
- Streaming support (SSE)
- Graceful shutdown
- Stampede protection & debouncer for cache misses

---

## Installation

Install and run with Docker

```bash
docker pull growthbook/proxy:latest
docker run -d -p 3300:3300 \
  -e "GROWTHBOOK_API_HOST=https://growthbook-api.example.com" \
  -e "SECRET_API_KEY=key_abc123" \
  --name gbproxy growthbook/proxy
```

Then, simply point your GrowthBook SDKs to the GrowthBook Proxy instead of the GrowthBook API.

You will need to create a "readonly" secret API key in GrowthBook by going to **Settings -> API Keys** (you can also use a Personal Access Token if preferred). Or you can use a custom SECRET_API_KEY of your choosing<sup>✻</sup>. Whichever method you choose, this key will be used to authenticate your proxy server with the GrowthBook app.

### Self-hosted customers

You will also need to ensure that your self-hosted GrowthBook instance is configured to use the proxy server. This includes setting environment variables in your GrowthBook instance (back-end):

```
PROXY_ENABLED=1
PROXY_HOST_PUBLIC=https://proxy.example.com
```

✻ _If you are using a custom SECRET_API_KEY, you should also add an environment variable to your GrowthBook instance (ex: `SECRET_API_KEY=key_abc123`)._


### Cloud customers

There are many reasons to self-host the GrowthBook Proxy (ex: low-latency consistent cache within your infrastructure, ability to customize SSE streaming). Additionally, Remote Evaluation is only available on a privately-hosted endpoint, such as this proxy server.

You must enable your self-hosted GrowthBook Proxy by setting a custom proxy webhook URL for each SDK Connection via **SDK Configuration -> SDK Connections** in the GrowthBook app.

---

See GrowthBook's [Proxy documentation](https://docs.growthbook.io/self-host/proxy#standalone) for more information.

## Configuration

The GrowthBook Proxy supports a number of configuration options available via environment variables:

- `GROWTHBOOK_API_HOST` - Set this to the host and port of your GrowthBook API instance
- `SECRET_API_KEY` - Create a secret API key in GrowthBook by going to **Settings -> API Keys**
- `NODE_ENV` - Set to "production" to hide debug and informational log messages

### Caching

By default, features are cached in memory in the GrowthBook Proxy; you may provide your own cache service via Redis or Mongo. To fully utilize the GrowthBook Proxy, we highly recommend using Redis, which is a prerequisite for real-time updates when your proxy is horizontally scaled (as proxy instances are kept in-sync using Redis pub/sub).

- `CACHE_ENGINE` - One of: `memory`, `redis`, or `mongo` (default: `memory`)
- `CACHE_CONNECTION_URL` - The URL of your Redis or Mongo Database
- `CACHE_STALE_TTL` - Number of seconds until a cache entry is considered stale (default: `60` = 1 minute)
- `CACHE_EXPIRES_TTL` - Number of seconds until a cache entry is expired (default: `3600` = 1 hour)

#### Redis Cluster

Redis-specific options for cluster mode:<br />
_(Note that CACHE_CONNECTION_URL is ignored when using cluster mode)_

- `USE_CLUSTER` - "true" or "1" to enable (default: `false`)
- `CLUSTER_ROOT_NODES_JSON` - JSON array of ClusterNode objects (ioredis)
- `CLUSTER_OPTIONS_JSON` - JSON object of ClusterOptions (ioredis)

#### MongoDB

Mongo-specific options:

- `CACHE_DATABASE_NAME` - Mongo database name (default: `proxy`)
- `CACHE_COLLECTION_NAME` - Mongo collection name (default: `cache`)

### Horizontally scaling

For horizontally scaled GrowthBook Proxy clusters, we provide a basic mechanism for keeping your proxy instances in sync, which uses Redis Pub/Sub. To use this feature, you must use Redis as your cache engine and set the following option:

- `PUBLISH_PAYLOAD_TO_CHANNEL` (Redis) - "true" or "1" to enable (default: `false`)

### SSL termination & HTTP2

Although we recommend terminating SSL using your load balancer, you can also configure the GrowthBook Proxy to handle SSL termination directly. It supports HTTP/2 by default, which is required for high performance streaming.

- `USE_HTTP2` - "true" or "1" to enable (default: `false`)
- `HTTPS_CERT` - The SSL certificate
- `HTTPS_KEY` - The SSL key

If the GrowthBook app your proxy is connecting to is using a self-signed certificate, you can disable certificate verification by setting `NODE_TLS_REJECT_UNAUTHORIZED` to "0".

### Observability (OpenTelemetry)

The GrowthBook Proxy is instrumented with OpenTelemetry to publish observability metrics, traces, and logs.

To enable, you must change the Docker CMD from the default `yarn start` to `yarn start:with-tracing`.

The standard [OTEL\_\* Environment Variables](https://opentelemetry.io/docs/concepts/sdk-configuration/) are supported, such as `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT`.

### Other common configuration options

**Streaming**
- `ENABLE_EVENT_STREAM` - "true" or "1" to enable streaming (default: `true`)
- `EVENT_STREAM_MAX_DURATION_MS` - The maximum duration of a SSE connection before the client is forced to reconnect (default: `60000` = 1 minute)
- `EVENT_STREAM_PING_INTERVAL_MS` - The interval between SSE "ping" messages sent to the client (default: `30000` = 30 seconds)

**Remote Evaluation**
- `ENABLE_REMOTE_EVAL` - "true" or "1" to enable remote evaluation (default: `true`)
- `ENABLE_STICKY_BUCKETING` - "true" or "1" to enable sticky bucketing for remote evaluation. Requires a Redis connection (default: `false`)
  - `STICKY_BUCKET_ENGINE` - One of: `redis`, `none` (only Redis is supported) (default: `none`)
  - `STICKY_BUCKET_CONNECTION_URL` - The URL of your Redis Database
  - `STICKY_BUCKET_USE_CLUSTER` - "true" or "1" to enable Redis cluster mode (default: `false`)
  - `STICKY_BUCKET_CLUSTER_ROOT_NODES_JSON` - JSON array of ClusterNode objects (ioredis)
  - `STICKY_BUCKET_CLUSTER_OPTIONS_JSON` - JSON object of ClusterOptions (ioredis)
  - `STICKY_BUCKET_TTL` - Number of seconds before a sticky bucket document expires in Redis (default: `0` = never)

**Misc**
- `MAX_PAYLOAD_SIZE` - The maximum size of a request body (default: `"2mb"`)
- `VERBOSE_DEBUGGING` - "true" or "1" to enable verbose debugging (default: `false`)
- `CONNECTION_POLLING_FREQUENCY` - How frequently to refresh SDK connections (default: `60000` = 1 minute)
- `MULTI_ORG` - "true" or "1" to enable multi-organization support (requires a compatible access token) (default: `false`)
