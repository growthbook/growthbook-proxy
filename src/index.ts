import express, {Request, Response} from "express";
import cors from 'cors';
import {getFeatures, postFeatures} from "./controllers/featuresController";
import {getSubscribeToSse} from "./controllers/streamEventsController";
import apiKeyMiddleware from "./middleware/apiKeyMiddleware";
import proxyMiddleware from "./middleware/proxyMiddleware";
import init from "./init";
import webhookVerificationMiddleware from "./middleware/webhookVerificationMiddleware";
// import telemetryMiddleware from "./middleware/telemetryMiddleware";
import dotenv from 'dotenv';
import {broadcastSseMiddleware} from "./middleware/broadcastSseMiddleware";
dotenv.config({ path: "./.env.local" });

const { app } = init();

app.use(cors())

app.use(apiKeyMiddleware);

// proxy clients' "get features" endpoint call to GrowthBook, with cache layer
app.get('/api/features/*', getFeatures);

// subscribe clients to streaming updates
app.get('/sub/:apiKey', getSubscribeToSse);

// subscribe to GrowthBook's "post features" updates, refresh cache, publish to subscribed clients
app.post('/proxy/features',
  express.json({
    verify: (req: Request, res: Response, buf: Buffer) => res.locals.rawBody = buf
  }),
  webhookVerificationMiddleware,
  broadcastSseMiddleware,
  postFeatures,
);

// app.use(telemetryMiddleware);

// proxy anything else through to GrowthBook
app.all('/*', proxyMiddleware);
