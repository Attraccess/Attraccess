import {
  ATTRACTAP_CONVERSION_TERMINAL_STATES,
  type AttractapConversionState as SharedState,
} from '@attraccess/application-models';
import type { AttractapConversionState, SecureConversionStatusDto } from '@attraccess/react-query-client';

// Plain strings (the generated enum's values): components that import these stay usable with a mocked client.
type State = `${AttractapConversionState}`;

/** States in which a power loss can leave the reader unusable: the UI shows "Don't unplug". */
export const CRITICAL_STATES: readonly State[] = ['digests-burned', 'bootloader-written', 'encrypting', 'migrating'];

export const isRunning = (state: AttractapConversionState | State) =>
  !ATTRACTAP_CONVERSION_TERMINAL_STATES.includes(state as SharedState);
export const isCritical = (state: AttractapConversionState | State) => CRITICAL_STATES.includes(state as State);

/** How often the progress view asks the server for the conversion's state while the reader is working on it. */
export const POLL_INTERVAL_MS = 2000;
/** How often the view checks for changes it did not start (gates, an interrupted reader coming back). */
export const IDLE_POLL_MS = 10_000;

/** Whether the reader's latest conversion is still running (`interrupted` included). */
export const runningIn = (status: SecureConversionStatusDto | undefined) =>
  !!status?.conversion && isRunning(status.conversion.state);

/** The status query's interval: fast while a conversion runs, slow while it waits for the reader, off once it ended. */
export function statusPollInterval(
  status: SecureConversionStatusDto | undefined,
  readerSecured: boolean,
): number | false {
  const state = status?.conversion?.state as State | undefined;
  if (!state) return readerSecured ? false : IDLE_POLL_MS;
  if (!isRunning(state)) return false;
  return state === 'interrupted' ? IDLE_POLL_MS : POLL_INTERVAL_MS;
}

/** Eligibility only matters while the button can show: not during a conversion, not for a secured reader. */
export function eligibilityNeeded(status: SecureConversionStatusDto | undefined, readerSecured: boolean): boolean {
  return !readerSecured && !runningIn(status);
}

export function stateColor(state: AttractapConversionState | State): 'success' | 'danger' | 'default' | 'warning' {
  if (state === 'secured') return 'success';
  if (state === 'failed' || state === 'interrupted') return 'danger';
  if (state === 'cancelled') return 'default';
  return 'warning';
}
