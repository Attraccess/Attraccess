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

export type Usblc6Props = BasePartProps;

export const Usblc6_2Sc6 = ({ name, pn, ...rest }: Usblc6Props) => (
  <chip
    name={name}
    footprint="sot23-6"
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
  />
);
