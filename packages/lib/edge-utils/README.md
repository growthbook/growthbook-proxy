# GrowthBook Edge App _(base)_

[GrowthBook](https://www.growthbook.io) is a modular Feature Flagging and Experimentation platform.

The **GrowthBook Edge App** provides turnkey Visual Editor and URL Redirect experimentation on edge without any of the flicker associated with front-end experiments. It runs as a smart proxy layer between your application and your end users. It also can inject a fully-hydrated front-end SDK onto the rendered page, meaning no extra network requests needed.

- Automatically run server-side or hybrid Visual Experiments without redraw flicker.
- Automatically run server-side or hybrid URL Redirect Experiments without flicker or delay.
- Inject the JavaScript SDK with hydrated payload, allowing the front-end to pick up where the edge left off without any extra network requests.

> [!NOTE]
> 
> This is a vendor-agnostic **base app** for the GrowthBook Edge App. It is used by our vendor-specific Edge Apps (CloudFlare Workers, Lambda@Edge). You can also easily build a custom implementation for your edge provider. 

## Installation

### Implement our Edge App request handler

To run the edge app, add our base app to request handler to your project. You will need to manually build app context and helper functions:

```javascript
import { edgeApp, getConfig, defaultContext } from "@growthbook/edge-utils";

export async function handler(request, env) {
  const context = await init(env);
  return edgeApp(context, request);
}

function init(env) {
  const context = defaultContext;
  context.config = getConfig(env);
  context.helpers = {
    // define utility functions for request/response manipulation
  };
return context;
}
```

### Set up environment variables

Add these required fields, at minimum, to your environment variables:

```
PROXY_TARGET="https://internal.mysite.io"  # The non-edge URL to your website
GROWTHBOOK_API_HOST="https://cdn.growthbook.io"
GROWTHBOOK_CLIENT_KEY="abc123"
GROWTHBOOK_DECRYPTION_KEY="qwerty1234"  # Optional
```

See the complete list of environment variables in the [Configuration](#configuration) section.

### Set up payload caching (optional)

Set up an edge key-val store and optionally use a GrowthBook SDK Webhook to keep feature and experiment values synced between GrowthBook and your edge worker. This eliminates network requests from your edge to GrowthBook.

## Configuration

The GrowthBook Edge App supports a number of configuration options available via environment variables:

#### Proxy behavior
- `PROXY_TARGET` - Non-edge url to your website
- `FORWARD_PROXY_HEADERS` - "true" or "1" to preserve response headers from your server (default : `true`)
- `NODE_ENV` - default: `production`
- `ROUTES` - JSON encoded array of Routes, rules for intercepting, proxy passing, or erroring based on request URL pattern matching

#### Experiment behavior
- `RUN_VISUAL_EDITOR_EXPERIMENTS` - One of `everywhere`, `edge`, `browser`, or `skip` (default `everywhere`)
- `DISABLE_JS_INJECTION` - "true" or "1" to skip injecting JavaScript coming from a Visual Experiment (default `false`)
- `RUN_URL_REDIRECT_EXPERIMENTS` - One of `everywhere`, `edge`, `browser`, or `skip` (default `browser`)
- `RUN_CROSS_ORIGIN_URL_REDIRECT_EXPERIMENTS` - One of `everywhere`, `edge`, `browser`, or `skip` (default `browser`)
- `INJECT_REDIRECT_URL_SCRIPT` - "true" or "1" to mutate browser URL via window.history.replaceState() to reflect the redirected URL (default `true`)
- `MAX_REDIRECTS` - Number of on-edge redirects calculated before bailing out. Only the final redirect is fetched from your origin. (default `5`)

#### Front-end SDK hydration
- `SCRIPT_INJECTION_PATTERN` - Inject the GrowthBook SDK before this token (default `</head>`)
- `DISABLE_INJECTIONS` - "true" or "1" to disable SDK injection entirely, including tracking callbacks (default `false`)

#### GrowthBook SDK behavior
- `GROWTHBOOK_API_HOST` - Required
- `GROWTHBOOK_CLIENT_KEY` - Required
- `GROWTHBOOK_DECRYPTION_KEY` - Required when using an encrypted SDK Connection
<br /><br />
- `STALE_TTL` - In-memory SDK cache TTL (default 1 min = `60000`).
- `GROWTHBOOK_TRACKING_CALLBACK` - String representation of custom JavaScript client-side tracking callback.
- `ENABLE_STREAMING` - "true" or "1" to enable front-end SSE streaming (default `false`)
- `ENABLE_STICKY_BUCKETING` - "true" or "1" to enable Sticky Bucketing, cookie-based by default (default `false`)
- `STICKY_BUCKET_PREFIX` - The name prefix for Sticky Bucketing cookies (default `gbStickyBuckets__`)

#### User Attribute behavior
- `PERSIST_UUID` - "true" or "1" to write the user's ID to cookie from the edge server instead of from the browser (default `false`)
- `NO_AUTO_COOKIES` - "true" or "1" to avoid writing any cookies (excluding Sticky Buckets) until user permission is granted on front-end via `document.dispatchEvent(new CustomEvent("growthbookpersist"));` (default `false`)
- `UUID_COOKIE_NAME` - Customize the cookie name for persisting the user's ID (default `gbuuid`)
- `UUID_KEY` - Customize the user identifier name (default `id`)
- `SKIP_AUTO_ATTRIBUTES` "true" or "1" to skip auto-generating targeting attributes (default `false`)

#### Misc
- `CONTENT_SECURITY_POLICY` - CSP header value

## Further reading

See the Edge App [documentation](https://docs.growthbook.io/lib/edge/other) for more details and examples.
