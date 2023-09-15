import { Request, Response } from "express";
import logger from "../logger";
import { Context } from "../../types";
import { SSEChannel } from "./ssePubsub";

interface ScopedChannel {
  apiKey: string;
  channel: SSEChannel;
}

export type EventType = "features" | "features-updated";

export class SSEManager {
  private scopedChannels = new Map<string, ScopedChannel>();

  private appContext: Context;

  constructor(appContext: Context) {
    this.appContext = appContext;
  }

  public subscribe(req: Request, res: Response) {
    this.appContext?.verboseDebugging &&
      logger.info("EventStreamManager.subscribe");
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

  public publish({
    apiKey,
    event,
    payload,
    oldPayload,
  }: {
    apiKey: string;
    event: EventType;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    payload: any;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    oldPayload?: any;
    remoteEvalEnabled?: boolean;
  }) {
    this.appContext?.verboseDebugging &&
      logger.info(
        { apiKey, event, payload, oldPayload },
        "EventStreamManager.publish"
      );
    const scopedChannel = this.getScopedChannel(apiKey);
    if (!scopedChannel) {
      this.appContext?.verboseDebugging &&
        logger.info("No scoped channel found");
      return;
    }

    const hasChanges = JSON.stringify(payload) !== JSON.stringify(oldPayload);
    if (!hasChanges) {
      this.appContext?.verboseDebugging &&
        logger.info({ payload, event }, "skipping SSE publish, no changes");
      return;
    }

    if (event === "features-updated") {
      // change payload to a "please refetch" beacon
      payload = "";
    }
    scopedChannel.channel.publish(payload, event);
  }

  public closeAll() {
    this.scopedChannels.forEach((scopedChannel) => {
      scopedChannel.channel.close();
    });
  }

  private getScopedChannel(apiKey: string): ScopedChannel | undefined {
    let scopedChannel = this.scopedChannels.get(apiKey);
    if (!scopedChannel) {
      this.scopedChannels.set(apiKey, {
        apiKey,
        channel: new SSEChannel(
          {
            maxStreamDuration: this.appContext.eventStreamMaxDurationMs,
            pingInterval: this.appContext.eventStreamPingIntervalMs,
          },
          this.appContext
        ),
      });
      scopedChannel = this.scopedChannels.get(apiKey);
    }
    return scopedChannel;
  }
}

export type EventStreamManager = SSEManager | null;
export let eventStreamManager: SSEManager | null = null;

export const initializeEventStreamManager = (appContext: Context) => {
  if (appContext.enableEventStream) {
    eventStreamManager = new SSEManager(appContext);
  }
  Object.freeze(eventStreamManager);
};
