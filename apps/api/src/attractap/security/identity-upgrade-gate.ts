import type { Provider } from '@nestjs/common';
import type { AttractapConversionState } from '@attraccess/application-models';
import type { ReportedBuild } from './session-security-state';

/** Reads the "Secure this reader" conversion state of a reader; null while no conversion runs. */
export interface ConversionStateReader {
  stateOf(readerId: number): Promise<AttractapConversionState | null>;
}

export const ATTRACTAP_CONVERSION_STATE = Symbol.for('attraccess.attractap.conversion-state');

/**
 * T3 HOOK (ATT-1208): until the conversion exists nothing is ever converting, so this answers null. T3 replaces
 * this provider with one that reads the persisted conversion state.
 */
export const noConversionState: ConversionStateReader = { stateOf: async () => null };

/** T3 HOOK (ATT-1208): the stub provider of ATTRACTAP_CONVERSION_STATE. */
export const conversionStateStubProvider: Provider = {
  provide: ATTRACTAP_CONVERSION_STATE,
  useValue: noConversionState,
};

/**
 * An already authenticated reader may swap its P-256 software identity for its DS key when
 *  - it reported the lab profile `secure-lab` in this session (the lab path), or
 *  - its conversion is in `creating-key` (T3 hook, see ATTRACTAP_CONVERSION_STATE).
 * A plain or release secure reader without a conversion is refused. The profile is the reader's claim: the gate
 * only lets an authenticated reader change its own identity and never yields "secured".
 */
export async function isIdentityUpgradeAllowed(
  readerId: number,
  build: ReportedBuild | null,
  conversions: ConversionStateReader,
): Promise<boolean> {
  if (build?.profile === 'secure-lab') return true;
  return (await conversions.stateOf(readerId)) === 'creating-key';
}
