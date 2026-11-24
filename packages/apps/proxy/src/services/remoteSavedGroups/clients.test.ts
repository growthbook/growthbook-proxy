import { Context } from "../../types";

const created: { settings: unknown; client: { on: jest.Mock } }[] = [];
jest.mock("@growthbook/remote-saved-groups-redis-loader", () => ({
  ...jest.requireActual("@growthbook/remote-saved-groups-redis-loader"),
  createRedisClient: (settings: unknown) => {
    const client = { on: jest.fn() };
    created.push({ settings, client });
    return client;
  },
  createLoader: () => ({ start: jest.fn() }),
  warnIfRedisCanEvict: async () => {},
}));
jest.mock("../cache", () => ({ featuresCache: null }));
jest.mock("../eventStreamManager", () => ({ eventStreamManager: null }));
jest.mock("../registrar", () => ({ registrar: null }));

import { initializeRemoteSavedGroups, remoteSavedGroupsClients } from "./index";

describe("remote saved groups Redis clients", () => {
  it("get the cluster options, and are exposed", () => {
    expect(remoteSavedGroupsClients).toEqual({ lookups: null, loader: null });

    const clusterRootNodes = [{ host: "node-1", port: 7000 }];
    const clusterOptions = {
      redisOptions: { tls: {}, username: "groups", password: "secret" },
    };
    initializeRemoteSavedGroups({
      growthbookApiHost: "http://localhost:3100",
      secretApiKey: "key",
      remoteSavedGroupsSettings: {
        engine: "redis",
        useCluster: true,
        clusterRootNodesJSON: clusterRootNodes,
        clusterOptionsJSON: clusterOptions,
        runLoader: true,
        storeId: "redis-test",
        updateCheckIntervalMs: 0,
      },
    } as Context);

    const settings = {
      connectionUrl: undefined,
      useCluster: true,
      clusterRootNodes,
      clusterOptions,
    };
    expect(created.map((c) => c.settings)).toEqual([settings, settings]);
    expect(remoteSavedGroupsClients.lookups).toBe(created[0].client);
    expect(remoteSavedGroupsClients.loader).toBe(created[1].client);
  });
});
