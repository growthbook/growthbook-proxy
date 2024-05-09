import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request, Response } from "express";
import { edgeApp } from "@growthbook/edge-utils";
import { init } from "@growthbook/edge-express";
import dotenv from "dotenv";
dotenv.config({ path: "./example/.env.local" });

const PROXY_PORT = 3301;

function createServer() {
  const app = express();
  app.listen(PROXY_PORT, () => {
    console.info(
      `GrowthBook edge for Express running over HTTP1.1, port ${PROXY_PORT}`,
    );
  });
  return app;
}

(async () => {
  const app = createServer();

  app.use(cors());
  app.use(cookieParser());

  app.all("/*", async (req, res, next) => {
    const context = await init(process.env);

    // for Lambda@edge, consider mapping custom headers to config:
    //
    // const env = mapHeadersToConfigEnv(req);
    // const context = await init(env);

    return edgeApp(
      context,
      req as unknown as Request,
      res as unknown as Response,
      /* eslint-disable @typescript-eslint/no-explicit-any */
      next as any,
    );
  });
})();
