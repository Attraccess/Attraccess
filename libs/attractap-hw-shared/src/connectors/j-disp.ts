import type { ConnectorSpec } from './types';

export type JDispSignal =
  | '+5V'
  | '+3V3'
  | 'GND'
  | 'DSI_D0_P'
  | 'DSI_D0_N'
  | 'DSI_D1_P'
  | 'DSI_D1_N'
  | 'DSI_CLK_P'
  | 'DSI_CLK_N'
  | 'RESET'
  | 'BL_PWM'
  | 'BL_EN'
  | 'TOUCH_I2C_SDA'
  | 'TOUCH_I2C_SCL'
  | 'TOUCH_INT'
  | 'TOUCH_RST';

export const J_DISP = {
  name: 'J_DISP',
  footprint: 'B2B 0.5mm 2x10 (20 pin) — FFC alternate allowed',
  pitch: '0.5mm',
  pinCount: 20,
  expectedPowerPins: 2,
  expectedGndPins: 5,
  requiredSignals: [
    '+5V',
    '+3V3',
    'GND',
    'DSI_D0_P',
    'DSI_D0_N',
    'DSI_D1_P',
    'DSI_D1_N',
    'DSI_CLK_P',
    'DSI_CLK_N',
    'RESET',
    'BL_PWM',
    'BL_EN',
    'TOUCH_I2C_SDA',
    'TOUCH_I2C_SCL',
    'TOUCH_INT',
    'TOUCH_RST',
  ] as const,
  pins: {
    1: { signal: '+5V', direction: 'power', voltage: '+5V', notes: 'Backlight rail' },
    2: { signal: '+3V3', direction: 'power', voltage: '+3V3', notes: 'Panel logic rail' },
    3: { signal: 'GND', direction: 'gnd' },
    4: { signal: 'DSI_CLK_P', direction: 'out', notes: 'MIPI-DSI clock lane positive' },
    5: { signal: 'DSI_CLK_N', direction: 'out', notes: 'MIPI-DSI clock lane negative' },
    6: { signal: 'GND', direction: 'gnd' },
    7: { signal: 'DSI_D0_P', direction: 'out', notes: 'MIPI-DSI data lane 0 positive' },
    8: { signal: 'DSI_D0_N', direction: 'out', notes: 'MIPI-DSI data lane 0 negative' },
    9: { signal: 'GND', direction: 'gnd' },
    10: { signal: 'DSI_D1_P', direction: 'out', notes: 'MIPI-DSI data lane 1 positive' },
    11: { signal: 'DSI_D1_N', direction: 'out', notes: 'MIPI-DSI data lane 1 negative' },
    12: { signal: 'GND', direction: 'gnd' },
    13: { signal: 'RESET', direction: 'out', notes: 'Panel reset, active low' },
    14: { signal: 'BL_PWM', direction: 'out', notes: 'Backlight PWM dim' },
    15: { signal: 'BL_EN', direction: 'out', notes: 'Backlight enable' },
    16: { signal: 'TOUCH_I2C_SDA', direction: 'bidir' },
    17: { signal: 'TOUCH_I2C_SCL', direction: 'out' },
    18: { signal: 'TOUCH_INT', direction: 'in', notes: 'Touch controller IRQ' },
    19: { signal: 'TOUCH_RST', direction: 'out', notes: 'Touch controller reset' },
    20: { signal: 'GND', direction: 'gnd' },
  },
} as const satisfies ConnectorSpec<JDispSignal>;
