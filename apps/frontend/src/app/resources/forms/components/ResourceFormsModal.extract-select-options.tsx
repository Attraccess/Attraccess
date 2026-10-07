export function extractSelectOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const unique = new Set<string>();
  const result: string[] = [];
  raw.forEach((option) => {
    if (typeof option !== 'string') {
      return;
    }
    const trimmed = option.trim();
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });
  return result;
}
