import type { SessionChangeQueue } from '../session-change-queue';
import type { ResourceUsageService } from '../resource-usage.service';
import { usageInternals } from './compose.test-fixture';

/** Resolves once `check` holds, looking every few milliseconds; fails with `what` when it never does. */
export async function until(check: () => boolean | Promise<boolean>, what: string, timeoutMs = 15_000): Promise<void> {
  const giveUpAt = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > giveUpAt) throw new Error(`Timed out waiting until ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Anything that runs SQL on the test database, such as its data source. */
type SqlRunner = { query(sql: string): Promise<unknown> };

/** Whether some transaction of the test database waits for a lock (a row) another one holds. */
export async function someoneWaitsForALock(source: SqlRunner): Promise<boolean> {
  const [{ waiting }] = (await source.query(
    `SELECT count(*)::int AS waiting FROM pg_stat_activity
     WHERE datname = current_database() AND wait_event_type = 'Lock'`,
  )) as Array<{ waiting: number }>;
  return waiting > 0;
}

/** The queue of machine turns of a service (or of a forked instance with its own queue). */
export function queueOf(service: ResourceUsageService): SessionChangeQueue {
  return Reflect.get(usageInternals(service).turns, 'sessionChangeQueue') as SessionChangeQueue;
}

/**
 * Watches how changes meet a pending project switch from now on: refused in the database because their session is
 * being switched (`refused`), or asking for the machine's turn (`turnsAsked`, once per try; a second try follows a
 * wait that gave up).
 */
export function watchSwitchHoldUps(service: ResourceUsageService, queue = queueOf(service)) {
  const { sessions } = usageInternals(service).lifecycle;
  const seen = { refused: 0, turnsAsked: 0 };
  const isSessionBeingSwitched = sessions.isSessionBeingSwitched.bind(sessions);
  jest.spyOn(sessions, 'isSessionBeingSwitched').mockImplementation(async (...args) => {
    const switching = await isSessionBeingSwitched(...args);
    if (switching) seen.refused++;
    return switching;
  });
  const run = queue.run.bind(queue);
  jest.spyOn(queue, 'run').mockImplementation((...args) => {
    seen.turnsAsked++;
    return run(...args);
  });
  return {
    seen,
    /** A change met the switch: refused as being switched, or waiting for the turn the switch holds. */
    heldUp: () => until(() => seen.refused > 0 || seen.turnsAsked > 0, 'a change is held up by the switch'),
    /** A change waited for the turn, gave up on the busy machine and asked again. */
    retried: () => until(() => seen.turnsAsked > 1, 'a change asks for the machine again after a busy machine'),
  };
}
