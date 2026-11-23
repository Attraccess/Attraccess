import type { AttractapConversionState } from '@attraccess/react-query-client';

// Plain strings (the generated enum's values): components that import these stay usable with a mocked client.
type State = `${AttractapConversionState}`;

/** States in which a power loss can leave the reader unusable: the UI shows "Don't unplug". */
export const CRITICAL_STATES: readonly State[] = ['digests-burned', 'bootloader-written', 'encrypting', 'migrating'];

/** States that end a conversion; everything else is still running (and polled). */
export const ENDED_STATES: readonly State[] = ['secured', 'failed', 'cancelled'];

export const isRunning = (state: AttractapConversionState | State) => !ENDED_STATES.includes(state as State);
export const isCritical = (state: AttractapConversionState | State) => CRITICAL_STATES.includes(state as State);

/** How often the progress view asks the server for the conversion's state. */
export const POLL_INTERVAL_MS = 2000;

export function stateColor(state: AttractapConversionState | State): 'success' | 'danger' | 'default' | 'warning' {
  if (state === 'secured') return 'success';
  if (state === 'failed' || state === 'interrupted') return 'danger';
  if (state === 'cancelled') return 'default';
  return 'warning';
}
