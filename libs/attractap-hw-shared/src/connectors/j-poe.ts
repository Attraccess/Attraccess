import type { ConnectorSpec } from './types';

export type JPoeSignal =
  | '+5V'
  | 'GND'
  | 'RMII_TXD0'
  | 'RMII_TXD1'
  | 'RMII_TX_EN'
  | 'RMII_RXD0'
  | 'RMII_RXD1'
  | 'RMII_CRS_DV'
  | 'RMII_REF_CLK'
  | 'MDIO'
  | 'MDC'
  | 'nRST'
  | 'NC';

export const J_POE = {
  name: 'J_POE',
  footprint: 'B2B 1.27mm 2x8 (16 pin)',
  pitch: '1.27mm',
  pinCount: 16,
  expectedPowerPins: 2,
  expectedGndPins: 3,
  requiredSignals: [
    '+5V',
    'GND',
    'RMII_TXD0',
    'RMII_TXD1',
    'RMII_TX_EN',
    'RMII_RXD0',
    'RMII_RXD1',
    'RMII_CRS_DV',
    'RMII_REF_CLK',
    'MDIO',
    'MDC',
    'nRST',
  ] as const,
  pins: {
    1: { signal: '+5V', direction: 'power', voltage: '+5V' },
    2: { signal: '+5V', direction: 'power', voltage: '+5V' },
    3: { signal: 'GND', direction: 'gnd' },
    4: { signal: 'GND', direction: 'gnd' },
    5: { signal: 'RMII_TXD0', direction: 'out' },
    6: { signal: 'RMII_TXD1', direction: 'out' },
    7: { signal: 'RMII_TX_EN', direction: 'out' },
    8: { signal: 'RMII_RXD0', direction: 'in' },
    9: { signal: 'RMII_RXD1', direction: 'in' },
    10: { signal: 'RMII_CRS_DV', direction: 'in' },
    11: { signal: 'RMII_REF_CLK', direction: 'in', notes: '50MHz reference clock from PHY' },
    12: { signal: 'MDIO', direction: 'bidir' },
    13: { signal: 'MDC', direction: 'out' },
    14: { signal: 'nRST', direction: 'out', notes: 'PHY reset, active low' },
    15: { signal: 'GND', direction: 'gnd' },
    16: { signal: 'NC', direction: 'in', notes: 'Reserved / no connect' },
  },
} as const satisfies ConnectorSpec<JPoeSignal>;
