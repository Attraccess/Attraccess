import { FixedWindowCounterStore, WindowCounterEntry } from './fixed-window-counter';

describe('FixedWindowCounterStore', () => {
  it('stores and retrieves entries by key', () => {
    const store = new FixedWindowCounterStore<string, WindowCounterEntry>(10);
    store.set('a', { count: 1, firstAt: 100 });
    expect(store.get('a')).toEqual({ count: 1, firstAt: 100 });
    expect(store.has('a')).toBe(true);
    expect(store.size).toBe(1);
  });

  it('deletes entries', () => {
    const store = new FixedWindowCounterStore<string, WindowCounterEntry>(10);
    store.set('a', { count: 1, firstAt: 100 });
    store.delete('a');
    expect(store.has('a')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('evicts entries the caller marks stale', () => {
    const store = new FixedWindowCounterStore<string, WindowCounterEntry>(10);
    store.set('fresh', { count: 1, firstAt: 1000 });
    store.set('stale', { count: 1, firstAt: 1 });
    store.evict((entry) => entry.firstAt < 500);
    expect(store.has('fresh')).toBe(true);
    expect(store.has('stale')).toBe(false);
  });

  it('drops the oldest entries when over capacity', () => {
    const store = new FixedWindowCounterStore<string, WindowCounterEntry>(2);
    store.set('oldest', { count: 1, firstAt: 1 });
    store.set('middle', { count: 1, firstAt: 2 });
    store.set('newest', { count: 1, firstAt: 3 });
    // Nothing stale, but capacity is 2 -> the single oldest entry is dropped.
    store.evict(() => false);
    expect(store.size).toBe(2);
    expect(store.has('oldest')).toBe(false);
    expect(store.has('middle')).toBe(true);
    expect(store.has('newest')).toBe(true);
  });
});
