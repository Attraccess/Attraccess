import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Ams1117Props = BasePartProps;

export const Ams1117_3v3 = ({ name, pn, ...rest }: Ams1117Props) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{ pin1: ['ADJ_GND'], pin2: ['VOUT'], pin3: ['VIN'], pin4: ['TAB'] }}
    footprint={
      <footprint>
        <smtpad portHints={['pin1']} shape="rect" pcbX={-2.30} pcbY={-3.10} width="1.00mm" height="2.00mm" layer="top" />
        <smtpad portHints={['pin2']} shape="rect" pcbX={0.00} pcbY={-3.10} width="1.00mm" height="2.00mm" layer="top" />
        <smtpad portHints={['pin3']} shape="rect" pcbX={2.30} pcbY={-3.10} width="1.00mm" height="2.00mm" layer="top" />
        <smtpad portHints={['pin4']} shape="rect" pcbX={0.00} pcbY={3.10} width="3.60mm" height="2.20mm" layer="top" />
      </footprint>
    }
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
