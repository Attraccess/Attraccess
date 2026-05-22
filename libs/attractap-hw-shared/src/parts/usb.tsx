// USB-C receptacle wrapper 16 pin 2MD right-angle SMD USB-2.0 5 V 3 A
// FEATURE: shared lib parts — Core ATT-349 USB-C programming + bench power

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const USBC16_PAD_PITCH = 0.5;
const USBC16_PAD_W = 0.3;
const USBC16_PAD_H = 1.6;
const USBC16_PAD_ROW_DY = 1.5;
const USBC16_HOLE_DX = 4.32;
const USBC16_HOLE_DY = -1.5;
const USBC16_PAD_PIN_ORDER = ['GND_A1', 'CC1', 'Dp1', 'Dn1', 'SBU1', 'VBUS_A4', 'GND_B12', 'CC2', 'Dp2', 'Dn2', 'SBU2', 'VBUS_B9'] as const;

export type UsbCRecept16Props = BasePartProps;

export const UsbCRecept16P_2MD = ({ name, pn, ...rest }: UsbCRecept16Props) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['GND_A1B12'],
      pin2: ['VBUS'],
      pin3: ['CC1'],
      pin4: ['Dp1'],
      pin5: ['Dn1'],
      pin6: ['SBU1'],
      pin7: ['CC2'],
      pin8: ['Dp2'],
      pin9: ['Dn2'],
      pin10: ['SBU2'],
      pin11: ['EH1'],
      pin12: ['EH2'],
    }}
    {...rest}
  >
    <footprint>
      {USBC16_PAD_PIN_ORDER.map((_label, idx) => {
        const isBottom = idx >= 6;
        const col = isBottom ? idx - 6 : idx;
        const x = (col - 2.5) * USBC16_PAD_PITCH;
        const y = isBottom ? -USBC16_PAD_ROW_DY : USBC16_PAD_ROW_DY;
        const pinHint = idx < 6 ? (idx === 0 ? 'pin1' : idx === 5 ? 'pin2' : `pin${idx + 1}`) : (idx === 6 ? 'pin1' : idx === 11 ? 'pin2' : `pin${idx + 1}`);
        return (
          <smtpad
            shape="rect"
            portHints={[pinHint]}
            pcbX={x}
            pcbY={y}
            width={`${USBC16_PAD_W}mm`}
            height={`${USBC16_PAD_H}mm`}
          />
        );
      })}
      <platedhole shape="circle" portHints={['pin11']} pcbX={-USBC16_HOLE_DX} pcbY={USBC16_HOLE_DY} holeDiameter="0.6mm" outerDiameter="1.0mm" />
      <platedhole shape="circle" portHints={['pin12']} pcbX={USBC16_HOLE_DX}  pcbY={USBC16_HOLE_DY} holeDiameter="0.6mm" outerDiameter="1.0mm" />
      <silkscreenpath
        route={[
          { x: -4.5, y: 2.2 },
          { x: 4.5, y: 2.2 },
          { x: 4.5, y: -2.5 },
          { x: -4.5, y: -2.5 },
          { x: -4.5, y: 2.2 },
        ]}
        strokeWidth="0.12mm"
      />
    </footprint>
  </chip>
);
