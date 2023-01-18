import pinoHttp, { HttpLogger } from "pino-http";
import { Context } from "../types";

let logger: HttpLogger["logger"] = pinoHttp().logger;
export default logger;

export const initializeLogger = (context: Context) => {
  const environment = context.environment || "production";
  const l = pinoHttp({
    autoLogging: environment === "production",
    level: environment === "production" ? "warn" : "debug",
    redact: {
      paths: [
        "req.headers.authorization",
        'req.headers["if-none-match"]',
        'req.headers["cache-control"]',
        'req.headers["upgrade-insecure-requests"]',
        "req.headers.cookie",
        "req.headers.connection",
        'req.headers["accept"]',
        'req.headers["accept-encoding"]',
        'req.headers["accept-language"]',
        'req.headers["sec-fetch-site"]',
        'req.headers["sec-fetch-mode"]',
        'req.headers["sec-fetch-dest"]',
        'req.headers["sec-ch-ua-mobile"]',
        'req.headers["sec-ch-ua"]',
        'req.headers["sec-fetch-user"]',
        "res.headers.etag",
        'res.headers["x-powered-by"]',
        'res.headers["access-control-allow-credentials"]',
        'res.headers["access-control-allow-origin"]',
        'res.headers["X-GrowthBook-Signature"]',
        'res.headers["x-admin-key"]',
      ],
      remove: true,
    },
  });
  logger = l.logger;
};
