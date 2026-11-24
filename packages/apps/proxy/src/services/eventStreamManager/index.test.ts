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

  it("replays updates to clients reconnecting after their channel was removed", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1000);
    const manager = newManager();
    const first = fakeConnection("key");
    manager.subscribe(first.req, first.res);
    manager.publish({ apiKey: "key", event: "features", payload: { v: 1 } });
    const lastId = (first.res.write as jest.Mock).mock.calls
      .map(([out]) => /^id: (\d+)/.exec(out)?.[1])
      .find(Boolean);
    first.res.emit("close");

    now.mockReturnValue(1000 + IDLE_CHANNEL_TTL_MS);
    manager.removeIdleChannels();
    manager.publish({ apiKey: "key", event: "features", payload: { v: 2 } });

    const second = fakeConnection("key");
    second.req.headers["last-event-id"] = lastId;
    manager.subscribe(second.req, second.res);
    expect((second.res.write as jest.Mock).mock.calls[0][0]).toContain('"v":2');
    now.mockRestore();
  });

  it("removes channels that were published to but never subscribed", () => {
    const manager = newManager();
    manager.publish({ apiKey: "key", event: "features", payload: { a: 1 } });

    manager.removeIdleChannels(Date.now() + IDLE_CHANNEL_TTL_MS);
    expect(manager.getSubscriberCounts()).toEqual({});
  });
});
