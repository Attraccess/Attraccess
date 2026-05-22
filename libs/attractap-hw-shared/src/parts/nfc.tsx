// PN532 NFC front-end IC wrapper QFN-40-EP for JLC SMT assembly
// FEATURE: shared lib parts — NFC board on-board RFID front-end

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Pn532IcProps = BasePartProps;

const PN532_PIN_LABELS: Record<string, string[]> = {
  pin1: ['SCL'],
  pin2: ['SDA'],
  pin3: ['NSS'],
  pin4: ['VBAT'],
  pin5: ['GND1'],
  pin8: ['I0'],
  pin9: ['I1'],
  pin12: ['NRST'],
  pin13: ['GND2'],
  pin14: ['SVDD'],
  pin15: ['IRQ'],
  pin17: ['SIGIN'],
  pin20: ['VMID'],
  pin21: ['AVSS'],
  pin22: ['AVDD'],
  pin31: ['NFCC_VLOAD'],
  pin32: ['AGND1'],
  pin33: ['AGND2'],
  pin34: ['TX2'],
  pin35: ['TVDD'],
  pin36: ['TX1'],
  pin37: ['PVDD'],
  pin38: ['VBUS'],
  pin39: ['VDD_PA'],
  pin41: ['EP'],
};

export const Pn532Ic = ({ name, pn, ...rest }: Pn532IcProps) => (
  <chip
    name={name}
    footprint="qfn40_p0.5_w6_h6"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={PN532_PIN_LABELS}
    {...rest}
  >
    <fabricationnotetext text="PN5321A3HN — antenna keep-out per mech-envelope.md NFC §4" />
  </chip>
);
