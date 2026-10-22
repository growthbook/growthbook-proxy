import {
  evaluateFeatures,
  FeatureApiResponse,
  SavedGroupResolver,
} from "./index";

// GrowthBook adds this to every rule using a remote group, so "not in group"
// fails closed until the user's groups are looked up.
const guard = { __gb_remoteGroupIds: { $exists: true } };

// A payload with v2 `remote` entries, as SDKs with savedGroupReferencesRemote get
const payload: FeatureApiResponse = {
  features: {
    in_group: {
      defaultValue: "default",
      rules: [
        { condition: { $savedGroup: { id: "grp_1" }, ...guard }, force: "in" },
      ],
    },
    not_in_group: {
      defaultValue: "default",
      rules: [
        {
          condition: { $not: { $savedGroup: { id: "grp_1" } }, ...guard },
          force: "out",
        },
      ],
    },
    derived: {
      defaultValue: "default",
      rules: [
        {
          condition: { $savedGroup: { id: "grp_1:parent" }, ...guard },
          force: "in",
        },
      ],
    },
    plain: {
      defaultValue: "default",
      rules: [{ condition: { country: "US" }, force: "us" }],
    },
  },
  savedGroups: {
    grp_1: { type: "remote", attributeKey: "id" },
    "grp_1:parent": {
      type: "remote",
      attributeKey: "parent",
      valuesFrom: "grp_1",
    },
  },
};

// A payload for SDKs without remote group support: conditions only, no entries
const conditionPayload: FeatureApiResponse = {
  features: {
    in_group: {
      defaultValue: "default",
      rules: [
        {
          condition: { __gb_remoteGroupIds: { $in: ["grp_1"], $exists: true } },
          force: "in",
        },
      ],
    },
    not_in_group: {
      defaultValue: "default",
      rules: [
        {
          condition: {
            __gb_remoteGroupIds: { $nin: ["grp_1"], $exists: true },
          },
          force: "out",
        },
      ],
    },
  },
};

// `id: "member"` is in grp_1, as is `parent: "member"` for the derived group
const resolver: SavedGroupResolver = async ({ attributes, groups }) =>
  groups
    .filter((g) => attributes[g.attributeKey] === "member")
    .map((g) => g.id);

async function evaluate(
  attributes: Record<string, unknown>,
  options: Partial<Parameters<typeof evaluateFeatures>[0]> = {},
) {
  const result = await evaluateFeatures({
    payload,
    attributes,
    ...options,
  });
  return Object.fromEntries(
    Object.entries(result.features ?? {}).map(([k, v]) => [k, v.defaultValue]),
  );
}

describe("evaluateFeatures with a saved group resolver", () => {
  it("uses the resolver's groups", async () => {
    expect(
      await evaluate({ id: "member" }, { savedGroupResolver: resolver }),
    ).toMatchObject({ in_group: "in", not_in_group: "default" });
    expect(
      await evaluate({ id: "other" }, { savedGroupResolver: resolver }),
    ).toMatchObject({ in_group: "default", not_in_group: "out" });
  });

  it("matches derived groups", async () => {
    expect(
      await evaluate(
        { id: "other", parent: "member" },
        { savedGroupResolver: resolver },
      ),
    ).toMatchObject({ in_group: "default", derived: "in" });
  });

  it("ignores remote group IDs the client sends", async () => {
    expect(
      await evaluate(
        { id: "other", __gb_remoteGroupIds: ["grp_1"] },
        { savedGroupResolver: resolver },
      ),
    ).toMatchObject({ in_group: "default", not_in_group: "out" });
  });

  it("uses the client's remote group IDs without a resolver", async () => {
    expect(
      await evaluate({ id: "other", __gb_remoteGroupIds: ["grp_1"] }),
    ).toMatchObject({ in_group: "in", not_in_group: "default" });
  });

  it("fails closed when the resolver throws", async () => {
    const onSavedGroupResolverError = jest.fn();
    const failing: SavedGroupResolver = async () => {
      throw new Error("Redis is down");
    };
    expect(
      await evaluate(
        { id: "member", __gb_remoteGroupIds: ["grp_1"] },
        { savedGroupResolver: failing, onSavedGroupResolverError },
      ),
    ).toMatchObject({ in_group: "default", not_in_group: "default" });
    expect(onSavedGroupResolverError).toHaveBeenCalledWith(
      new Error("Redis is down"),
    );
  });

  it("leaves out dateUpdated when the lookup fails", async () => {
    const dated = { ...payload, dateUpdated: "2026-01-01T00:00:00.000Z" };
    const ok = await evaluateFeatures({
      payload: dated,
      attributes: { id: "member" },
      savedGroupResolver: resolver,
    });
    expect(ok.dateUpdated).toBe(dated.dateUpdated);
    const failed = await evaluateFeatures({
      payload: dated,
      attributes: { id: "member" },
      savedGroupResolver: async () => {
        throw new Error("Redis is down");
      },
    });
    expect(failed.dateUpdated).toBeUndefined();
  });

  it("passes only the attributes remote groups use, and the groups", async () => {
    const spy = jest.fn(resolver);
    await evaluate(
      { id: "member", parent: "p", country: "US" },
      { savedGroupResolver: spy },
    );
    expect(spy).toHaveBeenCalledWith({
      attributes: { id: "member", parent: "p" },
      groups: [
        { id: "grp_1", attributeKey: "id" },
        { id: "grp_1:parent", attributeKey: "parent", valuesFrom: "grp_1" },
      ],
    });
  });

  it("doesn't look up or set IDs when the payload has no remote entries", async () => {
    const spy = jest.fn(resolver);
    expect(
      await evaluate(
        { id: "member", __gb_remoteGroupIds: ["grp_1"] },
        { payload: conditionPayload, savedGroupResolver: spy },
      ),
    ).toEqual({ in_group: "default", not_in_group: "default" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("leaves other rules alone", async () => {
    expect(
      await evaluate({ country: "US" }, { savedGroupResolver: resolver }),
    ).toMatchObject({ plain: "us" });
  });
});
