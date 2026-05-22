import { J_POE } from './j-poe';
import { J_PWR_DC } from './j-pwr-dc';
import { J_NFC } from './j-nfc';
import { J_BEEP } from './j-beep';
import { J_DISP } from './j-disp';
import type { ConnectorSpec } from './types';

export * from './types';
export { J_POE } from './j-poe';
export type { JPoeSignal } from './j-poe';
export { J_PWR_DC } from './j-pwr-dc';
export type { JPwrDcSignal } from './j-pwr-dc';
export { J_NFC } from './j-nfc';
export type { JNfcSignal } from './j-nfc';
export { J_BEEP } from './j-beep';
export type { JBeepSignal } from './j-beep';
export { J_DISP } from './j-disp';
export type { JDispSignal } from './j-disp';

export const ALL_CONNECTORS: readonly ConnectorSpec[] = [
  J_POE,
  J_PWR_DC,
  J_NFC,
  J_BEEP,
  J_DISP,
] as const;
