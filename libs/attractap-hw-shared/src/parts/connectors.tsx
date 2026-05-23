import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export interface B2B_127_2xN_Props extends BasePartProps {
  readonly pinsPerRow: number;
}

export const B2B_127_2xN = ({ name, pn, pinsPerRow, ...rest }: B2B_127_2xN_Props) => (
  <pinheader
    name={name}
    footprint={`pinrow${pinsPerRow * 2}_rows2_p1.27_id0.6_od1.0`}
    pinCount={pinsPerRow * 2}
    gender="male"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Pico125_3P_Props = BasePartProps;

export const Pico125_3P = ({ name, pn, ...rest }: Pico125_3P_Props) => (
  <pinheader
    name={name}
    footprint="pinrow3_p1.25_id0.6_od1.0"
    pinCount={3}
    gender="male"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Pico125_4P_Props = BasePartProps;

export const Pico125_4P = ({ name, pn, ...rest }: Pico125_4P_Props) => (
  <pinheader
    name={name}
    footprint="pinrow4_p1.25_id0.6_od1.0"
    pinCount={4}
    gender="male"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Ffc05_30P_Props = BasePartProps;

const FFC30_PIN_LABELS = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => [`pin${i + 1}`, [`P${i + 1}`]]),
) as Record<string, string[]>;

export const Ffc05_30P = ({ name, pn, ...rest }: Ffc05_30P_Props) => (
  <chip
    name={name}
    footprint="hflex30_p0.5"
    pinLabels={FFC30_PIN_LABELS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);
