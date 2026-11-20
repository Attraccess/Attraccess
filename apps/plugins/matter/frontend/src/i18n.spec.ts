import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

function keysOf(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) =>
    entry !== null && typeof entry === 'object'
      ? keysOf(entry as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('Matter copy', () => {
  it('has the same keys in English and German', () => {
    expect(keysOf(de).sort()).toEqual(keysOf(en).sort());
  });

  it('has no empty text', () => {
    for (const copy of [en, de]) for (const key of keysOf(copy)) expect(key).toBeTruthy();
    const empty = (value: unknown): boolean =>
      typeof value === 'string' ? value.trim() === '' : Object.values(value as object).some(empty);
    expect(empty(en)).toBe(false);
    expect(empty(de)).toBe(false);
  });

  it('uses the same placeholders in both languages', () => {
    const flat = (copy: Record<string, unknown>, prefix = ''): [string, string][] =>
      Object.entries(copy).flatMap(([key, entry]) =>
        typeof entry === 'string'
          ? [[`${prefix}${key}`, entry] as [string, string]]
          : flat(entry as Record<string, unknown>, `${prefix}${key}.`),
      );
    const german = new Map(flat(de));
    for (const [key, text] of flat(en)) {
      const placeholders = (value: string) => [...value.matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();
      expect(placeholders(german.get(key) ?? ''), key).toEqual(placeholders(text));
    }
  });
});
