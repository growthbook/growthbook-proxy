import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as featuresController from "./controllers/featuresController";
import streamEventsController from "./controllers/streamEventsController";
import apiKeyMiddleware from "./middleware/apiKeyMiddleware";
import proxyMiddleware from "./middleware/proxyMiddleware";
import init, {API_URL} from "./init";
// import telemetryMiddleware from "./middleware/telemetryMiddleware";
dotenv.config({ path: "./.env.local" });

const { app } = init();

app.use(cors())

app.use(['/api/*', '/sub/:apiKey'], apiKeyMiddleware);

app.get('/sub/:apiKey', streamEventsController);

app.get('/api/features/*', featuresController.getFeatures);

app.post('/proxy/features', express.json(), featuresController.postFeatures);

// app.use(telemetryMiddleware);

app.all('/*', proxyMiddleware({targetUrl: API_URL}));
