import { formatDurationMs } from './duration';

describe('duration', () => {
  it('formats milliseconds as h:mm:ss', () => {
    expect(formatDurationMs(0)).toBe('0:00:00');
    expect(formatDurationMs(999)).toBe('0:00:00');
    expect(formatDurationMs(1_000)).toBe('0:00:01');
    expect(formatDurationMs(61_000)).toBe('0:01:01');
    expect(formatDurationMs(3_600_000)).toBe('1:00:00');
    expect(formatDurationMs(3_723_456)).toBe('1:02:03');
  });

  it('keeps hours unbounded', () => {
    expect(formatDurationMs(100 * 3_600_000 + 5 * 60_000)).toBe('100:05:00');
  });
});
