import { type Snapshot } from './runtime';
import { snapshot } from './runtime.spec.snapshot';

export const pulsedSnapshot: Snapshot = {
  ...snapshot,
  logicalChannels: [{ ...snapshot.logicalChannels[0], capabilities: ['output', 'pulse'], pulse: { durationMs: 10 } }],
};
