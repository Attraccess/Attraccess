import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Esp32MiniProps = BasePartProps;

export const Esp32P4Mini1 = ({ name, pn, ...rest }: Esp32MiniProps) => (
  <chip
    name={name}
    footprint="esp32-p4-mini-1"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="ESP32-P4-MINI-1 module" />
  </chip>
);

export const Esp32C6Mini1 = ({ name, pn, ...rest }: Esp32MiniProps) => (
  <chip
    name={name}
    footprint="esp32-c6-mini-1"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="ESP32-C6-MINI-1 module" />
  </chip>
);
