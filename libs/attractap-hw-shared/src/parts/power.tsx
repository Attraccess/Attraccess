import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export interface Ams1117Props extends BasePartProps {
  readonly outputVoltage?: '3.3V' | '5V' | '1.8V' | '1.2V';
}

export const Ams1117_3v3 = ({ name, pn, outputVoltage = '3.3V', ...rest }: Ams1117Props) => (
  <chip
    name={name}
    footprint="sot223"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{ pin1: ['ADJ_GND'], pin2: ['VOUT'], pin3: ['VIN'], pin4: ['TAB'] }}
    {...rest}
  >
    <fabricationnotetext text={`AMS1117 LDO ${outputVoltage}`} />
  </chip>
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
  >
    <fabricationnotetext text="LM74700 ideal-diode controller" />
  </chip>
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
  >
    <fabricationnotetext text="MP2315 3A sync buck" />
  </chip>
);
