// Buzzer part wrappers magnetic and piezo 5V THT footprint with body outline
// FEATURE: shared lib parts — Beeper board + future audio-bearing boards

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export interface BuzzerThProps extends BasePartProps {
  readonly pitchMm?: number;
  readonly bodyDiameterMm?: number;
}

export const Buzzer5VTh = ({
  name,
  pn,
  pitchMm = 5.08,
  bodyDiameterMm = 12,
  ...rest
}: BuzzerThProps) => (
  <chip
    name={name}
    pinLabels={{ pin1: ['BUZZ_HI'], pin2: ['BUZZ_LO'] }}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <footprint>
      <platedhole shape="circle" portHints={['pin1']} pcbX={-pitchMm / 2} pcbY={0} holeDiameter="0.9mm" outerDiameter="1.5mm" />
      <platedhole shape="circle" portHints={['pin2']} pcbX={pitchMm / 2} pcbY={0} holeDiameter="0.9mm" outerDiameter="1.5mm" />
      <silkscreencircle pcbX={0} pcbY={0} radius={bodyDiameterMm / 2} strokeWidth="0.15mm" />
      <courtyardcircle pcbX={0} pcbY={0} radius={bodyDiameterMm / 2} />
    </footprint>
  </chip>
);
