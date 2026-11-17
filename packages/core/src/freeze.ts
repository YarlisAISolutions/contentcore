/**
 * Deep-freezes a value in place and returns it. Cached pages are shared between every
 * caller and render, so they are made immutable instead of cloned on each read:
 * reads stay O(1) and React can rely on referential equality.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  return value;
}
