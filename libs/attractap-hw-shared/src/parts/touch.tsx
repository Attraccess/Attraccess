import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Gt911Props = BasePartProps;

export const Gt911 = ({ name, pn, ...rest }: Gt911Props) => (
  <chip
    name={name}
    footprint="qfn28_p0.4_w4.0_h4.0"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['VDDIO'],
      pin2: ['VDD'],
      pin3: ['GND'],
      pin4: ['SDA'],
      pin5: ['SCL'],
      pin6: ['INT'],
      pin7: ['RESET'],
    }}
    {...rest}
  >
    <fabricationnotetext text="GT911 capacitive touch controller" />
  </chip>
);
