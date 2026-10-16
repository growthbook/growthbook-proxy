import {
  blockRulesUsingGroups,
  getConditionRemoteGroupIds,
  getRemoteGroupEntries,
  getUnloadedGroupIds,
  withGroupsDateUpdated,
} from "./entries";

describe("getConditionRemoteGroupIds", () => {
  it("finds group IDs in __gb_remoteGroupIds conditions anywhere", () => {
    const payload = {
      features: {
        a: {
          rules: [
            {
              condition: {
                __gb_remoteGroupIds: { $in: ["grp_1"], $exists: true },
              },
            },
            {
              condition: {
                $or: [
                  { __gb_remoteGroupIds: { $nin: ["grp_2"], $exists: true } },
                  { __gb_remoteGroupIds: { $all: ["grp_1", "grp_3:org"] } },
                ],
              },
            },
          ],
        },
      },
      experiments: [
        { condition: { country: { $in: ["US"] } } },
        {
          parentConditions: [
            { condition: { __gb_remoteGroupIds: { $in: ["grp_4"] } } },
          ],
        },
      ],
    };
    expect(getConditionRemoteGroupIds(payload).sort()).toEqual([
      "grp_1",
      "grp_2",
      "grp_3:org",
      "grp_4",
    ]);
  });

  it("returns nothing for payloads without remote groups", () => {
    expect(
      getConditionRemoteGroupIds({ features: { a: { defaultValue: 1 } } }),
    ).toEqual([]);
  });
});

describe("getRemoteGroupEntries", () => {
  it("builds entries for loaded groups and derived groups", () => {
    expect(
      getRemoteGroupEntries(["grp_1", "grp_1:parent_id", "grp_missing"], {
        grp_1: "account_id",
      }),
    ).toEqual({
      grp_1: { type: "remote", attributeKey: "account_id" },
      "grp_1:parent_id": {
        type: "remote",
        attributeKey: "parent_id",
        valuesFrom: "grp_1",
      },
    });
  });

  it("splits a derived ID at the first colon", () => {
    expect(
      getRemoteGroupEntries(["grp_1:a:b"], { grp_1: "id" })["grp_1:a:b"],
    ).toEqual({ type: "remote", attributeKey: "a:b", valuesFrom: "grp_1" });
  });

  it("skips derived groups whose source isn't loaded", () => {
    expect(getRemoteGroupEntries(["grp_2:org"], {})).toEqual({});
  });
});

describe("getUnloadedGroupIds", () => {
  it("finds groups and derived groups whose source isn't loaded", () => {
    expect(
      getUnloadedGroupIds(["grp_1", "grp_1:org", "grp_2", "grp_2:org"], {
        grp_1: "id",
      }),
    ).toEqual(["grp_2", "grp_2:org"]);
  });
});

describe("blockRulesUsingGroups", () => {
  const payload = {
    features: {
      vip: {
        defaultValue: false,
        rules: [
          {
            condition: { __gb_remoteGroupIds: { $nin: ["grp_2"] } },
            force: true,
          },
          { condition: { country: "US" }, force: true },
        ],
      },
      v2: {
        defaultValue: false,
        rules: [
          { condition: { $not: { $savedGroup: { id: "grp_2:org" } } } },
          { condition: { $savedGroup: { id: "grp_1" } } },
        ],
      },
      plain: { defaultValue: 1 },
    },
    experiments: [
      { key: "exp", condition: { __gb_remoteGroupIds: { $in: ["grp_2"] } } },
    ],
  };

  it("makes rules using the groups never match and leaves others", () => {
    const result = blockRulesUsingGroups(payload, ["grp_2", "grp_2:org"]);
    const never = { $not: {} };
    expect(result.features.vip.rules[0]).toEqual({
      condition: never,
      force: true,
    });
    expect(result.features.vip.rules[1]).toBe(payload.features.vip.rules[1]);
    expect(result.features.v2.rules[0].condition).toEqual(never);
    expect(result.features.v2.rules[1]).toBe(payload.features.v2.rules[1]);
    expect(result.features.plain).toBe(payload.features.plain);
    expect(result.experiments[0]).toEqual({ key: "exp", condition: never });
    // The cached payload isn't changed.
    expect(payload.features.vip.rules[0].condition).toEqual({
      __gb_remoteGroupIds: { $nin: ["grp_2"] },
    });
  });

  it("returns the payload as is when no groups are blocked", () => {
    expect(blockRulesUsingGroups(payload, [])).toBe(payload);
  });
});

describe("withGroupsDateUpdated", () => {
  const payload = { dateUpdated: "2026-10-01T00:00:00.000Z", features: {} };
  const date = (p: { dateUpdated?: string }) => Date.parse(p.dateUpdated ?? "");

  it("is at or just after the later date", () => {
    const result = withGroupsDateUpdated(payload, "2026-10-16T12:00:00.000Z");
    const later = Date.parse("2026-10-16T12:00:00.000Z");
    expect(date(result)).toBeGreaterThanOrEqual(later);
    expect(date(result)).toBeLessThan(later + 60 * 1000);
    expect(payload.dateUpdated).toBe("2026-10-01T00:00:00.000Z");
  });

  it("changes when a feature edit older than the group change arrives", () => {
    const groups = "2026-10-16T12:00:00.000Z";
    const before = withGroupsDateUpdated(
      { dateUpdated: "2026-10-16T11:59:30.123Z" },
      groups,
    );
    const after = withGroupsDateUpdated(
      { dateUpdated: "2026-10-16T11:59:50.456Z" },
      groups,
    );
    expect(after.dateUpdated).not.toBe(before.dateUpdated);
  });

  it("changes when the groups change", () => {
    const first = withGroupsDateUpdated(payload, "2026-10-16T12:00:00.000Z");
    const second = withGroupsDateUpdated(payload, "2026-10-16T12:05:00.000Z");
    expect(second.dateUpdated).not.toBe(first.dateUpdated);
  });

  it("is the same for the same inputs", () => {
    expect(
      withGroupsDateUpdated(payload, "2026-10-16T12:00:00.000Z").dateUpdated,
    ).toBe(
      withGroupsDateUpdated(payload, "2026-10-16T12:00:00.000Z").dateUpdated,
    );
  });

  it("keeps the payload when no group change is recorded", () => {
    expect(withGroupsDateUpdated(payload, null)).toBe(payload);
    expect(withGroupsDateUpdated(payload, "not a date")).toBe(payload);
  });

  it("uses the group change when the payload has no date", () => {
    const noDate: { dateUpdated?: string; features: object } = {
      features: {},
    };
    expect(
      withGroupsDateUpdated(noDate, "2026-10-16T12:00:00.000Z").dateUpdated,
    ).toBe("2026-10-16T12:00:00.000Z");
  });
});
