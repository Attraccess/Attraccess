// PN532 NFC front-end IC plus 13.56 MHz coil and PCB-trace antenna wrappers
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

export interface NfcPcbAntennaProps extends Omit<BasePartProps, 'pn'> {
  readonly outerMm?: number;
  readonly turns?: number;
  readonly traceWidthMm?: number;
  readonly gapMm?: number;
  readonly segmentsPerTurn?: number;
}

interface SpiralSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function buildCircularSpiralSegments(turns: number, outerR: number, pitch: number, segmentsPerTurn: number): SpiralSegment[] {
  const segments: SpiralSegment[] = [];
  const total = turns * segmentsPerTurn;
  let prev = { x: outerR, y: 0 };
  for (let i = 1; i <= total; i++) {
    const t = i / segmentsPerTurn;
    const theta = t * 2 * Math.PI;
    const r = outerR - t * pitch;
    const cur = { x: r * Math.cos(theta), y: r * Math.sin(theta) };
    segments.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y });
    prev = cur;
  }
  return segments;
}

interface SpiralPadProps {
  readonly cx: number;
  readonly cy: number;
  readonly lengthMm: number;
  readonly widthMm: number;
  readonly rotationDeg: number;
  readonly portHint: 'pin1' | 'pin2';
}

const SpiralPad = ({ cx, cy, lengthMm, widthMm, rotationDeg, portHint }: SpiralPadProps) => (
  <smtpad
    shape="rotated_rect"
    portHints={[portHint]}
    pcbX={cx}
    pcbY={cy}
    width={`${lengthMm}mm`}
    height={`${widthMm}mm`}
    ccwRotation={rotationDeg}
  />
);

export const NfcPcbAntenna = ({
  name,
  outerMm = 22,
  turns = 9,
  traceWidthMm = 0.4,
  gapMm = 0.3,
  segmentsPerTurn = 32,
  ...rest
}: NfcPcbAntennaProps) => {
  const pitch = traceWidthMm + gapMm;
  const outerR = outerMm / 2;
  const segments = buildCircularSpiralSegments(turns, outerR, pitch, segmentsPerTurn);
  const innerEnd = segments[segments.length - 1];
  const outerStart = segments[0];
  const anchorSize = traceWidthMm * 2;
  return (
    <chip name={name} pinLabels={{ pin1: ['P1'], pin2: ['P2'] }} {...rest}>
      <footprint>
        {segments.map((s, i) => {
          const cx = (s.x1 + s.x2) / 2;
          const cy = (s.y1 + s.y2) / 2;
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          const chord = Math.sqrt(dx * dx + dy * dy);
          const padLength = chord + traceWidthMm;
          const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <SpiralPad
              key={`spiral-${i}`}
              cx={cx}
              cy={cy}
              lengthMm={padLength}
              widthMm={traceWidthMm}
              rotationDeg={rotation}
              portHint="pin1"
            />
          );
        })}
        <SpiralPad
          cx={outerStart.x1}
          cy={outerStart.y1}
          lengthMm={anchorSize}
          widthMm={anchorSize}
          rotationDeg={0}
          portHint="pin1"
        />
        <SpiralPad
          cx={innerEnd.x2}
          cy={innerEnd.y2}
          lengthMm={anchorSize}
          widthMm={anchorSize}
          rotationDeg={0}
          portHint="pin2"
        />
      </footprint>
    </chip>
  );
};
