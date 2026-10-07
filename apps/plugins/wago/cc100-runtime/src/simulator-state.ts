import { type RuntimeState } from './runtime';
export type SimulatorState = RuntimeState & {
  simulatorHardwareId?: string;
  simulatorPairingCode?: string;
  operationalPrefix?: string;
};

import { JsonStateStore } from './runtime';
export const statePath = process.env.WAGO_STATE_PATH ?? '/var/lib/attraccess-wago/state.json';

export const store = new JsonStateStore(statePath);
