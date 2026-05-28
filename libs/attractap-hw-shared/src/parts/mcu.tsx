// Espressif MCU wrappers ESP32-P4 bare QFN-104 ESP32-C6 module legacy P4 MINI
// FEATURE: shared lib parts — Core board ATT-349 app MCU + Wi-Fi coprocessor

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Esp32MiniProps = BasePartProps;

const ESP32_P4_NRW32_PIN_LABELS: Record<string, string[]> = {
  pin1: ['GPIO1'],
  pin2: ['GPIO2'],
  pin3: ['GPIO3'],
  pin4: ['GPIO4'],
  pin5: ['GPIO5'],
  pin6: ['GPIO6'],
  pin7: ['GPIO7'],
  pin8: ['GPIO8'],
  pin9: ['VDDPST_1'],
  pin10: ['GPIO9'],
  pin11: ['GPIO10'],
  pin12: ['GPIO11'],
  pin13: ['GPIO12'],
  pin14: ['GPIO13'],
  pin15: ['GPIO14'],
  pin16: ['GPIO15'],
  pin17: ['GPIO16'],
  pin18: ['GPIO17'],
  pin19: ['GPIO18'],
  pin20: ['GPIO19'],
  pin21: ['VDDPST_2'],
  pin22: ['GPIO20'],
  pin23: ['GPIO21'],
  pin24: ['GPIO22'],
  pin25: ['GPIO23'],
  pin26: ['VDD_HP_0'],
  pin27: ['FLASH_CS'],
  pin28: ['FLASH_Q'],
  pin29: ['FLASH_WP'],
  pin30: ['VDDPST_3'],
  pin31: ['FLASH_HOLD'],
  pin32: ['FLASH_CK'],
  pin33: ['FLASH_D'],
  pin34: ['DSI_REXT'],
  pin35: ['DSI_DATAP1'],
  pin36: ['DSI_DATAN1'],
  pin37: ['DSI_CLKN'],
  pin38: ['DSI_CLKP'],
  pin39: ['DSI_DATAP0'],
  pin40: ['DSI_DATAN0'],
  pin41: ['VDD_MIPI_DPHY'],
  pin42: ['CSI_DATAN0'],
  pin43: ['CSI_DATAP0'],
  pin44: ['CSI_CLKP'],
  pin45: ['CSI_CLKN'],
  pin46: ['CSI_DATAN1'],
  pin47: ['CSI_DATAP1'],
  pin48: ['CSI_REXT'],
  pin49: ['DM'],
  pin50: ['DP'],
  pin51: ['VCCA'],
  pin52: ['GPIO24'],
  pin53: ['GPIO25'],
  pin54: ['NC54'],
  pin55: ['GPIO26'],
  pin56: ['GPIO27'],
  pin57: ['GPIO28'],
  pin58: ['GPIO29'],
  pin59: ['VDDPST_A'],
  pin60: ['GPIO30'],
  pin61: ['GPIO31'],
  pin62: ['VDDPST_4'],
  pin63: ['GPIO32'],
  pin64: ['GPIO33'],
  pin65: ['GPIO34'],
  pin66: ['GPIO35'],
  pin67: ['VDDPST_B'],
  pin68: ['GPIO36'],
  pin69: ['GPIO37'],
  pin70: ['GPIO38'],
  pin71: ['VFB_VO1'],
  pin72: ['VFB_VO2'],
  pin73: ['VFB_VO3'],
  pin74: ['VFB_VO4'],
  pin75: ['VDDPST_LDO'],
  pin76: ['VDD_HP_2'],
  pin77: ['VDDPST_DCDC'],
  pin78: ['FB_DCDC'],
  pin79: ['EN_DCDC'],
  pin80: ['GPIO39'],
  pin81: ['GPIO40'],
  pin82: ['GPIO41'],
  pin83: ['GPIO42'],
  pin84: ['GPIO43'],
  pin85: ['VDDPST_5'],
  pin86: ['GPIO44'],
  pin87: ['GPIO45'],
  pin88: ['GPIO46'],
  pin89: ['GPIO47'],
  pin90: ['GPIO48'],
  pin91: ['VDD_HP_3'],
  pin92: ['GPIO49'],
  pin93: ['GPIO50'],
  pin94: ['GPIO51'],
  pin95: ['GPIO52'],
  pin96: ['VDDPST_6'],
  pin97: ['GPIO53'],
  pin98: ['GPIO54'],
  pin99: ['XTAL_N'],
  pin100: ['XTAL_P'],
  pin101: ['VDDA'],
  pin102: ['VBAT'],
  pin103: ['CHIP_PU'],
  pin104: ['GPIO0'],
  pin105: ['GND'],
};

export const Esp32P4Nrw32 = ({ name, pn, ...rest }: Esp32MiniProps) => (
  <chip
    name={name}
    footprint="qfn104_p0.3_w10_h10_pl0.5_pw0.2"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={ESP32_P4_NRW32_PIN_LABELS}
    {...rest}
  />
);

export const Esp32P4Mini1 = ({ name, pn, ...rest }: Esp32MiniProps) => (
  <chip
    name={name}
    footprint="esp32-p4-mini-1"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

const ESP32_C6_MINI_1_PIN_LABELS: Record<string, string[]> = {
  pin1: ['GND1'],
  pin2: ['GND2'],
  pin3: ['VDD3V3'],
  pin4: ['NC4'],
  pin5: ['IO2'],
  pin6: ['IO3'],
  pin7: ['NC7'],
  pin8: ['EN'],
  pin9: ['IO4'],
  pin10: ['IO5'],
  pin11: ['GND11'],
  pin12: ['IO0'],
  pin13: ['IO1'],
  pin14: ['GND14'],
  pin15: ['IO6'],
  pin16: ['IO7'],
  pin17: ['IO12'],
  pin18: ['IO13'],
  pin19: ['IO14'],
  pin20: ['IO15'],
  pin21: ['NC21'],
  pin22: ['IO8'],
  pin23: ['IO9'],
  pin24: ['IO18'],
  pin25: ['IO19'],
  pin26: ['IO20'],
  pin27: ['IO21'],
  pin28: ['IO22'],
  pin29: ['IO23'],
  pin30: ['RXD0'],
  pin31: ['TXD0'],
  pin32: ['NC32'],
  pin33: ['NC33'],
  pin34: ['NC34'],
  pin35: ['NC35'],
  pin36: ['GND36'],
  pin37: ['GND37'],
  pin38: ['GND38'],
  pin39: ['GND39'],
  pin40: ['GND40'],
  pin41: ['GND41'],
  pin42: ['GND42'],
  pin43: ['GND43'],
  pin44: ['GND44'],
  pin45: ['GND45'],
  pin46: ['GND46'],
  pin47: ['GND47'],
  pin48: ['GND48'],
  pin49: ['GND49'],
  pin50: ['GND50'],
  pin51: ['GND51'],
  pin52: ['GND52'],
  pin53: ['GND53'],
};

const C6_BODY_W = 13.2;
const C6_BODY_H = 16.6;
const C6_PERIM_PAD_W = 0.5;
const C6_PERIM_PAD_H = 0.9;
const C6_PERIM_PITCH = 1.0;
const C6_PAD_TO_BODY_EDGE = 0.45;
const C6_LEFT_COUNT = 11;
const C6_BOTTOM_COUNT = 13;
const C6_RIGHT_COUNT = 11;
const C6_PERIM_TOTAL = C6_LEFT_COUNT + C6_BOTTOM_COUNT + C6_RIGHT_COUNT;
const C6_THERM_COLS = 3;
const C6_THERM_ROWS = 6;
const C6_THERM_PAD = 1.2;
const C6_THERM_PITCH_X = 1.8;
const C6_THERM_PITCH_Y = 1.8;
const C6_PAD_BBOX_Y_TOP = ((C6_LEFT_COUNT - 1) / 2) * C6_PERIM_PITCH + C6_PERIM_PAD_H / 2;
const C6_PAD_BBOX_Y_BOTTOM = -C6_BODY_H / 2 - C6_PAD_TO_BODY_EDGE - C6_PERIM_PAD_W / 2;
const C6_BBOX_CENTER_Y = (C6_PAD_BBOX_Y_TOP + C6_PAD_BBOX_Y_BOTTOM) / 2;

const c6MiniPadAt = (idx: number) => {
  if (idx < C6_LEFT_COUNT) {
    const x = -C6_BODY_W / 2 - C6_PAD_TO_BODY_EDGE;
    const start_y = ((C6_LEFT_COUNT - 1) / 2) * C6_PERIM_PITCH;
    const y = start_y - idx * C6_PERIM_PITCH;
    return { x, y, rotation: 0 };
  }
  if (idx < C6_LEFT_COUNT + C6_BOTTOM_COUNT) {
    const local = idx - C6_LEFT_COUNT;
    const y = -C6_BODY_H / 2 - C6_PAD_TO_BODY_EDGE;
    const start_x = -((C6_BOTTOM_COUNT - 1) / 2) * C6_PERIM_PITCH;
    const x = start_x + local * C6_PERIM_PITCH;
    return { x, y, rotation: 90 };
  }
  const local = idx - C6_LEFT_COUNT - C6_BOTTOM_COUNT;
  const x = C6_BODY_W / 2 + C6_PAD_TO_BODY_EDGE;
  const start_y = -((C6_RIGHT_COUNT - 1) / 2) * C6_PERIM_PITCH;
  const y = start_y + local * C6_PERIM_PITCH;
  return { x, y, rotation: 0 };
};

const c6ThermalPadAt = (idx: number) => {
  const col = idx % C6_THERM_COLS;
  const row = Math.floor(idx / C6_THERM_COLS);
  const start_x = -((C6_THERM_COLS - 1) / 2) * C6_THERM_PITCH_X;
  const start_y = -((C6_THERM_ROWS - 1) / 2) * C6_THERM_PITCH_Y;
  return { x: start_x + col * C6_THERM_PITCH_X, y: start_y + row * C6_THERM_PITCH_Y };
};

export const Esp32C6Mini1 = ({ name, pn, ...rest }: Esp32MiniProps) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={ESP32_C6_MINI_1_PIN_LABELS}
    {...rest}
  >
    <footprint>
      {Array.from({ length: C6_PERIM_TOTAL }).map((_, idx) => {
        const p = c6MiniPadAt(idx);
        const isVert = p.rotation === 90;
        return (
          <smtpad
            shape="rect"
            portHints={[`pin${idx + 1}`]}
            pcbX={p.x}
            pcbY={p.y}
            width={`${isVert ? C6_PERIM_PAD_H : C6_PERIM_PAD_W}mm`}
            height={`${isVert ? C6_PERIM_PAD_W : C6_PERIM_PAD_H}mm`}
          />
        );
      })}
      {Array.from({ length: C6_THERM_COLS * C6_THERM_ROWS }).map((_, idx) => {
        const p = c6ThermalPadAt(idx);
        return (
          <smtpad
            shape="rect"
            portHints={[`pin${C6_PERIM_TOTAL + idx + 1}`]}
            pcbX={p.x}
            pcbY={p.y}
            width={`${C6_THERM_PAD}mm`}
            height={`${C6_THERM_PAD}mm`}
          />
        );
      })}
      <silkscreenpath
        route={[
          { x: -C6_BODY_W / 2, y: -C6_BODY_H / 2 + C6_BBOX_CENTER_Y },
          { x:  C6_BODY_W / 2, y: -C6_BODY_H / 2 + C6_BBOX_CENTER_Y },
          { x:  C6_BODY_W / 2, y:  C6_BODY_H / 2 + C6_BBOX_CENTER_Y },
          { x: -C6_BODY_W / 2, y:  C6_BODY_H / 2 + C6_BBOX_CENTER_Y },
          { x: -C6_BODY_W / 2, y: -C6_BODY_H / 2 + C6_BBOX_CENTER_Y },
        ]}
        strokeWidth="0.12mm"
      />
      <silkscreencircle pcbX={-C6_BODY_W / 2 - 1.2} pcbY={C6_BODY_H / 2 - 0.5 + C6_BBOX_CENTER_Y} radius={0.2} strokeWidth="0.12mm" />
    </footprint>
  </chip>
);
