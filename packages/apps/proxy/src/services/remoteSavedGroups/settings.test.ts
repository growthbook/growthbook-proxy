import { checkRemoteSavedGroupsSettings } from "./settings";

describe("checkRemoteSavedGroupsSettings", () => {
  it("requires a store ID when the loader runs", () => {
    expect(() => checkRemoteSavedGroupsSettings({ runLoader: true })).toThrow(
      "REMOTE_SAVED_GROUPS_STORE_ID: it's required",
    );
    expect(() =>
      checkRemoteSavedGroupsSettings({ loaderOnly: true, storeId: "" }),
    ).toThrow("REMOTE_SAVED_GROUPS_STORE_ID: it's required");
  });

  it("rejects store IDs over 100 characters", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({
        runLoader: true,
        storeId: "x".repeat(101),
      }),
    ).toThrow("longer than 100 characters");
  });

  it("accepts a store ID when the loader runs", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({
        runLoader: true,
        storeId: "redis-us-east",
      }),
    ).not.toThrow();
  });

  it("doesn't need a store ID without the loader", () => {
    expect(() =>
      checkRemoteSavedGroupsSettings({ runLoader: false }),
    ).not.toThrow();
  });
});
