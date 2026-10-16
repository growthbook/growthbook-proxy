import { REMOTE_GROUP_IDS_ATTRIBUTE } from "@growthbook/growthbook";

/** A remote saved group as SDK payloads describe it (`savedGroupReferencesRemote`). */
export type RemoteGroupEntry = {
  type: "remote";
  attributeKey: string;
  valuesFrom?: string;
};

/**
 * The remote group IDs a payload's conditions check, like `grp_vip` in
 * `{ "__gb_remoteGroupIds": { "$in": ["grp_vip"] } }`. Payloads for SDKs
 * without remote group support check remote groups only this way.
 */
export function getConditionRemoteGroupIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") ids.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === REMOTE_GROUP_IDS_ATTRIBUTE) collect(child);
        else walk(child);
      }
    }
  };
  walk(payload);
  return [...ids];
}

/**
 * Payload entries for remote group IDs, using the attributes the loader
 * recorded in Redis. A derived ID (`<group id>:<attribute>`) checks its
 * attribute's value in its source group, so the source gets an entry too.
 * Groups the loader hasn't loaded get no entry, so they never match.
 */
export function getRemoteGroupEntries(
  ids: string[],
  groupAttributes: Record<string, string>,
): Record<string, RemoteGroupEntry> {
  const entries: Record<string, RemoteGroupEntry> = {};
  for (const id of ids) {
    // Group IDs never contain ":", so the first one splits a derived ID.
    const split = id.indexOf(":");
    const source = split === -1 ? id : id.slice(0, split);
    const sourceAttribute = groupAttributes[source];
    if (!sourceAttribute) continue;
    entries[source] = { type: "remote", attributeKey: sourceAttribute };
    if (split !== -1) {
      entries[id] = {
        type: "remote",
        attributeKey: id.slice(split + 1),
        valuesFrom: source,
      };
    }
  }
  return entries;
}

/**
 * The remote group IDs a payload's remote entries or conditions use whose
 * group isn't loaded in this store. A derived ID depends on its source group.
 */
export function getUnloadedGroupIds(
  ids: string[],
  groupAttributes: Record<string, string>,
): string[] {
  return ids.filter((id) => {
    const split = id.indexOf(":");
    return !groupAttributes[split === -1 ? id : id.slice(0, split)];
  });
}

type RuleLike = { condition?: unknown; parentConditions?: unknown };
type PayloadLike = {
  features?: Record<string, { defaultValue?: unknown; rules?: RuleLike[] }>;
  experiments?: RuleLike[];
};

// A condition that's always false: `{}` matches everyone, so its negation
// matches no one, whatever attributes a client sends.
const NEVER_MATCHES = { $not: {} };

/**
 * Makes every feature rule and experiment that uses one of `groupIds` never
 * match, so a group that isn't loaded can't make "not in group" match
 * everyone. Other rules are unchanged.
 */
export function blockRulesUsingGroups<T extends PayloadLike>(
  payload: T,
  groupIds: string[],
): T {
  if (!groupIds.length) return payload;
  const blocked = new Set(groupIds);
  const block = <R extends RuleLike>(rule: R): R =>
    getRuleGroupIds(rule).some((id) => blocked.has(id))
      ? Object.assign({}, rule, { condition: NEVER_MATCHES })
      : rule;

  const features = payload.features && { ...payload.features };
  for (const key in features) {
    const feature = features[key];
    if (feature.rules) {
      features[key] = Object.assign({}, feature, {
        rules: feature.rules.map(block),
      });
    }
  }
  return Object.assign({}, payload, {
    features,
    experiments: payload.experiments?.map(block),
  });
}

/** Saved group IDs a rule's conditions use, in any payload format. */
function getRuleGroupIds(rule: RuleLike): string[] {
  const ids: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") ids.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === REMOTE_GROUP_IDS_ATTRIBUTE || key === "$savedGroups") {
          collect(child);
        } else if (key === "$savedGroup") {
          if (child && typeof child === "object" && "id" in child) {
            if (typeof child.id === "string") ids.push(child.id);
          }
        } else {
          walk(child);
        }
      }
    }
  };
  walk([rule.condition, rule.parentConditions]);
  return ids;
}

// How far past the later date the combined date can be
const DATE_SPREAD_MS = 60 * 1000;

/**
 * The payload with a `dateUpdated` that changes whenever the payload's own
 * date or `updatedAt` (when group members last changed) does. SDKs ignore a
 * refetched payload whose `dateUpdated` is unchanged, so it can't just be
 * the later of the two: a feature edit older than a group change would then
 * keep the same date. It's the later date plus an offset of up to a minute
 * taken from the earlier one, so it stays a valid, current date. The same
 * inputs give the same date on every Proxy.
 */
export function withGroupsDateUpdated<T extends { dateUpdated?: string }>(
  payload: T,
  updatedAt: string | null,
): T {
  const changed = updatedAt ? Date.parse(updatedAt) : NaN;
  if (Number.isNaN(changed)) return payload;
  const own = payload.dateUpdated ? Date.parse(payload.dateUpdated) : NaN;
  const [later, earlier] = Number.isNaN(own)
    ? [changed, 0]
    : [Math.max(own, changed), Math.min(own, changed)];
  return Object.assign({}, payload, {
    dateUpdated: new Date(later + (earlier % DATE_SPREAD_MS)).toISOString(),
  });
}
