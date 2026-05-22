// SMD crystal wrappers 40 MHz 3225 4-pin package used as ESP32 main oscillator
// FEATURE: shared lib parts — Core ATT-349 ESP32-P4 40 MHz XTAL_P / XTAL_N

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const SMD3225_PAD_DX = 1.1;
const SMD3225_PAD_DY = 0.95;
const SMD3225_PAD_W = 1.2;
const SMD3225_PAD_H = 0.95;

export type Crystal40MhzProps = BasePartProps;

export const Crystal40Mhz = ({ name, pn, ...rest }: Crystal40MhzProps) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['XIN'],
      pin2: ['GND1'],
      pin3: ['XOUT'],
      pin4: ['GND2'],
    }}
    {...rest}
  >
    <footprint>
      <smtpad shape="rect" portHints={['pin1']} pcbX={-SMD3225_PAD_DX} pcbY={SMD3225_PAD_DY}  width={`${SMD3225_PAD_W}mm`} height={`${SMD3225_PAD_H}mm`} />
      <smtpad shape="rect" portHints={['pin2']} pcbX={SMD3225_PAD_DX}  pcbY={SMD3225_PAD_DY}  width={`${SMD3225_PAD_W}mm`} height={`${SMD3225_PAD_H}mm`} />
      <smtpad shape="rect" portHints={['pin3']} pcbX={SMD3225_PAD_DX}  pcbY={-SMD3225_PAD_DY} width={`${SMD3225_PAD_W}mm`} height={`${SMD3225_PAD_H}mm`} />
      <smtpad shape="rect" portHints={['pin4']} pcbX={-SMD3225_PAD_DX} pcbY={-SMD3225_PAD_DY} width={`${SMD3225_PAD_W}mm`} height={`${SMD3225_PAD_H}mm`} />
      <silkscreenpath
        route={[
          { x: -1.6, y: -1.25 },
          { x: 1.6, y: -1.25 },
          { x: 1.6, y: 1.25 },
          { x: -1.6, y: 1.25 },
          { x: -1.6, y: -1.25 },
        ]}
        strokeWidth="0.1mm"
      />
      <silkscreencircle pcbX={-1.9} pcbY={1.3} radius={0.15} strokeWidth="0.1mm" />
    </footprint>
  </chip>
);
