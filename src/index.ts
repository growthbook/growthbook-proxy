import express, {Request, Response} from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import {getFeatures, postFeatures} from "./controllers/featuresController";
import streamEventsController from "./controllers/streamEventsController";
import apiKeyMiddleware from "./middleware/apiKeyMiddleware";
import proxyMiddleware from "./middleware/proxyMiddleware";
import init, {API_URL} from "./init";
import {registrar} from "./services/registrar";
import webhookVerificationMiddleware from "./middleware/webhookVerificationMiddleware";
// import telemetryMiddleware from "./middleware/telemetryMiddleware";
dotenv.config({ path: "./.env.local" });

const { app } = init();

app.use(cors())

// proxy clients' "get features" endpoint call to GrowthBook, with cache layer
app.get('/api/features/*', apiKeyMiddleware, getFeatures);

// subscribe clients to streaming updates
app.get('/sub/:apiKey', apiKeyMiddleware, streamEventsController);

// subscribe to GrowthBook's "post features" updates, refresh cache, publish to subscribed clients
app.post('/proxy/features',
  apiKeyMiddleware,
  express.json({
    verify: (req: Request, res: Response, buf: Buffer) => {
      res.locals.rawBody = buf;
    }
  }),
  webhookVerificationMiddleware,
  postFeatures
);

// app.use(telemetryMiddleware);

// proxy anything else through to GrowthBook
app.all('/*', proxyMiddleware({targetUrl: API_URL}));
