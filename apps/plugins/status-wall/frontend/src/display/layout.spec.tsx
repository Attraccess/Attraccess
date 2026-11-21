import { describe, expect, it } from 'vitest';
import { formatElapsed } from './elapsed';
import { fitGrid, TILE_ASPECT } from './fitGrid';

describe('fitGrid', () => {
  it('uses one big tile for a single resource, limited by the height of a wide screen', () => {
    expect(fitGrid(1, 1920, 900, 16)).toEqual({ columns: 1, tileWidth: Math.floor(900 * TILE_ASPECT) });
  });

  it('spreads many tiles so that all fit without scrolling', () => {
    const { columns, tileWidth } = fitGrid(24, 1920, 1000, 16);
    const rows = Math.ceil(24 / columns);
    expect(columns * tileWidth + (columns - 1) * 16).toBeLessThanOrEqual(1920);
    expect(rows * (tileWidth / TILE_ASPECT) + (rows - 1) * 16).toBeLessThanOrEqual(1000);
    expect(columns).toBe(6);
  });

  it('copes with nothing to show or no room yet', () => {
    expect(fitGrid(0, 1920, 1080, 16)).toEqual({ columns: 1, tileWidth: 0 });
    expect(fitGrid(5, 0, 0, 16)).toEqual({ columns: 1, tileWidth: 0 });
  });
});

describe('formatElapsed', () => {
  const now = new Date('2026-11-21T10:00:00.000Z');

  it('shows minutes below an hour and hours with minutes above', () => {
    expect(formatElapsed(null, now)).toBeNull();
    expect(formatElapsed('2026-11-21T09:48:30.000Z', now)).toBe('11 min');
    expect(formatElapsed('2026-11-21T07:55:00.000Z', now)).toBe('2 h 05');
    expect(formatElapsed('2026-11-21T10:05:00.000Z', now)).toBe('0 min');
  });
});
