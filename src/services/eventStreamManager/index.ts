import { Request, Response } from "express";
const SSEChannel = require("sse-pubsub");

// START hacky TS binding for sse-pubsub
interface SSEChannel {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  constructor: (options: SSEChannelOptions) => void;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  publish: (data: any, eventName: string) => number;
  subscribe: (
    req: Request,
    res: Response,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    events?: any[]
    /* eslint-disable @typescript-eslint/no-explicit-any */
  ) => { req: Request; res: Response; events?: any[] };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  unsubscribe: (c: { req: Request; res: Response; events?: any[] }) => void;
  close: () => void;
  listClients: () => { [ip: string]: number };
  getSubscriberCount: () => number;
}
interface SSEChannelOptions {
  pingInterval?: number; // default 3000
  maxStreamDuration?: number; // default 30000
  clientRetryInterval?: number; // default 1000
  startId?: number; // default 1
  historySize?: number; // default 100
  rewind?: number; // default 0
}
// END hacky TS binding for sse-pubsub

const defaultOptions: SSEChannelOptions = {
  historySize: 1,
};

interface ScopedChannel {
  apiKey: string;
  channel: SSEChannel;
}

export class EventStreamManager {
  private scopedChannels = new Map<string, ScopedChannel>();

  public subscribe(req: Request, res: Response) {
    const apiKey = res.locals.apiKey;
    if (apiKey) {
      let scopedChannel;
      try {
        scopedChannel = this.getScopedChannel(apiKey);
      } catch (e) {
        console.error("Unable to get SSE channel", e);
      }
      if (scopedChannel) {
        try {
          scopedChannel.channel.subscribe(req, res);
        } catch (e) {
          console.error("Unable to subscribe to SSE channel", e);
        }
      } else {
        console.error("Unable to get SSE channel");
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

  public publish(apiKey: string, event: string, payload: any) {
    const scopedChannel = this.getScopedChannel(apiKey);
    if (scopedChannel) {
      scopedChannel.channel.publish(payload, event);
    }
  }

  private getScopedChannel(apiKey: string): ScopedChannel | undefined {
    let scopedChannel = this.scopedChannels.get(apiKey);
    if (!scopedChannel) {
      this.scopedChannels.set(apiKey, {
        apiKey,
        channel: new SSEChannel(defaultOptions),
      });
      scopedChannel = this.scopedChannels.get(apiKey);
    }
    return scopedChannel;
  }
}

export const eventStreamManager = new EventStreamManager();
Object.freeze(eventStreamManager);
