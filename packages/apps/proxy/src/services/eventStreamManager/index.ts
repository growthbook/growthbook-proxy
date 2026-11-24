import { Request, Response } from "express";
import logger, { truncatePayloadForLogging } from "../logger";
import { Context } from "../../types";
import { payloadChanged } from "../payloadChanged";
import { SSEChannel } from "./ssePubsub";

interface ScopedChannel {
  apiKey: string;
  channel: SSEChannel;
}

export type EventType = "features" | "features-updated";

// Long enough for a dropped client to reconnect and replay what it missed
export const IDLE_CHANNEL_TTL_MS = 5 * 60 * 1000;

export class SSEManager {
  private scopedChannels = new Map<string, ScopedChannel>();

  private appContext: Context;

  constructor(appContext: Context) {
    this.appContext = appContext;
    setInterval(() => this.removeIdleChannels(), 60 * 1000).unref();
  }

  public removeIdleChannels(now = Date.now()) {
    this.scopedChannels.forEach(({ channel }, apiKey) => {
      if (
        channel.emptySince !== null &&
        now - channel.emptySince >= IDLE_CHANNEL_TTL_MS
      ) {
        channel.close();
        this.scopedChannels.delete(apiKey);
      }
    });
  }

  public subscribe(req: Request, res: Response) {
    if (this.appContext?.verboseDebugging) {
      logger.info("EventStreamManager.subscribe");
    }
    const apiKey = res.locals.apiKey;
    if (apiKey) {
      let scopedChannel;
      try {
        scopedChannel = this.getScopedChannel(apiKey);
      } catch (e) {
        logger.error({ err: e }, "Unable to get SSE channel");
      }
      if (scopedChannel) {
        try {
          scopedChannel.channel.subscribe(req, res);

          if (this.appContext?.verboseDebugging) {
            logger.info(
              this.getSubscriberCounts(),
              `EventSource subscriber counts`,
            );
          }
        } catch (e) {
          logger.error({ err: e }, "Unable to subscribe to SSE channel");
        }
      } else {
        logger.error({ apiKey }, "Unable to get SSE channel");
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

  /** The connections that have streaming subscribers. */
  public getSubscribedApiKeys(): string[] {
    return [...this.scopedChannels.values()]
      .filter(({ channel }) => channel.getSubscriberCount() > 0)
      .map(({ apiKey }) => apiKey);
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
    if (this.appContext?.verboseDebugging) {
      logger.info(
        {
          apiKey,
          event,
          payload: truncatePayloadForLogging(payload),
          oldPayload: truncatePayloadForLogging(oldPayload),
        },
        "EventStreamManager.publish",
      );
    }
    const scopedChannel = this.getScopedChannel(apiKey);
    if (!scopedChannel) {
      if (this.appContext?.verboseDebugging) {
        logger.info("No scoped channel found");
      }
      return;
    }

    const hasChanges = payloadChanged(payload, oldPayload);
    if (!hasChanges) {
      if (this.appContext?.verboseDebugging) {
        logger.info(
          { payload: truncatePayloadForLogging(payload), event },
          "skipping SSE publish, no changes",
        );
      }
      return;
    }

    if (event === "features-updated") {
      // change payload to a "please refetch" beacon
      payload = "";
    }
    scopedChannel.channel.publish(payload, event);
  }

  /**
   * Tells a connection's subscribers to refetch, though its payload hasn't
   * changed, like when remote saved group memberships change. Only for
   * connections that already have a channel.
   */
  public publishBeacon(apiKey: string) {
    const scopedChannel = this.scopedChannels.get(apiKey);
    if (!scopedChannel) return;
    if (this.appContext?.verboseDebugging) {
      logger.info({ apiKey }, "EventStreamManager.publishBeacon");
    }
    scopedChannel.channel.publish("", "features-updated");
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
            // a channel recreated after removal must not reuse a reconnecting client's Last-Event-ID
            startId: Date.now(),
          },
          this.appContext,
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
