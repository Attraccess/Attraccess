// Discrete part wrappers MOSFETs diodes modeled as chips for BOM PN export
// FEATURE: shared lib parts — workaround tscircuit mosfet supplier PN drop

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Ao3400Props = BasePartProps;

export const Ao3400 = ({ name, pn, ...rest }: Ao3400Props) => (
  <chip
    name={name}
    footprint="sot23"
    pinLabels={{ pin1: ['gate'], pin2: ['source'], pin3: ['drain'] }}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Diode1N4148WsProps = BasePartProps;

export const Diode1N4148Ws = ({ name, pn, ...rest }: Diode1N4148WsProps) => (
  <diode
    name={name}
    footprint="sod123"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

const SOT23_6_PITCH = 0.95;
const SOT23_6_PAD_W = 0.6;
const SOT23_6_PAD_L = 1.0;
const SOT23_6_PAD_ROW_Y = 1.3;
const SOT23_6_BODY_W = 2.9;
const SOT23_6_BODY_H = 1.6;

const SOT23_6_PAD_POSITIONS: Array<readonly [string, number, number]> = [
  ['pin1', -SOT23_6_PITCH,  SOT23_6_PAD_ROW_Y],
  ['pin2',  0,              SOT23_6_PAD_ROW_Y],
  ['pin3',  SOT23_6_PITCH,  SOT23_6_PAD_ROW_Y],
  ['pin4',  SOT23_6_PITCH, -SOT23_6_PAD_ROW_Y],
  ['pin5',  0,             -SOT23_6_PAD_ROW_Y],
  ['pin6', -SOT23_6_PITCH, -SOT23_6_PAD_ROW_Y],
];

export type Usblc6Props = BasePartProps;

export const Usblc6_2Sc6 = ({ name, pn, ...rest }: Usblc6Props) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['IO1_A'],
      pin2: ['GND'],
      pin3: ['IO2_A'],
      pin4: ['IO2_B'],
      pin5: ['VBUS'],
      pin6: ['IO1_B'],
    }}
    {...rest}
  >
    <footprint>
      {SOT23_6_PAD_POSITIONS.map(([hint, x, y]) => (
        <smtpad
          shape="rect"
          portHints={[hint]}
          pcbX={x}
          pcbY={y}
          width={`${SOT23_6_PAD_W}mm`}
          height={`${SOT23_6_PAD_L}mm`}
        />
      ))}
      <silkscreenpath
        route={[
          { x: -SOT23_6_BODY_W / 2, y: -SOT23_6_BODY_H / 2 },
          { x:  SOT23_6_BODY_W / 2, y: -SOT23_6_BODY_H / 2 },
          { x:  SOT23_6_BODY_W / 2, y:  SOT23_6_BODY_H / 2 },
          { x: -SOT23_6_BODY_W / 2, y:  SOT23_6_BODY_H / 2 },
          { x: -SOT23_6_BODY_W / 2, y: -SOT23_6_BODY_H / 2 },
        ]}
        strokeWidth="0.1mm"
      />
      <silkscreencircle pcbX={-SOT23_6_BODY_W / 2 - 0.4} pcbY={SOT23_6_PAD_ROW_Y} radius={0.15} strokeWidth="0.1mm" />
    </footprint>
  </chip>
);
