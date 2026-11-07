import { describe, expect, it } from 'vitest';
import { boundsToRange, boundsToSearch, parseRangeSearchParams } from './range-search-params';

const NOW = new Date('2026-09-15T12:00:00Z');

describe('range search params', () => {
  it('round-trips valid bounds', () => {
    const bounds = { start: new Date('2026-09-01T00:00:00.000Z'), end: new Date('2026-09-10T21:59:59.999Z') };
    const parsed = parseRangeSearchParams(new URLSearchParams(boundsToSearch(bounds)), NOW);
    expect(parsed.isFallback).toBe(false);
    expect(parsed.start.toISOString()).toBe(bounds.start.toISOString());
    expect(parsed.end.toISOString()).toBe(bounds.end.toISOString());
  });

  it.each([
    ['missing', ''],
    ['unparsable', 'start=nope&end=2026-09-10T00:00:00Z'],
    ['only start', 'start=2026-09-01T00:00:00Z'],
    ['reversed', 'start=2026-09-10T00:00:00Z&end=2026-09-01T00:00:00Z'],
  ])('falls back to the last 30 days when params are %s', (_label, search) => {
    const parsed = parseRangeSearchParams(new URLSearchParams(search), NOW);
    expect(parsed.isFallback).toBe(true);
    const days = Math.round((parsed.end.getTime() - parsed.start.getTime()) / 86_400_000);
    expect(days).toBe(30);
    expect(parsed.end.getHours()).toBe(23);
  });

  it('converts bounds to a calendar range', () => {
    const range = boundsToRange({ start: new Date(2026, 8, 1, 0, 0, 0), end: new Date(2026, 8, 3, 23, 59, 59, 999) });
    expect(range.start.toString()).toBe('2026-09-01');
    expect(range.end.toString()).toBe('2026-09-03');
  });
});
