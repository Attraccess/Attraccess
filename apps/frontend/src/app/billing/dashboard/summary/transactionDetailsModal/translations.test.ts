import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

// System billing item names emitted by the API (apps/api/src/billing/billing.service.ts).
// The modal falls back to the raw item name when no translation exists, so every
// system item must stay localized in both locales.
const SYSTEM_ITEM_NAMES = ['PER_SESSION', 'PER_MINUTE', 'PER_ATTRIBUTABLE_OPERATING_MINUTE', 'BILLING_FACTOR'] as const;

describe('transaction details modal item translations', () => {
  it('localizes every system billing item in English', () => {
    for (const name of SYSTEM_ITEM_NAMES) {
      expect(en.items.system, `missing English label for ${name}`).toHaveProperty(name);
    }
  });

  it('localizes every system billing item in German', () => {
    for (const name of SYSTEM_ITEM_NAMES) {
      expect(de.items.system, `missing German label for ${name}`).toHaveProperty(name);
    }
  });

  it('never shows the raw internal enum text as label', () => {
    for (const name of SYSTEM_ITEM_NAMES) {
      const enLabel = en.items.system[name as keyof typeof en.items.system];
      const deLabel = de.items.system[name as keyof typeof de.items.system];
      expect(enLabel).not.toBe(name);
      expect(deLabel).not.toBe(name);
      expect(enLabel.length).toBeGreaterThan(0);
      expect(deLabel.length).toBeGreaterThan(0);
    }
  });

  it('keeps English and German system item keys in sync', () => {
    expect(Object.keys(de.items.system).sort()).toEqual(Object.keys(en.items.system).sort());
  });
});
