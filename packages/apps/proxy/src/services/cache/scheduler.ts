import { Context } from "../../types";
import { registrar } from "../registrar";
import { featuresCache } from "./index";
import { fetchFeatures } from "../features";
import logger from "../logger";
import { CacheRefreshStrategy } from "../../types";

export class CacheRefreshScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly ctx: Context;
  private readonly staleTTL: number;

  constructor(ctx: Context) {
    this.ctx = ctx;
    this.staleTTL = (ctx.cacheSettings?.staleTTL || 60) * 1000;

    const strategy: CacheRefreshStrategy = ctx.cacheSettings?.cacheRefreshStrategy || "stale-while-revalidate";
    
    if (strategy === "none" || strategy === "schedule") {
      // Single fetch on bootup if stale, then never refresh again
      const connections = registrar.getAllConnections();
      for (const apiKey in connections) {
        const connection = connections[apiKey];
        this.maybeFetch(apiKey, connection);
      }
      if (strategy === "none") return;
    }

    // "schedule" strategy - periodic refreshes
    if (strategy === "schedule") {
      this.intervalId = setInterval(() => {
      const connections = registrar.getAllConnections();
      for (const apiKey in connections) {
        const connection = connections[apiKey];
        const jitter = Math.min(this.staleTTL * 0.2, 30000) * Math.random(); // 0 to min(20%, 30sec)
        setTimeout(() => this.maybeFetch(apiKey, connection), jitter);
      }
      }, this.staleTTL);
    }
  }

  private async maybeFetch(apiKey: string, connection: any) {
    if (!featuresCache) return;

    try {
      const entry = await featuresCache.get(apiKey);
      // Only fetch if stale
      if (entry?.staleOn && entry.staleOn < new Date()) {
        logger.debug({ apiKey }, "Scheduled cache refresh");
        await fetchFeatures({
          apiKey,
          ctx: this.ctx,
          remoteEvalEnabled: !!connection?.remoteEvalEnabled,
          organization: connection?.organization,
        });
      }
    } catch (error) {
      logger.error({ error, apiKey }, "Scheduled cache refresh failed");
    }
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

