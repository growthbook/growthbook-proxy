import { EventEmitter } from "events";
import { Request, Response } from "express";
import { Context } from "../../types";
import { featuresCache } from "../cache";
import { SSEChannel } from "./ssePubsub";
import { SSEManager } from "./index";

jest.mock("../cache", () => ({ featuresCache: { get: jest.fn() } }));
jest.mock("../registrar", () => ({
  registrar: { getConnection: () => undefined },
}));

const cacheGet = featuresCache?.get as jest.Mock;

const fakeConnection = (apiKey: string, lastEventId?: number) => {
  const res = Object.assign(new EventEmitter(), {
    locals: { apiKey },
    writeHead: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  });
  const headers: Record<string, string> =
    lastEventId === undefined ? {} : { "last-event-id": String(lastEventId) };
  return {
    req: { headers } as unknown as Request,
    res: res as unknown as Response,
  };
};

const written = (res: Response) =>
  (res.write as jest.Mock).mock.calls.map((call) => call[0]).join("");

const V1 = Date.parse("2026-11-24T12:00:00.000Z");
const V2 = Date.parse("2026-11-24T12:05:00.000Z");
const payload = (dateUpdated: string, value: string) => ({
  dateUpdated,
  features: { flag: { defaultValue: value } },
});

describe("SSEChannel with content versions", () => {
  const channel = () => {
    const c = new SSEChannel({ pingInterval: 0, contentVersions: true });
    c.publish(payload("2026-11-24T12:05:00.000Z", "v2"), "features", V2);
    return c;
  };

  it("sends the latest payload to a new client with no Last-Event-ID", () => {
    const { req, res } = fakeConnection("key");
    channel().subscribe(req, res);
    expect(written(res)).toContain(`id: ${V2}`);
    expect(written(res)).toContain('"v2"');
  });

  it("sends the latest payload to a client with an older version", () => {
    const { req, res } = fakeConnection("key", V1);
    channel().subscribe(req, res);
    expect(written(res)).toContain('"v2"');
  });

  it("sends nothing to a client that already has the latest version", () => {
    const { req, res } = fakeConnection("key", V2);
    channel().subscribe(req, res);
    expect(written(res)).not.toContain("data:");
  });

  it("sends nothing to a client newer than this pod", () => {
    const { req, res } = fakeConnection("key", V2 + 60_000);
    channel().subscribe(req, res);
    expect(written(res)).not.toContain("data:");
  });
});

describe("SSEManager seeding from the shared cache", () => {
  const newManager = () =>
    new SSEManager({
      enableCache: true,
      cacheSettings: { cacheEngine: "redis", publishPayloadToChannel: true },
      eventStreamMaxDurationMs: 0,
      eventStreamPingIntervalMs: 0,
    } as unknown as Context);

  beforeEach(() => cacheGet.mockReset());

  it("seeds a cold channel so a new client gets the cached payload", async () => {
    cacheGet.mockResolvedValue({
      payload: payload("2026-11-24T12:05:00.000Z", "v2"),
    });
    const { req, res } = fakeConnection("key");
    await newManager().subscribe(req, res);
    expect(written(res)).toContain(`id: ${V2}`);
    expect(written(res)).toContain('"v2"');
  });

  it("still opens the stream when the cache read fails", async () => {
    cacheGet.mockRejectedValue(new Error("redis down"));
    const { req, res } = fakeConnection("key");
    await newManager().subscribe(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(written(res)).toContain("retry:");
    expect(written(res)).not.toContain("data:");
  });

  it("does not read the cache for a warm channel", async () => {
    cacheGet.mockResolvedValue({
      payload: payload("2026-11-24T12:05:00.000Z", "v2"),
    });
    const manager = newManager();
    const first = fakeConnection("key");
    await manager.subscribe(first.req, first.res);
    const second = fakeConnection("key");
    await manager.subscribe(second.req, second.res);
    expect(cacheGet).toHaveBeenCalledTimes(1);
    expect(written(second.res)).toContain('"v2"');
  });
});
