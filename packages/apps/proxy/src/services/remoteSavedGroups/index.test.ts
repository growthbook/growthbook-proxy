import type { FeatureApiResponse } from "@growthbook/growthbook";
import { Context } from "../../types";

const hash: Record<string, string> = {};
const redis = {
  on: jest.fn(),
  hget: jest.fn(async (_key: string, field: string) => hash[field] ?? null),
  hgetall: jest.fn(async () => ({ ...hash })),
  smembers: jest.fn(async () => []),
};
jest.mock("@growthbook/remote-saved-groups-redis-loader", () => ({
  ...jest.requireActual("@growthbook/remote-saved-groups-redis-loader"),
  createRedisClient: () => redis,
  warnIfRedisCanEvict: async () => {},
}));

const payloads: Record<string, FeatureApiResponse> = {};
const getCached = jest.fn(async (apiKey: string) =>
  payloads[apiKey] ? { payload: payloads[apiKey] } : undefined,
);
jest.mock("../cache", () => ({
  featuresCache: { get: (apiKey: string) => getCached(apiKey) },
}));
const publishBeacon = jest.fn();
jest.mock("../eventStreamManager", () => ({
  eventStreamManager: {
    getSubscribedApiKeys: () => ["withGroups", "withoutGroups", "notCached"],
    publishBeacon: (apiKey: string) => publishBeacon(apiKey),
  },
}));
jest.mock("../registrar", () => ({
  registrar: {
    getAllConnections: () => ({
      withGroups: { remoteEvalEnabled: true },
      withoutGroups: { remoteEvalEnabled: true },
      notCached: { remoteEvalEnabled: true },
      unsubscribed: { remoteEvalEnabled: true },
    }),
  },
}));

import {
  initializeRemoteSavedGroups,
  prepareRemoteGroups,
  remoteGroupUpdateWatcher,
} from "./index";

function getWatcher() {
  if (!remoteGroupUpdateWatcher) throw new Error("No watcher");
  return remoteGroupUpdateWatcher;
}

describe("remote group change beacons", () => {
  beforeAll(() => {
    Object.assign(hash, {
      grp_1: "id",
      __updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const withGroups = {
      features: {
        a: {
          rules: [{ condition: { __gb_remoteGroupIds: { $in: ["grp_1"] } } }],
        },
      },
      dateUpdated: "2025-01-01T00:00:00.000Z",
    };
    payloads.withGroups = withGroups;
    payloads.unsubscribed = withGroups;
    payloads.withoutGroups = { features: { b: { defaultValue: 1 } } };
    initializeRemoteSavedGroups({
      remoteSavedGroupsSettings: {
        engine: "redis",
        connectionUrl: "redis://localhost:6379",
        runLoader: false,
        timeoutMs: 50,
        updateCheckIntervalMs: 60000,
      },
    } as Context);
  });
  afterAll(() => remoteGroupUpdateWatcher?.stop());
  beforeEach(() => {
    publishBeacon.mockReset();
    getCached.mockClear();
  });

  it("refreshes the group state, then notifies subscribed clients", async () => {
    await getWatcher().check();
    const before = await prepareRemoteGroups(payloads.withGroups);
    expect(before?.dateUpdated?.startsWith("2026-01-01")).toBe(true);

    hash.__updatedAt = "2026-02-01T00:00:00.000Z";
    // What a client refetching right after the beacon would get
    const seen: (string | undefined)[] = [];
    publishBeacon.mockImplementation(async (apiKey: string) => {
      if (apiKey !== "withGroups") return;
      seen.push((await prepareRemoteGroups(payloads.withGroups))?.dateUpdated);
    });
    await getWatcher().check();
    expect(publishBeacon.mock.calls).toEqual([["withGroups"], ["notCached"]]);
    expect(getCached).not.toHaveBeenCalledWith("unsubscribed");
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen[0]?.startsWith("2026-02-01")).toBe(true);
  });

  it("times out a read that never settles, and checks again next time", async () => {
    redis.hget.mockReturnValueOnce(new Promise<never>(() => {}));
    await getWatcher().check();
    expect(publishBeacon).not.toHaveBeenCalled();

    hash.__updatedAt = "2026-03-01T00:00:00.000Z";
    await getWatcher().check();
    expect(publishBeacon).toHaveBeenCalledWith("withGroups");
  });

  it("times out a cache read that never settles, and still sends the beacon", async () => {
    getCached.mockImplementation(async (apiKey: string) => {
      if (apiKey === "withGroups") return new Promise<never>(() => {});
      return payloads[apiKey] ? { payload: payloads[apiKey] } : undefined;
    });
    hash.__updatedAt = "2026-04-01T00:00:00.000Z";
    await getWatcher().check();
    expect(publishBeacon.mock.calls).toEqual([["withGroups"], ["notCached"]]);

    getCached.mockImplementation(async (apiKey: string) =>
      payloads[apiKey] ? { payload: payloads[apiKey] } : undefined,
    );
    publishBeacon.mockReset();
    hash.__updatedAt = "2026-05-01T00:00:00.000Z";
    await getWatcher().check();
    expect(publishBeacon.mock.calls).toEqual([["withGroups"], ["notCached"]]);
  });
});
