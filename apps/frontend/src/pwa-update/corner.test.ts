import { describe, expect, it } from 'vitest';
import { adjacentCorner, CORNER_STORAGE_KEY, DEFAULT_CORNER, loadCorner, nearestCorner, saveCorner } from './corner';

describe('nearestCorner', () => {
  const viewport = { width: 1000, height: 800 };
  it('snaps to the quadrant containing the point', () => {
    expect(nearestCorner({ x: 10, y: 10 }, viewport)).toBe('top-left');
    expect(nearestCorner({ x: 900, y: 10 }, viewport)).toBe('top-right');
    expect(nearestCorner({ x: 10, y: 700 }, viewport)).toBe('bottom-left');
    expect(nearestCorner({ x: 900, y: 700 }, viewport)).toBe('bottom-right');
  });
});

describe('adjacentCorner', () => {
  it('moves along the arrow axis and stays at the edge', () => {
    expect(adjacentCorner('bottom-right', 'ArrowLeft')).toBe('bottom-left');
    expect(adjacentCorner('bottom-right', 'ArrowUp')).toBe('top-right');
    expect(adjacentCorner('bottom-right', 'ArrowRight')).toBe('bottom-right');
    expect(adjacentCorner('top-left', 'ArrowDown')).toBe('bottom-left');
  });
});

describe('corner persistence', () => {
  it('round-trips a corner', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveCorner('top-left', storage);
    expect(store.get(CORNER_STORAGE_KEY)).toBe('top-left');
    expect(loadCorner(storage)).toBe('top-left');
  });

  it('falls back to the default for junk or throwing storage', () => {
    expect(loadCorner({ getItem: () => 'nowhere' })).toBe(DEFAULT_CORNER);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadCorner(broken)).toBe('bottom-right');
    expect(() => saveCorner('top-left', broken)).not.toThrow();
  });
});
