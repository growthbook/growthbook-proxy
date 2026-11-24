/** Whether two SDK payloads differ, skipping the stringify when `dateUpdated` already tells. */
export function payloadChanged(a: unknown, b: unknown): boolean {
  const dateA = (a as { dateUpdated?: unknown } | undefined)?.dateUpdated;
  const dateB = (b as { dateUpdated?: unknown } | undefined)?.dateUpdated;
  if (dateA && dateB && dateA !== dateB) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}
