import { ExactSum, ShareParticipant, splitSegment } from './shared-allocation';

const SCALE = BigInt(1_000_000_000);
const people = (rates: number[]): ShareParticipant[] =>
  rates.map((rate, index) => ({ usageId: index + 1, rate, startedAt: index }));
const sum = (values: Iterable<number>) => [...values].reduce((total, value) => total + value, 0);

describe('splitSegment', () => {
  it.each([
    // quantity (kWh), rates, expected total, expected credits per person (earliest first)
    ['3 people on 1 credit', '1', [1, 1, 1], 1, [1, 0, 0]],
    ['3 people on 2 credits', '2', [1, 1, 1], 2, [1, 1, 0]],
    ['3 people on 3 credits', '3', [1, 1, 1], 3, [1, 1, 1]],
    ['2 people on 1 credit', '1', [1, 1], 1, [1, 0]],
    ['a rate of 0 pays nothing', '5', [0, 0], 0, [0, 0]],
    ['zero consumption', '0', [7, 7], 0, [0, 0]],
    ['a single person pays the full rounded charge', '2.4', [10], 24, [24]],
    // 1.5 kWh at 3 and 1 credits: exact shares 2.25 and 0.75, total 3
    ['different rates', '1.5', [3, 1], 3, [2, 1]],
    // 1 kWh at 1 and 2 credits per kWh: shares 0.5 + 1 = 1.5 -> 2 credits, the 0.5 remainder is paid by the earlier one
    ['different rates rounded up once', '1', [1, 2], 2, [1, 1]],
  ] as const)('%s', (_name, kwh, rates, total, expected) => {
    const quantity = BigInt(Math.round(Number(kwh) * 1e9));
    const split = splitSegment(quantity, SCALE, people([...rates]));

    expect(split.totalCredits).toBe(total);
    expect([...people([...rates])].map((p) => split.credits.get(p.usageId))).toEqual([...expected]);
    expect(sum(split.credits.values())).toBe(split.totalCredits);
  });

  it('gives a tie to the earlier-started session, then the lower usage id', () => {
    const participants: ShareParticipant[] = [
      { usageId: 9, rate: 1, startedAt: 100 },
      { usageId: 5, rate: 1, startedAt: 200 },
      { usageId: 4, rate: 1, startedAt: 100 },
    ];

    const split = splitSegment(SCALE, SCALE, participants);

    expect(split.totalCredits).toBe(1);
    expect(split.credits.get(4)).toBe(1);
    expect(split.credits.get(9)).toBe(0);
    expect(split.credits.get(5)).toBe(0);
  });

  it('equals the whole segment charge for equal rates, for many sizes', () => {
    for (let count = 1; count <= 7; count++) {
      for (const quantity of ['1', '1234567890123', '999999999', '500000000', '333333333333']) {
        for (const rate of [1, 3, 17, 1000]) {
          const split = splitSegment(BigInt(quantity), SCALE, people(Array(count).fill(rate)));
          const whole = (BigInt(quantity) * BigInt(rate) + SCALE / BigInt(2)) / SCALE;

          expect(BigInt(split.totalCredits)).toBe(whole);
          expect(sum(split.credits.values())).toBe(split.totalCredits);
        }
      }
    }
  });

  it('never loses or creates a credit for mixed rates', () => {
    let seed = 7;
    const next = (max: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % max);
    for (let round = 0; round < 500; round++) {
      const rates = Array.from({ length: 1 + next(6) }, () => next(40));
      const quantity = BigInt(next(10_000_000)) * BigInt(next(1000) + 1);
      const split = splitSegment(quantity, SCALE, people(rates));
      const exactNumerator = rates.reduce((total, rate) => total + quantity * BigInt(rate), BigInt(0));
      const denominator = BigInt(rates.length) * SCALE;

      expect(BigInt(split.totalCredits)).toBe((exactNumerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
      expect(sum(split.credits.values())).toBe(split.totalCredits);
    }
  });

  it('splits operating time in milliseconds per minute rate', () => {
    // 90 s of running time, 2 people, 4 credits per minute: 45 s each = 3 credits each
    const split = splitSegment(BigInt(90_000), BigInt(60_000), people([4, 4]));

    expect(split.totalCredits).toBe(6);
    expect([...split.credits.values()]).toEqual([3, 3]);
    // 1 minute for 3 people at 1 credit per minute: 20 s each, 1 credit in total
    expect(splitSegment(BigInt(60_000), BigInt(60_000), people([1, 1, 1])).totalCredits).toBe(1);
  });

  it('rejects an empty segment and unsupported rates', () => {
    expect(() => splitSegment(SCALE, SCALE, [])).toThrow(RangeError);
    expect(() => splitSegment(SCALE, SCALE, people([-1]))).toThrow(RangeError);
    expect(() => splitSegment(SCALE * BigInt(10), SCALE, people([Number.MAX_SAFE_INTEGER, 1]))).toThrow(RangeError);
  });
});

describe('ExactSum', () => {
  it('adds fractions without rounding them first', () => {
    const total = new ExactSum();
    for (let index = 0; index < 3; index++) total.add(BigInt(1), BigInt(3));

    expect(total.rounded()).toBe(BigInt(1));
  });
});
