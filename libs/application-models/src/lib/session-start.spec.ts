import { sessionStartOf } from './session-start';

describe('sessionStartOf', () => {
  it('is the start of the switched session on a continuation, else the record start', () => {
    const start = new Date('2026-01-01T08:00:00Z');
    const switchedAt = new Date('2026-01-01T09:00:00Z');
    expect(sessionStartOf({ startTime: switchedAt, sessionStartTime: start })).toBe(start);
    expect(sessionStartOf({ startTime: start, sessionStartTime: null })).toBe(start);
    expect(sessionStartOf({ startTime: '2026-01-01T08:00:00Z' })).toBe('2026-01-01T08:00:00Z');
  });
});
