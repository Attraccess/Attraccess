// Power-path part wrappers regulators ideal-diode mux Schottky for V2 boards
// FEATURE: shared lib parts — Core ATT-349 power tree + future Phase 2 boards

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const SOT583_PAD_PITCH = 0.4;
const SOT583_PAD_W = 0.2;
const SOT583_PAD_H = 0.6;
const SOT583_PAD_ROW_DY = 0.55;

const sot583Pads = (labels: readonly string[]) => (
  <footprint>
    {labels.map((_label, idx) => {
      const isBottom = idx >= 4;
      const col = isBottom ? 7 - idx : idx;
      const x = (col - 1.5) * SOT583_PAD_PITCH;
      const y = isBottom ? -SOT583_PAD_ROW_DY : SOT583_PAD_ROW_DY;
      return (
        <smtpad
          shape="rect"
          portHints={[`pin${idx + 1}`]}
          pcbX={x}
          pcbY={y}
          width={`${SOT583_PAD_W}mm`}
          height={`${SOT583_PAD_H}mm`}
        />
      );
    })}
    <silkscreenpath
      route={[
        { x: -0.8, y: -0.8 },
        { x: 0.8, y: -0.8 },
        { x: 0.8, y: 0.8 },
        { x: -0.8, y: 0.8 },
        { x: -0.8, y: -0.8 },
      ]}
      strokeWidth="0.1mm"
    />
    <silkscreencircle pcbX={-1.0} pcbY={0.9} radius={0.15} strokeWidth="0.1mm" />
  </footprint>
);

export type Lm66200Props = BasePartProps;

const LM66200_PINS = ['GND_A', 'VOUT_A', 'VIN1', 'ON_N', 'GND_B', 'VIN2', 'VOUT_B', 'ST'] as const;

export const Lm66200 = ({ name, pn, ...rest }: Lm66200Props) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['GND_A'],
      pin2: ['VOUT_A'],
      pin3: ['VIN1'],
      pin4: ['ON_N'],
      pin5: ['GND_B'],
      pin6: ['VIN2'],
      pin7: ['VOUT_B'],
      pin8: ['ST'],
    }}
    {...rest}
  >
    {sot583Pads(LM66200_PINS)}
  </chip>
);

export type Tps62933Props = BasePartProps;

const TPS62933_PINS = ['RT', 'EN', 'VIN', 'GND', 'SW', 'BST', 'PG', 'FB'] as const;

export const Tps62933 = ({ name, pn, ...rest }: Tps62933Props) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['RT'],
      pin2: ['EN'],
      pin3: ['VIN'],
      pin4: ['GND'],
      pin5: ['SW'],
      pin6: ['BST'],
      pin7: ['PG'],
      pin8: ['FB'],
    }}
    {...rest}
  >
    {sot583Pads(TPS62933_PINS)}
  </chip>
);

export type Ss34Props = BasePartProps;

export const Ss34 = ({ name, pn, ...rest }: Ss34Props) => (
  <diode
    name={name}
    footprint="sma"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Ams1117Props = BasePartProps;

export const Ams1117_3v3 = ({ name, pn, ...rest }: Ams1117Props) => (
  <chip
    name={name}
    footprint="sot223"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{ pin1: ['ADJ_GND'], pin2: ['VOUT'], pin3: ['VIN'], pin4: ['TAB'] }}
    {...rest}
  />
);

export type Lm74700Props = BasePartProps;

export const Lm74700 = ({ name, pn, ...rest }: Lm74700Props) => (
  <chip
    name={name}
    footprint="sot23-6"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['ANODE'],
      pin2: ['GATE'],
      pin3: ['VCAP'],
      pin4: ['GND'],
      pin5: ['EN'],
      pin6: ['CATHODE'],
    }}
    {...rest}
  />
);

export type Mp2315Props = BasePartProps;

export const Mp2315 = ({ name, pn, ...rest }: Mp2315Props) => (
  <chip
    name={name}
    footprint="soic8"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['BST'],
      pin2: ['VIN'],
      pin3: ['SW'],
      pin4: ['GND'],
      pin5: ['FB'],
      pin6: ['COMP'],
      pin7: ['EN'],
      pin8: ['SS'],
    }}
    {...rest}
  />
);
