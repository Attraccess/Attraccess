import type { AuditEntryDto } from '@attraccess/react-query-client';
import { describe, expect, it } from 'vitest';
import { target } from './target';

const t = (key: string) => key;
const entry = (overrides: Partial<AuditEntryDto>) =>
  ({ subjectType: 'plugin-policy', subjectId: 1, subjectLabel: null, details: {}, ...overrides }) as AuditEntryDto;

describe('target', () => {
  it('names the plugin system without a record number', () => {
    expect(target(entry({ subjectType: 'plugin-system' }), t)).toBe('targets["plugin-system"]');
  });

  it('numbers other subjects without a name', () => {
    expect(target(entry({ subjectType: 'plugin-policy' }), t)).toBe('targets["plugin-policy"] #1');
  });
});
