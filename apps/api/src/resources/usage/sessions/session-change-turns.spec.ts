import { UsageSessionStore } from '../usage-session-store.port';
import { SessionChangeTurns } from './session-change-turns';

/** Which machines take turns, decided from the usage session port alone. */
describe('SessionChangeTurns', () => {
  let store: { findSessionLimit: jest.Mock; countActiveSessions: jest.Mock };
  let turns: SessionChangeTurns;

  beforeEach(() => {
    store = { findSessionLimit: jest.fn().mockResolvedValue(1), countActiveSessions: jest.fn().mockResolvedValue(0) };
    turns = new SessionChangeTurns(store as unknown as UsageSessionStore, null);
  });

  /** A change that finishes when `finish` is called, recording when it ran. */
  const change = (name: string, log: string[]) => {
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    return {
      finish,
      run: async () => {
        log.push(`${name}:start`);
        await done;
        log.push(`${name}:end`);
        return name;
      },
    };
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('lets changes of a shared machine run one after the other', async () => {
    store.findSessionLimit.mockResolvedValue(3);
    const log: string[] = [];
    const first = change('first', log);
    const second = change('second', log);

    const firstResult = turns.take(5, first.run);
    const secondResult = turns.take(5, second.run);
    await tick();
    expect(log).toEqual(['first:start']);

    first.finish();
    await firstResult;
    await tick();
    expect(log).toEqual(['first:start', 'first:end', 'second:start']);
    second.finish();
    await expect(secondResult).resolves.toBe('second');
  });

  it('keeps taking turns on a machine whose limit was lowered to 1 while several sessions still run', async () => {
    store.countActiveSessions.mockResolvedValue(2);
    const log: string[] = [];
    const first = change('first', log);
    const second = change('second', log);

    const results = [turns.take(5, first.run), turns.take(5, second.run)];
    await tick();

    expect(log).toEqual(['first:start']);
    first.finish();
    await tick();
    second.finish();
    await Promise.all(results);
  });

  it('does not make independent machines wait for each other', async () => {
    store.findSessionLimit.mockResolvedValue(3);
    const log: string[] = [];
    const busy = change('busy', log);
    const other = change('other', log);

    const results = [turns.take(5, busy.run), turns.take(6, other.run)];
    await tick();

    expect(log).toEqual(['busy:start', 'other:start']);
    busy.finish();
    other.finish();
    await Promise.all(results);
  });

  it('runs a change that is part of a turn already held without asking the store', async () => {
    await expect(turns.take(5, async () => 'nested', true)).resolves.toBe('nested');

    expect(store.findSessionLimit).not.toHaveBeenCalled();
  });

  it('is local without Valkey and distributed with it', () => {
    expect(turns.distributed).toBe(false);
    expect(new SessionChangeTurns(store as unknown as UsageSessionStore, {} as never).distributed).toBe(true);
  });
});
