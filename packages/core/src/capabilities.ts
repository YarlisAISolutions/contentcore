/**
 * Capability strings describe what the current viewer may do ("page:edit", "page:publish").
 * They are UI hints only: hide the Edit button, not the endpoint. Your backend enforces permissions.
 *
 * Matching: an exact string, "*" (everything), or a "scope:*" wildcard ("page:*" grants "page:edit").
 */
export interface Capabilities {
  readonly list: readonly string[];
  can(action: string): boolean;
}

export function createCapabilities(...lists: ReadonlyArray<readonly string[] | undefined>): Capabilities {
  const list = Object.freeze([...new Set(lists.flatMap((l) => l ?? []))]);
  const set = new Set(list);
  return {
    list,
    can(action: string) {
      if (set.has("*") || set.has(action)) return true;
      const colon = action.indexOf(":");
      return colon > 0 && set.has(`${action.slice(0, colon)}:*`);
    },
  };
}
