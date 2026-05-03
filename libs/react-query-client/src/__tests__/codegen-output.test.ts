// Asserts generated infiniteQueries.ts uses numeric page params natively
// FEATURE: Codegen contract — drop sed workaround (ATT-275)

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INFINITE_QUERIES = resolve(
  __dirname,
  '../lib/queries/infiniteQueries.ts'
);

const matchCount = (source: string, pattern: RegExp): number =>
  source.match(pattern)?.length ?? 0;

describe('generated infiniteQueries.ts — numeric page params', () => {
  it('exists on disk (codegen has run)', () => {
    expect(existsSync(INFINITE_QUERIES)).toBe(true);
  });

  const source = existsSync(INFINITE_QUERIES)
    ? readFileSync(INFINITE_QUERIES, 'utf8')
    : '';

  it('does not cast pageParam to string anywhere', () => {
    expect(source).not.toMatch(/pageParam\s+as\s+string/);
  });

  it('does not initialise pageParam with a string literal anywhere', () => {
    expect(source).not.toMatch(/initialPageParam:\s*["']1["']/);
  });

  it('does not declare nextPage as a string anywhere', () => {
    expect(source).not.toMatch(/nextPage\??\s*:\s*string\b/);
  });

  it('casts every pageParam usage to number (no string casts mixed in)', () => {
    const totalCasts = matchCount(source, /pageParam\s+as\s+\w+/g);
    const numericCasts = matchCount(source, /pageParam\s+as\s+number/g);
    expect(totalCasts).toBeGreaterThan(0);
    expect(numericCasts).toBe(totalCasts);
  });

  it('emits a numeric initialPageParam for every infinite-query call site', () => {
    const totalInitial = matchCount(source, /initialPageParam:\s*\S+/g);
    const numericInitial = matchCount(source, /initialPageParam:\s*\d+\b/g);
    expect(totalInitial).toBeGreaterThan(0);
    expect(numericInitial).toBe(totalInitial);
  });

  it('declares every nextPage in the inferred page shape as number', () => {
    const totalNextPage = matchCount(source, /nextPage\??\s*:\s*\w+/g);
    const numericNextPage = matchCount(source, /nextPage\??\s*:\s*number\b/g);
    expect(totalNextPage).toBeGreaterThan(0);
    expect(numericNextPage).toBe(totalNextPage);
  });

  it('contains no sed backup leftovers (.bak references)', () => {
    expect(source).not.toContain('.bak');
  });
});
