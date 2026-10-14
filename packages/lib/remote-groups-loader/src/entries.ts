import { GROUP_ATTRIBUTES_KEY, LoaderRedis } from "./redis";

/** A remote saved group as SDK payloads describe it (`savedGroupReferencesRemote`). */
export type RemoteGroupEntry = {
  type: "remote";
  attributeKey: string;
  valuesFrom?: string;
};

const REMOTE_GROUP_IDS_ATTRIBUTE = "__gb_remoteGroupIds";

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

/** Each loaded group's attribute, as recorded by the loader. */
export function readGroupAttributes(
  redis: Pick<LoaderRedis, "hgetall">,
): Promise<Record<string, string>> {
  return redis.hgetall(GROUP_ATTRIBUTES_KEY);
}
