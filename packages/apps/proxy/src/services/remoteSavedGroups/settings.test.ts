import { checkRemoteSavedGroupsSettings } from "./settings";

const redis = { connectionUrl: "redis://groups.internal:6379" };

describe("checkRemoteSavedGroupsSettings", () => {
  it("requires a Redis URL, with no fallback to the cache's", () => {
    expect(() => checkRemoteSavedGroupsSettings({ runLoader: false })).toThrow(
      "REMOTE_SAVED_GROUPS_CONNECTION_URL is required",
    );
  });

  it("requires root nodes for Redis Cluster", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({ useCluster: true, runLoader: false }),
    ).toThrow("REMOTE_SAVED_GROUPS_CLUSTER_ROOT_NODES_JSON is required");
    expect(() =>
      checkRemoteSavedGroupsSettings({
        useCluster: true,
        clusterRootNodesJSON: [{ host: "node-1", port: 7000 }],
        runLoader: false,
      }),
    ).not.toThrow();
  });

  it("requires a store ID when the loader runs", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({ ...redis, runLoader: true }),
    ).toThrow("REMOTE_SAVED_GROUPS_STORE_ID: it's required");
    expect(() =>
      checkRemoteSavedGroupsSettings({
        ...redis,
        loaderOnly: true,
        storeId: "",
      }),
    ).toThrow("REMOTE_SAVED_GROUPS_STORE_ID: it's required");
  });

  it("rejects store IDs over 100 characters", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({
        ...redis,
        runLoader: true,
        storeId: "x".repeat(101),
      }),
    ).toThrow("longer than 100 characters");
  });

  it("accepts a store ID when the loader runs", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({
        ...redis,
        runLoader: true,
        storeId: "redis-us-east",
      }),
    ).not.toThrow();
  });

  it("doesn't need a store ID without the loader", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({ ...redis, runLoader: false }),
    ).not.toThrow();
  });
});
