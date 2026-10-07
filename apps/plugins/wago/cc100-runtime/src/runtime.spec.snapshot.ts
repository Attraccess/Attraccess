import { type Snapshot } from './runtime';
export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [{ id: 'output-1', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [
    {
      id: 'load',
      physicalPointId: 'output-1',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'immediate' },
    },
  ],
};
