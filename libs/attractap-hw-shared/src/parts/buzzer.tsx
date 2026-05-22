// Buzzer part wrappers magnetic and piezo 5V THT explicit 2-platedhole footprint
// FEATURE: shared lib parts — Beeper board + future audio-bearing boards

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export interface BuzzerThProps extends BasePartProps {
  readonly pitchMm?: number;
  readonly buzzerType?: 'magnetic' | 'piezo';
}

export const Buzzer5VTh = ({
  name,
  pn,
  pitchMm = 5.08,
  buzzerType = 'magnetic',
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
    </footprint>
    <fabricationnotetext
      text={`Buzzer 5V THT ${buzzerType}${buzzerType === 'magnetic' ? ' — flyback diode mandatory' : ' — no flyback needed'}`}
    />
  </chip>
);
