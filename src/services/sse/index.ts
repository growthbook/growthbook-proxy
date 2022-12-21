import {Request, Response} from 'express';
const SSEChannel = require('sse-pubsub');

interface SSEChannel {
  constructor: (options: any) => void;
  publish: (data: any, eventName: string) => number;
  subscribe: (req: Request, res: Response, events?: any[]) => {req: Request, res: Response, events?: any[]};
  unsubscribe: (c: {req: Request, res: Response, events?: any[]}) => void;
  close: () => void;
  listClients: () => {[ip: string]: number};
  getSubscriberCount: () => number;
}

interface ScopedChannel {
  apiKey: string;
  channel: SSEChannel;
}

export class ChannelManager {
  private scopedChannels = new Map<string, ScopedChannel>();

  public subscribe(req: Request, res: Response) {
    const apiKey = res.locals.apiKey;
    if (apiKey) {
      let scopedChannel;
      try {
        scopedChannel = this.getScopedChannel(apiKey);
      } catch(e) {
        console.error("Unable to get SSE channel", e);
      }
      if (scopedChannel) {
        try {
          scopedChannel.channel.subscribe(req, res);
        } catch(e) {
          console.error("Unable to subscribe to SSE channel", e);
        }
      } else {
        console.error("Unable to get SSE channel");
      }
    }
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
        channel: new SSEChannel(),
      });
      scopedChannel = this.scopedChannels.get(apiKey);
    }
    return scopedChannel;
  }
}

export const channelManager = new ChannelManager();
