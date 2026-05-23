// PN532 NFC front-end IC plus discrete 13.56 MHz coil antenna wrappers
// FEATURE: shared lib parts — NFC board on-board RFID front-end + antenna

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
  />
);

export interface NfcCoilAntennaProps extends Omit<BasePartProps, 'pn'> {
  readonly pn?: string;
  readonly mpn?: string;
  readonly padPitchMm?: number;
  readonly bodyWidthMm?: number;
  readonly bodyHeightMm?: number;
  readonly padWidthMm?: number;
  readonly padHeightMm?: number;
}

export const NfcCoilAntenna = ({
  name,
  pn,
  mpn,
  padPitchMm = 25,
  bodyWidthMm = 32,
  bodyHeightMm = 22,
  padWidthMm = 1.8,
  padHeightMm = 2.5,
  ...rest
}: NfcCoilAntennaProps) => (
  <chip
    name={name}
    pinLabels={{ pin1: ['P1'], pin2: ['P2'] }}
    {...(pn ? { supplierPartNumbers: jlcSupplier(pn) } : {})}
    {...(mpn ? { manufacturerPartNumber: mpn } : {})}
    {...rest}
  >
    <footprint>
      <smtpad
        shape="rect"
        portHints={['pin1']}
        pcbX={-padPitchMm / 2}
        pcbY={0}
        width={`${padWidthMm}mm`}
        height={`${padHeightMm}mm`}
      />
      <smtpad
        shape="rect"
        portHints={['pin2']}
        pcbX={padPitchMm / 2}
        pcbY={0}
        width={`${padWidthMm}mm`}
        height={`${padHeightMm}mm`}
      />
      <silkscreenpath
        route={[
          { x: -bodyWidthMm / 2, y: -bodyHeightMm / 2 },
          { x: bodyWidthMm / 2, y: -bodyHeightMm / 2 },
          { x: bodyWidthMm / 2, y: bodyHeightMm / 2 },
          { x: -bodyWidthMm / 2, y: bodyHeightMm / 2 },
          { x: -bodyWidthMm / 2, y: -bodyHeightMm / 2 },
        ]}
        strokeWidth="0.15mm"
      />
      <silkscreencircle pcbX={-padPitchMm / 2 - 1} pcbY={padHeightMm / 2 + 0.5} radius={0.3} strokeWidth="0.1mm" />
    </footprint>
  </chip>
);
