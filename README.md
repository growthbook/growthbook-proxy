# GrowthBook Proxy

[GrowthBook](https://www.growthbook.io) is a modular Feature Flagging and Experimentation platform.

The GrowthBook Proxy server sits between your application and GrowthBook. It turbocharges your GrowthBook implementation by providing **speed**, **scalability**, **security**, and **real-time** feature rollouts.

### Features:

- :zap: **Caching** - Significantly faster feature lookups!
  - In-memory cache plus an optional distributed layer (Redis or MongoDB)
  - Automatic cache invalidation when features change in GrowthBook (using WebHooks)
- :satellite: **Streaming** - Updates your application in real-time as features are changed or toggled (Javascript and React only)
- :lock: **Secure** - Private-key authentication between GrowthBook and GrowthBook Proxy
- :left_right_arrow: **Horizontally Scalable** - Support millions of concurrent users

### Coming soon:

- Server-side targeting and feature evaluation
- Realtime feature usage monitoring and alerting
- Additional support for edge deployments
- Streaming support for more SDKs

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

### Self-hosted customers

You will also need to ensure that your self-hosted GrowthBook instance is configured to use the proxy server. This includes setting environment variables:

```
PROXY_ENABLED=1
PROXY_HOST_PUBLIC=https://proxy.example.com

## Optional; you may also use the GrowthBook UI to set this:
SECRET_API_KEY=something_secret
```

See GrowthBook's [Proxy documentation](https://docs.growthbook.io/self-host/proxy#standalone) for more information.

### Cloud customers

For GrowthBook Cloud customers, use the GrowthBook app UI to create an API key in **Settings -> API Keys**. Additionally, you will need to set proxy's `GROWTHBOOK_API_HOST` environment variable to the cloud API server: `https://api.growthbook.io`.

## Configuration

The GrowthBook Proxy supports a number of configuration options available via environment variables:

- `GROWTHBOOK_API_HOST` - Set this to the host and port of your GrowthBook API instance
- `SECRET_API_KEY` - Create a secret API key in GrowthBook by going to **Settings -> API Keys**
- `NODE_ENV` - Set to "production" to hide debug and informational log messages

### Caching

By default, features are cached in memory in GrowthBook Proxy; you may provide your own cache service via Redis or Mongo. To fully utilize the GrowthBook Proxy, we highly recommend using Redis, which is a prerequisite for real-time updates when your proxy is horizontally scaled (as proxy instances are kept in-sync using Redis pub/sub).

- `CACHE_ENGINE` - One of: `memory`, `redis`, or `mongo`
- `CACHE_CONNECTION_URL` - The URL of your Redis or Mongo Database
- `CACHE_STALE_TTL` - Number of seconds until a cache entry is considered stale (default is `60` = 1 minute)
- `CACHE_EXPIRES_TTL` - Number of seconds until a cache entry is expired (default is `600` = 10 minutes)

#### Redis Cluster

Redis-specific options for cluster mode:<br />
_(Note that CACHE_CONNECTION_URL is ignored when using cluster mode)_

- `USE_CLUSTER` - "true" or "1" to enable
- `CLUSTER_ROOT_NODES` - simple: comma-separated URLs to your cluster seed nodes
- `CLUSTER_ROOT_NODES_JSON` - advanced: JSON array of ClusterNode objects (ioredis)
- `CLUSTER_OPTIONS_JSON` - advanced: JSON object of ClusterOptions (ioredis)

#### MongoDB

Mongo-specific options:

- `CACHE_DATABASE_NAME` - Mongo database name (default is `proxy`)
- `CACHE_COLLECTION_NAME` - Mongo collection name (default is `cache`)

### Horizontally scaling

For horizontally scaled GrowthBook Proxy clusters, we provide a basic mechanism for keeping your proxy instances in sync, which uses Redis Pub/Sub. To use this feature, you must use Redis as your cache engine and set the following option:

- `PUBLISH_PAYLOAD_TO_CHANNEL` - "true" or "1" to enable

### SSL termination & HTTP2

Although we recommend terminating SSL using your load balancer, you can also configure the GrowthBook Proxy to handle SSL termination directly. It supports HTTP/2 by default, which is required for high performance streaming.

- `USE_HTTP2` - "true" or "1" to enable
- `HTTPS_CERT` - The SSL certificate
- `HTTPS_KEY` - The SSL key

If the GrowthBook app your proxy is connecting to is using a self-signed certificate, you can disable certificate verification by setting `NODE_TLS_REJECT_UNAUTHORIZED` to "0".

### Other common configuration options

- `MAX_PAYLOAD_SIZE` - The maximum size of a request body (default is `"2mb"`)
- `VERBOSE_DEBUGGING` - "true" or "1" to enable verbose debugging
- `ENABLE_EVENT_STREAM` - "true" or "1" to enable streaming (on by default)
- `EVENT_STREAM_MAX_DURATION_MS` - The maximum duration of a SSE connection before the client is forced to reconnect (default is `60000` = 1 minute)
- `EVENT_STREAM_PING_INTERVAL_MS` - The interval between SSE "ping" messages sent to the client (default is `30000` = 30 seconds)
