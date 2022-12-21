import express, {Request, Response, NextFunction} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as featuresController from "./controllers/featuresController";
import streamEventsController from "./controllers/streamEventsController";
import apiKeyMiddleware from "./middleware/apiKeyMiddleware";
import proxyMiddleware from "./middleware/proxyMiddleware";
import init, {API_URL} from "./init";
dotenv.config({ path: "./.env.local" });
import telemetryMiddleware from "./middleware/telemetryMiddleware";
import longpoll from "./longpoll";


// // Routes:
// const RE_LONGPOLL_API_KEY = /.+\/([^\/]*)\/?$/;

const { app } = init();

app.use(cors())

app.use('/api/*', apiKeyMiddleware);
app.use('/sub/:apiKey', apiKeyMiddleware);

app.get('/sub/:apiKey', streamEventsController);
// const lp = longpoll(app);
//
// lp.create("/poll/*", (req: Request, res: Response, next: NextFunction) => {
//   const apiKey = req.originalUrl.match(RE_LONGPOLL_API_KEY)?.[1] ?? "";
//   console.log("longpoll endpoint...", req.originalUrl, apiKey)
//   res.header("Access-Control-Allow-Origin", "*");
//   if (apiKey) {
//     res.locals.apiKey = apiKey;
//     next();
//   } else {
//     return res.status(401).send("invalid API key");
//   }
// });
// setInterval(function () {
//   longpoll.publish("/poll", "publishing something: "+Math.random());
// }, 10000);

app.get('/proxyhealth', (req, res, next) => {
  return res.send("healthy");
});

app.post('/proxy/features', express.json(), featuresController.postFeatures);

// app.use(telemetryMiddleware);

app.get('/api/features/*', featuresController.getFeatures);

app.all('/*', proxyMiddleware({targetUrl: API_URL}));
