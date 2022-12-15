import express, {Request, Response, NextFunction} from 'express';
import dotenv from 'dotenv';
import {createProxyMiddleware, responseInterceptor} from "http-proxy-middleware";
dotenv.config({ path: "./.env.local" });

// Proxy configuration:
const PROXY_PORT = process.env?.PORT ?? 3200;
const API_URL = process.env?.API_URL ?? "http://localhost:3100";

// Routes:
const RE_API_KEY = /api\/.+\/([^\/]*)\/?$/;
const RE_FEATURES_ROUTE = /api\/features\/(?:[^\/]*)\/?(?:\?[^\/]*)?$/;

// In-memory cache:
let cachedDefinitions: {[apiKey: string]: any} = {};


const app = express();

app.listen(PROXY_PORT, () => {
  console.log(`GrowthBook proxy running at https://localhost:${PROXY_PORT}`);
});

const proxyMiddleware = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  selfHandleResponse: true,
});

const proxyMiddlewareWithCacheSetter = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  selfHandleResponse: true,
  onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: Request, res: Response) => {
    console.log('cache MISS, setting cache...');
    const response = responseBuffer.toString('utf-8');
    let responseJson = {};
    try {
      responseJson = JSON.parse(response);
      if (res.locals?.apiKey) {
        cachedDefinitions[res.locals?.apiKey] = responseJson;
      }
    } catch(e) {
      console.error("Unable to parse response", e);
    }
    return response;
  })
});

const telemetryMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`sending stats from ${req.originalUrl} somewhere...`);
  setTimeout(() => {
    console.log('stats sent')
  }, 2000);
  next();
};

app.get('/proxyhealth', (req, res, next) => {
  return res.send("healthy");
});
app.get('/proxycachedfeatures', (req, res, next) => {
  console.log(cachedDefinitions);
  return res.json(cachedDefinitions);
})
app.post('/proxyfeatures', express.json(), (req: Request, res: Response, next: NextFunction) => {
  console.log(req.body)
  for (const key in cachedDefinitions) {
    try {
      cachedDefinitions[key] = {
        ...cachedDefinitions[key],
        dateUpdated: req.body.dateUpdated,
        features: req.body.features,
      };
    } catch(e) {
      console.error("Unable to update features", key);
    }
  }
  return res.send("new features!");
})

app.use(telemetryMiddleware);

app.use('*', (req, res, next) => {
  const apiKey = req.originalUrl.match(RE_API_KEY)?.[1] ?? "";
  res.locals.apiKey = apiKey;
  if (req.method === "GET" && req.originalUrl.match(RE_FEATURES_ROUTE)) {
    console.log('features endpoint. key:', apiKey)
    if (apiKey && !cachedDefinitions[apiKey]) {
      proxyMiddlewareWithCacheSetter(req, res, next);
    } else {
      console.log("cache HIT");
      res.header("Access-Control-Allow-Origin", "*")
      return res.send(
          JSON.stringify(cachedDefinitions[apiKey])
      );
    }
  } else {
    proxyMiddleware(req, res, next);
  }
});
