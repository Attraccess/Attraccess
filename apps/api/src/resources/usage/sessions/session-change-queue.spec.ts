import { MachineBusyError } from '../errors/machine-busy.error';
import { SessionChangeQueue } from './session-change-queue';

describe('SessionChangeQueue', () => {
  it('runs the changes of one machine one at a time in order', async () => {
    const queue = new SessionChangeQueue();
    const log: string[] = [];
    let releaseFirst!: () => void;
    const first = queue.run(1, async () => {
      log.push('first:start');
      await new Promise<void>((resolve) => (releaseFirst = resolve));
      log.push('first:end');
    });
    const second = queue.run(1, async () => {
      log.push('second');
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(log).toEqual(['first:start', 'first:end', 'second']);
  });

  it('does not make machines wait for each other', async () => {
    const queue = new SessionChangeQueue();
    let release!: () => void;
    const blocked = queue.run(1, () => new Promise<void>((resolve) => (release = resolve)));
    await expect(queue.run(2, async () => 'other')).resolves.toBe('other');
    release();
    await blocked;
  });

  it('lets the next change run after a failed one', async () => {
    const queue = new SessionChangeQueue();
    await expect(queue.run(1, () => Promise.reject(new Error('flow failed')))).rejects.toThrow('flow failed');
    await expect(queue.run(1, async () => 'next')).resolves.toBe('next');
  });

  it('fails with MachineBusyError after waiting too long and keeps the queue intact', async () => {
    const queue = new SessionChangeQueue();
    let release!: () => void;
    const holder = queue.run(1, () => new Promise<void>((resolve) => (release = resolve)));
    const impatient = queue.run(1, async () => 'never', 20);
    const patient = queue.run(1, async () => 'later');
    await expect(impatient).rejects.toBeInstanceOf(MachineBusyError);
    release();
    await holder;
    await expect(patient).resolves.toBe('later');
  });
});
