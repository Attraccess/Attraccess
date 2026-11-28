import type { TransactionScope } from '../../../database/unit-of-work';
import { MachineBusyError } from '../errors/machine-busy.error';
import { ProjectSwitchPendingError } from '../errors/project-switch-pending.error';
import type { UsageSessionStore } from '../usage-session-store.port';

/**
 * How long a flow's change waits for a switch that is pending. A switch always finishes (its flow and meter steps time
 * out, and one left by a crashed instance is cleaned up), but its flow may well take longer than the wait for a
 * machine. Nobody retries a flow's change, so it waits that long.
 */
export const PROJECT_SWITCH_WAIT_MS = 10 * 60_000;
/** The first pause before trying again; each further pause doubles, up to `RETRY_MAX_MS`. */
export const RETRY_FIRST_MS = 200;
export const RETRY_MAX_MS = 3_000;

export interface ProjectSwitchWait {
  /** How long the whole change may take while a switch holds it up; then its last error is thrown. */
  waitMs?: number;
}

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
 * `MachineBusyError`, once `wait.waitMs` (default `PROJECT_SWITCH_WAIT_MS`) is over; the switch holding a shared
 * machine may be another session's. The pauses between tries grow from `RETRY_FIRST_MS` to `RETRY_MAX_MS`.
 */
export async function acrossProjectSwitches<T>(
  sessions: Pick<UsageSessionStore, 'findContinuationId' | 'isProjectSwitchPending'>,
  resourceId: number,
  usageId: number,
  change: (partId: number) => Promise<T>,
  wait: ProjectSwitchWait = {},
): Promise<T> {
  const giveUpAt = Date.now() + (wait.waitMs ?? PROJECT_SWITCH_WAIT_MS);
  let partId = usageId;
  let pauseMs = RETRY_FIRST_MS;
  for (;;) {
    partId = await findLatestPartId(sessions, partId);
    const wasSwitching = await sessions.isProjectSwitchPending(resourceId);
    try {
      return await change(partId);
    } catch (error) {
      if ((await sessions.findContinuationId(partId)) !== null) continue;
      const left = giveUpAt - Date.now();
      if (left <= 0 || !(await heldUpBySwitch(sessions, resourceId, error, wasSwitching))) throw error;
      await pause(Math.min(pauseMs, left));
      pauseMs = Math.min(pauseMs * 2, RETRY_MAX_MS);
    }
  }
}

/** Whether a change failed only because a switch, of its session or another on the machine, was pending. */
async function heldUpBySwitch(
  sessions: Pick<UsageSessionStore, 'isProjectSwitchPending'>,
  resourceId: number,
  error: unknown,
  wasSwitching: boolean,
): Promise<boolean> {
  if (error instanceof ProjectSwitchPendingError) return true;
  if (!(error instanceof MachineBusyError)) return false;
  return wasSwitching || (await sessions.isProjectSwitchPending(resourceId));
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
