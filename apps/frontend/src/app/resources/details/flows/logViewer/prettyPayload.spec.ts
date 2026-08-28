import { describe, expect, it } from 'vitest';
import { prettyPayload } from './index';

describe('prettyPayload', () => {
  it('formats valid JSON', () => {
    expect(prettyPayload('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('returns truncated payloads as-is instead of throwing', () => {
    const truncated = `${JSON.stringify({ a: 'x'.repeat(20) }).slice(0, 15)}…[truncated]`;
    expect(prettyPayload(truncated)).toBe(truncated);
  });
});
