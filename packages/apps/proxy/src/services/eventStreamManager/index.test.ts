import { EventEmitter } from "events";
import { Request, Response } from "express";
import { Context } from "../../types";
import { IDLE_CHANNEL_TTL_MS, SSEManager } from "./index";

const fakeConnection = (apiKey: string) => {
  const res = Object.assign(new EventEmitter(), {
    locals: { apiKey },
    writeHead: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  });
  const req = { headers: {} };
  return { req: req as unknown as Request, res: res as unknown as Response };
};

const newManager = () =>
  new SSEManager({
    eventStreamMaxDurationMs: 0,
    eventStreamPingIntervalMs: 0,
  } as unknown as Context);

describe("SSEManager.removeIdleChannels", () => {
  it("removes channels that have been empty past the TTL", () => {
    const manager = newManager();
    const { req, res } = fakeConnection("key");
    manager.subscribe(req, res);
    res.emit("close");

    manager.removeIdleChannels(Date.now() + IDLE_CHANNEL_TTL_MS - 1000);
    expect(Object.keys(manager.getSubscriberCounts())).toEqual(["key"]);

    manager.removeIdleChannels(Date.now() + IDLE_CHANNEL_TTL_MS);
    expect(manager.getSubscriberCounts()).toEqual({});
  });

  it("keeps channels that have subscribers", () => {
    const manager = newManager();
    const { req, res } = fakeConnection("key");
    manager.subscribe(req, res);

    manager.removeIdleChannels(Date.now() + IDLE_CHANNEL_TTL_MS * 2);
    expect(manager.getSubscriberCounts()).toEqual({ key: 1 });
  });

  it("removes channels that were published to but never subscribed", () => {
    const manager = newManager();
    manager.publish({ apiKey: "key", event: "features", payload: { a: 1 } });

    manager.removeIdleChannels(Date.now() + IDLE_CHANNEL_TTL_MS);
    expect(manager.getSubscriberCounts()).toEqual({});
  });
});
