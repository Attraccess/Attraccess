// Asserts generated infiniteQueries.ts uses numeric page params natively
// FEATURE: Codegen contract — drop sed workaround (ATT-275)

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INFINITE_QUERIES = resolve(
  __dirname,
  '../lib/queries/infiniteQueries.ts'
);

describe('generated infiniteQueries.ts — numeric page params', () => {
  it('exists on disk (codegen has run)', () => {
    expect(existsSync(INFINITE_QUERIES)).toBe(true);
  });

  const source = existsSync(INFINITE_QUERIES)
    ? readFileSync(INFINITE_QUERIES, 'utf8')
    : '';

  it('does not cast pageParam to string', () => {
    expect(source).not.toMatch(/pageParam\s+as\s+string/);
  });

  it('does not initialise pageParam with a string literal', () => {
    expect(source).not.toMatch(/initialPageParam:\s*["']1["']/);
  });

  it('does not declare nextPage as a string', () => {
    expect(source).not.toMatch(/nextPage\??\s*:\s*string\b/);
  });

  it('casts pageParam to number where used', () => {
    expect(source).toMatch(/pageParam\s+as\s+number/);
  });

  it('initialises pageParam with the numeric literal 1', () => {
    expect(source).toMatch(/initialPageParam:\s*1\b/);
  });

  it('declares nextPage as number in the inferred page shape', () => {
    expect(source).toMatch(/nextPage\??\s*:\s*number\b/);
  });

  it('contains no sed backup leftovers (.bak references)', () => {
    expect(source).not.toContain('.bak');
  });
});
