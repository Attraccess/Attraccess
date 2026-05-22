// WS2812 RGB LED wrappers SMD3535 and SMD5050 with custom pad footprint
// FEATURE: shared lib parts — NFC board LED ring and future LED-bearing boards

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type Ws2812MiniProps = BasePartProps;

export const Ws2812Mini = ({ name, pn, ...rest }: Ws2812MiniProps) => (
  <chip
    name={name}
    pinLabels={{ pin1: ['VDD'], pin2: ['DOUT'], pin3: ['GND'], pin4: ['DIN'] }}
    supplierPartNumbers={jlcSupplier(pn)}
    pcbStyle={{ silkscreenTextVisibility: 'hidden' }}
    {...rest}
  >
    <footprint>
      <smtpad shape="rect" portHints={['pin1']} pcbX={-1.475} pcbY={1} width="1.05mm" height="0.9mm" />
      <smtpad shape="rect" portHints={['pin2']} pcbX={1.475} pcbY={1} width="1.05mm" height="0.9mm" />
      <smtpad shape="rect" portHints={['pin3']} pcbX={1.475} pcbY={-1} width="1.05mm" height="0.9mm" />
      <smtpad shape="rect" portHints={['pin4']} pcbX={-1.475} pcbY={-1} width="1.05mm" height="0.9mm" />
      <silkscreenpath route={[
        { x: -1.75, y: -1.75 },
        { x: 1.75, y: -1.75 },
        { x: 1.75, y: 1.75 },
        { x: -1.75, y: 1.75 },
        { x: -1.75, y: -1.75 },
      ]} strokeWidth="0.1mm" />
      <silkscreencircle pcbX={-1.4} pcbY={1.4} radius={0.2} strokeWidth="0.1mm" />
    </footprint>
  </chip>
);
