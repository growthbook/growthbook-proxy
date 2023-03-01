import { Request, Response } from "express";
import logger from "../logger";
import { Context } from "../../types";
import { SSEChannel, Options } from "./ssePubsub";

const defaultOptions: Partial<Options> = {
  historySize: 1,
};

interface ScopedChannel {
  apiKey: string;
  channel: SSEChannel;
}

export class SSEManager {
  private scopedChannels = new Map<string, ScopedChannel>();

  private ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  public subscribe(req: Request, res: Response) {
    const apiKey = res.locals.apiKey;
    if (apiKey) {
      let scopedChannel;
      try {
        scopedChannel = this.getScopedChannel(apiKey);
      } catch (e) {
        logger.error(e, "Unable to get SSE channel");
      }
      if (scopedChannel) {
        try {
          scopedChannel.channel.subscribe(req, res);

          logger.info(
            this.getSubscriberCounts(),
            `EventSource subscriber counts`
          );
        } catch (e) {
          logger.error(e, "Unable to subscribe to SSE channel");
        }
      } else {
        logger.error("Unable to get SSE channel");
      }
    }
  }

  public getSubscriberCount(apiKey: string): number | null {
    const scopedChannel = this.getScopedChannel(apiKey);
    if (scopedChannel) {
      return scopedChannel.channel.getSubscriberCount();
    }
    return null;
  }

  public getSubscriberCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.scopedChannels.forEach((scopedChannel) => {
      counts[scopedChannel.apiKey] = scopedChannel.channel.getSubscriberCount();
    });
    return counts;
  }

  public publish(
    apiKey: string,
    event: string,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    payload: any,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    oldPayload?: any,
    ctx?: Context
  ) {
    ctx?.verboseDebugging &&
      logger.info(
        { apiKey, event, payload, oldPayload },
        "EventStreamManager.publish"
      );
    const scopedChannel = this.getScopedChannel(apiKey);
    if (scopedChannel) {
      if (oldPayload === undefined) {
        ctx?.verboseDebugging &&
          logger.info({ payload, event }, "publishing SSE");
        scopedChannel.channel.publish(payload, event);
      } else {
        const hasChanges =
          JSON.stringify(payload) !== JSON.stringify(oldPayload);
        if (hasChanges) {
          ctx?.verboseDebugging &&
            logger.info({ payload, event }, "publishing SSE");
          scopedChannel.channel.publish(payload, event);
          return;
        }
        ctx?.verboseDebugging &&
          logger.info({ payload, event }, "skipping SSE publish, no changes");
      }
      return;
    }
    ctx?.verboseDebugging && logger.info("No scoped channel found");
  }

  private getScopedChannel(apiKey: string): ScopedChannel | undefined {
    let scopedChannel = this.scopedChannels.get(apiKey);
    if (!scopedChannel) {
      this.scopedChannels.set(apiKey, {
        apiKey,
        channel: new SSEChannel(defaultOptions, this.ctx),
      });
      scopedChannel = this.scopedChannels.get(apiKey);
    }
    return scopedChannel;
  }
}

export type EventStreamManager = SSEManager | null;
export let eventStreamManager: SSEManager | null = null;

export const initializeEventStreamManager = (ctx: Context) => {
  if (ctx.enableEventStream) {
    eventStreamManager = new SSEManager(ctx);
  }
  Object.freeze(eventStreamManager);
};
