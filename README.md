# GrowthBook Proxy

[GrowthBook](https://www.growthbook.io) is a modular Feature Flagging and Experimentation platform.

The GrowthBook Proxy server for self-hosted clients sits between your application and GrowthBook. It turbocharges your GrowthBook implementation by providing **speed**, **scalability**, **security**, and **real-time** feature rollouts.

### Features:
- **Caching** - Significantly faster feature lookups!
  - Drivers:
    - MongoDB cache (reuse your existing GrowthBook MongoDB instance)
    - Redis cache (best for horizontally-scaled proxy servers)
    - In-memory cache
  - Minimizes cache misses via Stale While Revalidate (SWR).
  - MongoDB and Redis wrapped by a local in-memory cache layer.
- **Steaming** - Updates your application in real-time as features are changed or toggled.
  - Uses an Server Sent Event (SSE) pub-sub broadcast model.
  - Changes are applied immediately to active browser sessions (JS & React SDKs).
  - Also supports real-time backend updates over SSE.
- **Payload Encryption** - Supports encrypted feature payloads to the SDK.
- **Secure** - Private-key authentication between GrowthBook and GrowthBook Proxy.
- **Scalable** - Use a central cache system (Redis or MongoDB) and a load balancer to unlock horizontal scaling.
- **HTTP/2** - Supports HTTP/2 in app for faster communication and better SSE browser support.
- **Runs on edge** _(experimental)_ - Run GrowthBook Proxy on edge / CDN, minimizing latency for all your users.

### Coming soon:

- Server-side targeting and feature evaluation
- Batched tracking calls
- Additional support for edge deployments

## Installation

The GrowthBook Proxy may be implemented in a few different ways:
1. As a Dockerized Express application
2. As a stand-alone Express application
3. As an NPM library to be included within your own Express application

<section style="padding: 0 20px; border: 1px solid rgba(150,150,150,.25)">
<h3>1. Docker</h3>

```bash
git clone https://github.com/growthbook-proxy/growthbook-proxy.git
cd growthbook-proxy
```
You will need to provide a few configuration environment variables. Create a file in the project root called `.env`, and provide the following values:
- `API_HOST` - The URL of your GrowthBook API server.
- `AUTHENTICATED_API_HOST` - The URL of your Authenticated GrowthBook API server (typically the same URL).
- `AUTHENTICATED_API_SIGNING_KEY` - Your secret API key, generated in your GrowthBook app in **Settings** > **Api Keys**

Example:
```
API_HOST="http://host.docker.internal:3100"
AUTHENTICATED_API_HOST="http://host.docker.internal:3100"
AUTHENTICATED_API_SIGNING_KEY="_MY_SECRET_KEY_"
```

Then, run the following command to start the proxy:
```bash
docker-compose up -d
```
The proxy runs by default on port `3200`. To change this:
- specify a new `PORT` in your `.env` file.
- modify `docker-compose.yml` to reflect the change.
</section>

<br>
<section style="padding: 0 20px; border: 1px solid rgba(150,150,150,.5)">
<h3>2. Stand-alone Express application</h3>

Very similar to the Dockerized version above, but easier to customize.

```bash
git clone https://github.com/growthbook-proxy/growthbook-proxy.git
cd growthbook-proxy
```

Next, create a `.env` file in the same manner as above.

Then, compile the application:
```bash
npm install
npm run build
```
or `yarn install`, `yarn build`.

Finally, start the application:
```bash
npm start
```
or `yarn start`.

To change the port from `3200`, just specify a new `PORT` in your `.env` file.

<h4>Additional customization</h4>

The stand-alone Express application is a bit more customizable than the Dockerized equivalent. A bit of context...

The Express app entrypoint is `src/index.ts`. It runs `src/init.ts` to create an Express app and generate a Context for the GrowthBook Proxy application. It then binds the GrowthBook Proxy application to the Express app.

You can quickly customize the Context or Express app behavior by modifying `src/init.ts`. Some examples are provided in the init.ts; see the Context interface in `src/types.ts` for more information.
</section>
<br>

<section style="padding: 0 20px; border: 1px solid rgba(150,150,150,.25)">
<h3>3. NPM package in custom Express application</h3>

You may wish to roll your own Express application entirely and &ndash; rather than using this codebase as a template &ndash; attach the GrowthBook Proxy application to your own Express app.

```bash
npm install growthbook-proxy
```
or `yarn add growthbook-proxy`.

Then, in your Express app, you can attach the GrowthBook Proxy application:
```ts
import { growthBookProxy } from "growthbook-proxy";

const app = express();
app.listen(PROXY_PORT);

const context = {
  // your proxy configuration items
  apiHost: "http://growthbook.mydomain.com",
  authenticatedApiHost: "http://api.growthbook.mydomain.com",
  authenticatedApiSigningKey: AUTHENTICATED_API_SIGNING_KEY, // do not paste secrets as raw text!!
  // ... other context items
};

const proxy = await growthBookProxy(app, context);
```

You can also hook into GrowthBook Proxy's public interface. Some examples:
```ts
// List the active SDK Connections registered with the proxy
const connections = proxy.services.registrar.getAllConnections();
console.log("Connections: ", connections);

// Use SSE to push a custom event to all connected SDKs
// (you'd need to apply some custom glue in the frontend to handle this)
proxy.services.eventStreamManager.publish("apiKey_1234", "customMessage", {
  message: "Hello apiKey_1234 subscribers!",
});
```
</section>
<br>
