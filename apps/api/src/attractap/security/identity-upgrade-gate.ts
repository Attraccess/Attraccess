import type { ReportedBuild } from './session-security-state';

/** The conversion states of a reader. T3 (ATT-1208) owns the state machine; T2 only needs `creating-key`. */
export type ConversionState = 'creating-key' | string;

/**
 * T3 HOOK (ATT-1208): the reader's conversion state. Until the conversion exists nothing is ever converting,
 * so this answers null. T3 replaces the body with a read of the persisted conversion state.
 */
export async function readerConversionState(_readerId: number): Promise<ConversionState | null> {
  return null;
}

/**
 * An already authenticated reader may swap its P-256 software identity for its DS key when
 *  - it reported the lab profile `secure-lab` in this session (the lab path), or
 *  - its conversion is in `creating-key` (T3 hook, see readerConversionState).
 * A plain or release secure reader without a conversion is refused. The profile is the reader's claim: the gate
 * only lets an authenticated reader change its own identity and never yields "secured".
 */
export async function isIdentityUpgradeAllowed(
  readerId: number,
  build: ReportedBuild | null,
  conversionState: (readerId: number) => Promise<ConversionState | null> = readerConversionState,
): Promise<boolean> {
  if (build?.profile === 'secure-lab') return true;
  return (await conversionState(readerId)) === 'creating-key';
}
