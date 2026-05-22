import type { ConnectorSpec } from './types';

export type JBeepSignal = '+5V' | 'GND' | 'PWM';

export const J_BEEP = {
  name: 'J_BEEP',
  footprint: 'JST PH 1.25mm 3P',
  pitch: '1.25mm',
  pinCount: 3,
  expectedPowerPins: 1,
  expectedGndPins: 1,
  requiredSignals: ['+5V', 'GND', 'PWM'] as const,
  pins: {
    1: { signal: '+5V', direction: 'power', voltage: '+5V' },
    2: { signal: 'GND', direction: 'gnd' },
    3: { signal: 'PWM', direction: 'in', notes: 'Beeper drive, PWM from MCU' },
  },
} as const satisfies ConnectorSpec<JBeepSignal>;
