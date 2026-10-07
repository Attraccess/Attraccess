export function sort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sort);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sort(item)]),
  );
}
