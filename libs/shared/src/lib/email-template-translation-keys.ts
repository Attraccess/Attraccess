export interface TranslationKey {
  key: string;
  defaultValue: string;
}

export function extractTranslationKeys(content: string): TranslationKey[] {
  const regex = /\{\{t\s+["']([^"']+)["']\s+["']([^"']*)["']/g;
  const seen = new Set<string>();
  const keys: TranslationKey[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      keys.push({ key: match[1], defaultValue: match[2] });
    }
  }
  return keys;
}
