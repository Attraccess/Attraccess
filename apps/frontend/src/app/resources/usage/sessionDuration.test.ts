import { describe, expect, it } from 'vitest';
import { extensionCap, extensionRoomMinutes, formatDuration, joinMinutes, splitMinutes } from './sessionDuration';

const start = '2026-01-01T10:00:00.000Z';
const at = (minutes: number) => new Date(new Date(start).getTime() + minutes * 60_000).toISOString();

describe('sessionDuration', () => {
  it('has no room without a deadline', () => {
    expect(extensionRoomMinutes({ startTime: start })).toBe(0);
  });

  it('measures the room up to the maximum', () => {
    expect(extensionRoomMinutes({ startTime: start, autoEndAt: at(60), maxAutoEndAt: at(300) })).toBe(240);
    expect(extensionRoomMinutes({ startTime: start, autoEndAt: at(300), maxAutoEndAt: at(300) })).toBe(0);
  });

  it('caps machines without a maximum at 30 days after the start', () => {
    expect(extensionCap({ startTime: start }).toISOString()).toBe(at(43_200));
    expect(extensionRoomMinutes({ startTime: start, autoEndAt: at(60) })).toBe(43_140);
  });

  it('splits, joins and formats minutes', () => {
    expect(splitMinutes(135)).toEqual({ hours: 2, minutes: 15 });
    expect(joinMinutes(2, 15)).toBe(135);
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(135)).toBe('2 h 15 min');
  });
});
