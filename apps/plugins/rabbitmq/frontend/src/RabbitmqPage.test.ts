import { describe, expect, it } from 'vitest';
import { selectRabbitmqServerId } from './RabbitmqPage';

describe('selectRabbitmqServerId', () => {
  it('keeps the current selected server when it still exists', () => {
    expect(selectRabbitmqServerId([{ id: 1 }, { id: 2 }], 2)).toBe(2);
  });

  it('falls back to the first configured server when the current selection is missing', () => {
    expect(selectRabbitmqServerId([{ id: 3 }, { id: 4 }], 9)).toBe(3);
  });

  it('returns null when no MQTT servers are configured', () => {
    expect(selectRabbitmqServerId([], null)).toBeNull();
  });
});
