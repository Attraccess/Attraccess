import { describe, expect, it } from 'vitest';
import { formatNumber, formatTimestamp } from './format';

describe('locale-aware formatting', () => {
  it('formats numbers and timestamps in the requested UI language', () => {
    expect(formatNumber(20480, 'de')).toBe('20.480');
    expect(formatNumber(20480, 'en')).toBe('20,480');
    expect(formatTimestamp(Date.UTC(2026, 10, 8, 12, 0, 0), 'de')).toMatch(/^8\.11\.2026/);
    expect(formatTimestamp(Date.UTC(2026, 10, 8, 12, 0, 0), 'en')).toMatch(/^11\/8\/2026/);
  });

  it('renders a dash for missing values', () => {
    expect(formatNumber(null, 'de')).toBe('–');
    expect(formatTimestamp(null, 'de')).toBe('–');
  });
});
