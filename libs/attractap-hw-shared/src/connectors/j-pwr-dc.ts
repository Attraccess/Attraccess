import type { ConnectorSpec } from './types';

export type JPwrDcSignal = '+5V' | 'GND';

export const J_PWR_DC = {
  name: 'J_PWR_DC',
  footprint: 'JST PH 1.25mm 4P',
  pitch: '1.25mm',
  pinCount: 4,
  expectedPowerPins: 2,
  expectedGndPins: 2,
  requiredSignals: ['+5V', 'GND'] as const,
  pins: {
    1: { signal: '+5V', direction: 'power', voltage: '+5V' },
    2: { signal: '+5V', direction: 'power', voltage: '+5V' },
    3: { signal: 'GND', direction: 'gnd' },
    4: { signal: 'GND', direction: 'gnd' },
  },
} as const satisfies ConnectorSpec<JPwrDcSignal>;
