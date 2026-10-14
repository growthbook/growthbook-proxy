import { getConditionRemoteGroupIds, getRemoteGroupEntries } from "./entries";

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
