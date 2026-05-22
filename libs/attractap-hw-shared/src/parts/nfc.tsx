import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Pn532ModuleProps = BasePartProps;

export const Pn532Module = ({ name, pn, ...rest }: Pn532ModuleProps) => (
  <chip
    name={name}
    footprint="pn532-nfc-v3-module"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['VCC'],
      pin2: ['GND'],
      pin3: ['SDA'],
      pin4: ['SCL'],
      pin5: ['IRQ'],
      pin6: ['RSTPDN'],
    }}
    {...rest}
  >
    <fabricationnotetext text="PN532 NFC module — antenna keep-out per mech-envelope.md" />
  </chip>
);
