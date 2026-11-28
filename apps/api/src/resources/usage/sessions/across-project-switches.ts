import { setTimeout as sleep } from 'node:timers/promises';
import type { TransactionScope } from '../../../database/unit-of-work';
import { MachineBusyError } from '../errors/machine-busy.error';
import { ProjectSwitchPendingError } from '../errors/project-switch-pending.error';
import type { UsageSessionStore } from '../usage-session-store.port';

/**
 * How long a change waits for a switch that is pending. A switch always finishes (its flow and meter steps time out,
 * and one left by a crashed instance is cleaned up), but its flow may well take longer than the wait for a machine.
 */
export const PROJECT_SWITCH_WAIT_MS = 10 * 60_000;
const RETRY_EVERY_MS = 200;

/** The id of the part a session runs on as: the given one, unless its project was switched since. */
export async function findLatestPartId(
  sessions: Pick<UsageSessionStore, 'findContinuationId'>,
  usageId: number,
  context?: TransactionScope,
): Promise<number> {
  let latest = usageId;
  for (let next: number | null = usageId; next !== null; next = await sessions.findContinuationId(next, context)) {
    latest = next;
  }
  return latest;
}

/**
 * Applies a change to a session while projects of the machine's sessions may be switched. `change` gets the id of the
 * part the session runs on as. It runs again on the continuation when a switch committed first, and after a wait while
 * a switch is pending: it then reaches the continuation, or the old part when the switch was rolled back. It reports a
 * pending switch of its session with `ProjectSwitchPendingError`, or gives up on a busy machine with
 * `MachineBusyError`; the switch holding a shared machine may be another session's.
 */
export async function acrossProjectSwitches<T>(
  sessions: Pick<UsageSessionStore, 'findContinuationId' | 'isProjectSwitchPending'>,
  resourceId: number,
  usageId: number,
  change: (partId: number) => Promise<T>,
): Promise<T> {
  const giveUpAt = Date.now() + PROJECT_SWITCH_WAIT_MS;
  let partId = usageId;
  for (;;) {
    partId = await findLatestPartId(sessions, partId);
    const wasSwitching = await sessions.isProjectSwitchPending(resourceId);
    try {
      return await change(partId);
    } catch (error) {
      if ((await sessions.findContinuationId(partId)) !== null) continue;
      const heldUpBySwitch =
        error instanceof ProjectSwitchPendingError ||
        (error instanceof MachineBusyError && (wasSwitching || (await sessions.isProjectSwitchPending(resourceId))));
      if (!heldUpBySwitch || Date.now() >= giveUpAt) throw error;
      await sleep(RETRY_EVERY_MS);
    }
  }
}
