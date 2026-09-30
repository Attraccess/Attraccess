export interface TranslationKey {
  key: string;
  defaultValue: string;
}

export function extractTranslationKeys(content: string): TranslationKey[] {
  const all: Array<{ key: string; defaultValue: string; index: number }> = [];

  let match: RegExpExecArray | null;
  const dq = /\{\{t\s+"([^"]+)"\s+"([^"]*)"/g;
  while ((match = dq.exec(content)) !== null) {
    all.push({ key: match[1], defaultValue: match[2], index: match.index });
  }
  const sq = /\{\{t\s+'([^']+)'\s+'([^']*)'/g;
  while ((match = sq.exec(content)) !== null) {
    all.push({ key: match[1], defaultValue: match[2], index: match.index });
  }

  all.sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  const keys: TranslationKey[] = [];
  for (const { key, defaultValue } of all) {
    if (!seen.has(key)) {
      seen.add(key);
      keys.push({ key, defaultValue });
    }
  }
  return keys;
}
