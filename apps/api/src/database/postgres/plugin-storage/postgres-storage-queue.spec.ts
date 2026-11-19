import { createOrderedQueue } from './postgres-storage-sessions';

describe('createOrderedQueue', () => {
  it('starts each call after the previous one settled, also after a failure', async () => {
    const inOrder = createOrderedQueue();
    const events: string[] = [];
    let release!: () => void;
    const first = inOrder(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => (release = resolve));
      events.push('first:end');
      throw new Error('first failed');
    });
    const second = inOrder(async () => {
      events.push('second');
      return 2;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['first:start']);
    release();
    await expect(first).rejects.toThrow('first failed');
    await expect(second).resolves.toBe(2);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('keeps separate queues apart', async () => {
    const a = createOrderedQueue();
    const b = createOrderedQueue();
    let release!: () => void;
    const held = a(() => new Promise<void>((resolve) => (release = resolve)));
    await expect(b(async () => 'b')).resolves.toBe('b');
    release();
    await held;
  });
});
