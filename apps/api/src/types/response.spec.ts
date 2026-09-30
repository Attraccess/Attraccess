import { computeNextPage } from './response';

describe('computeNextPage', () => {
  it('returns the next page while items remain beyond the current page', () => {
    expect(computeNextPage(1, 10, 25)).toBe(2);
    expect(computeNextPage(2, 10, 25)).toBe(3);
  });

  it('returns undefined when the current page ends exactly at the total', () => {
    expect(computeNextPage(2, 10, 20)).toBeUndefined();
  });

  it('returns undefined on a partially filled last page', () => {
    expect(computeNextPage(3, 10, 25)).toBeUndefined();
  });

  it('returns undefined for an empty result set', () => {
    expect(computeNextPage(1, 10, 0)).toBeUndefined();
  });
});
