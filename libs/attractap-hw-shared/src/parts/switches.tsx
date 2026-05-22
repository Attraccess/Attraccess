// SMD tactile switch wrappers TS-1088 4x3mm round-button SPST 100k cycles
// FEATURE: shared lib parts — Core ATT-349 BOOT and RESET front-panel buttons

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const TS1088_PAD_DX = 1.85;
const TS1088_PAD_DY = 1.05;
const TS1088_PAD_W = 1.4;
const TS1088_PAD_H = 0.95;

export type TactileTs1088Props = BasePartProps;

export const TactileTs1088 = ({ name, pn, ...rest }: TactileTs1088Props) => (
  <chip
    name={name}
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{ pin1: ['A'], pin2: ['B'] }}
    {...rest}
  >
    <footprint>
      <smtpad shape="rect" portHints={['pin1']} pcbX={-TS1088_PAD_DX} pcbY={TS1088_PAD_DY}  width={`${TS1088_PAD_W}mm`} height={`${TS1088_PAD_H}mm`} />
      <smtpad shape="rect" portHints={['pin1']} pcbX={-TS1088_PAD_DX} pcbY={-TS1088_PAD_DY} width={`${TS1088_PAD_W}mm`} height={`${TS1088_PAD_H}mm`} />
      <smtpad shape="rect" portHints={['pin2']} pcbX={TS1088_PAD_DX}  pcbY={TS1088_PAD_DY}  width={`${TS1088_PAD_W}mm`} height={`${TS1088_PAD_H}mm`} />
      <smtpad shape="rect" portHints={['pin2']} pcbX={TS1088_PAD_DX}  pcbY={-TS1088_PAD_DY} width={`${TS1088_PAD_W}mm`} height={`${TS1088_PAD_H}mm`} />
      <silkscreencircle pcbX={0} pcbY={0} radius={1.0} strokeWidth="0.12mm" />
    </footprint>
  </chip>
);
