import type { ConnectorSpec } from './types';

export type JNfcSignal =
  | '+3V3'
  | '+5V'
  | 'GND'
  | 'I2C_SDA'
  | 'I2C_SCL'
  | 'IRQ'
  | 'RSTPDN'
  | 'LED_DATA'
  | 'NC';

export const J_NFC = {
  name: 'J_NFC',
  footprint: 'B2B 1.27mm 2x5 (10 pin)',
  pitch: '1.27mm',
  pinCount: 10,
  expectedPowerPins: 2,
  expectedGndPins: 2,
  requiredSignals: [
    '+3V3',
    '+5V',
    'GND',
    'I2C_SDA',
    'I2C_SCL',
    'IRQ',
    'RSTPDN',
    'LED_DATA',
  ] as const,
  pins: {
    1: { signal: '+3V3', direction: 'power', voltage: '+3V3', notes: 'PN532 logic supply' },
    2: { signal: 'GND', direction: 'gnd' },
    3: { signal: 'I2C_SDA', direction: 'bidir' },
    4: { signal: 'I2C_SCL', direction: 'in', notes: 'I2C clock from MCU' },
    5: { signal: 'IRQ', direction: 'out', notes: 'PN532 IRQ to MCU' },
    6: { signal: 'RSTPDN', direction: 'in', notes: 'PN532 reset / power-down from MCU' },
    7: { signal: 'LED_DATA', direction: 'in', notes: 'WS2812 data in, MCU-driven' },
    8: { signal: '+5V', direction: 'power', voltage: '+5V', notes: 'WS2812 ring supply' },
    9: { signal: 'GND', direction: 'gnd' },
    10: { signal: 'NC', direction: 'in', notes: 'Reserved / no connect' },
  },
} as const satisfies ConnectorSpec<JNfcSignal>;
