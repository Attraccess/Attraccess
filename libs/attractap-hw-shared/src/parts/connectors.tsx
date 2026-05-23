import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export interface B2B_127_2xN_Props extends BasePartProps {
  readonly pinsPerRow: number;
}

export const B2B_127_2xN = ({ name, pn, pinsPerRow, ...rest }: B2B_127_2xN_Props) => (
  <pinheader
    name={name}
    footprint={`pinrow${pinsPerRow * 2}_rows2_p1.27_id0.6_od1.0`}
    pinCount={pinsPerRow * 2}
    gender="male"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Pico125_3P_Props = BasePartProps;

export const Pico125_3P = ({ name, pn, ...rest }: Pico125_3P_Props) => (
  <pinheader
    name={name}
    footprint="pinrow3_p1.25_id0.6_od1.0"
    pinCount={3}
    gender="male"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export type Pico125_4P_Props = BasePartProps;

export const Pico125_4P = ({ name, pn, ...rest }: Pico125_4P_Props) => (
  <pinheader
    name={name}
    footprint="pinrow4_p1.25_id0.6_od1.0"
    pinCount={4}
    gender="male"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export interface B2B_05_2xN_Props extends BasePartProps {
  readonly pinsPerRow: number;
}

export const B2B_05_2xN = ({ name, pn, pinsPerRow, ...rest }: B2B_05_2xN_Props) => {
  const total = pinsPerRow * 2;
  const pad_pitch = 0.5;
  const row_dy = 0.85;
  return (
    <chip
      name={name}
      supplierPartNumbers={jlcSupplier(pn)}
      pinLabels={Object.fromEntries(
        Array.from({ length: total }, (_, i) => [`pin${i + 1}`, [`P${i + 1}`]]),
      ) as Record<string, string[]>}
      {...rest}
    >
      <footprint>
        {Array.from({ length: total }).map((_, idx) => {
          const isBottom = idx >= pinsPerRow;
          const col = isBottom ? total - 1 - idx : idx;
          const x = (col - (pinsPerRow - 1) / 2) * pad_pitch;
          const y = isBottom ? -row_dy : row_dy;
          return (
            <smtpad
              shape="rect"
              portHints={[`pin${idx + 1}`]}
              pcbX={x}
              pcbY={y}
              width={`${pad_pitch * 0.5}mm`}
              height="0.6mm"
            />
          );
        })}
      </footprint>
    </chip>
  );
};

const FFC05_PAD_PITCH = 0.5;
const FFC05_PAD_W = 0.3;
const FFC05_PAD_H = 1.0;
const FFC05_MECH_PAD_W = 1.8;
const FFC05_MECH_PAD_H = 1.8;
const FFC05_BODY_W_MARGIN = 1.4;
const FFC05_BODY_DEPTH = 5.0;
const FFC05_PAD_ROW_Y = -1.5;
const FFC05_MECH_ROW_Y = 1.0;

export interface Ffc05Ra_N_Props extends BasePartProps {
  readonly pinCount: number;
}

export const Ffc05Ra_N = ({ name, pn, pinCount, ...rest }: Ffc05Ra_N_Props) => {
  const span = (pinCount - 1) * FFC05_PAD_PITCH;
  const half_body_w = span / 2 + FFC05_BODY_W_MARGIN;
  const mech_x = half_body_w - FFC05_MECH_PAD_W / 2;
  return (
    <chip
      name={name}
      supplierPartNumbers={jlcSupplier(pn)}
      pinLabels={Object.fromEntries(
        Array.from({ length: pinCount }, (_, i) => [`pin${i + 1}`, [`P${i + 1}`]]),
      ) as Record<string, string[]>}
      {...rest}
    >
      <footprint>
        {Array.from({ length: pinCount }).map((_, idx) => (
          <smtpad
            shape="rect"
            portHints={[`pin${idx + 1}`]}
            pcbX={(idx - (pinCount - 1) / 2) * FFC05_PAD_PITCH}
            pcbY={FFC05_PAD_ROW_Y}
            width={`${FFC05_PAD_W}mm`}
            height={`${FFC05_PAD_H}mm`}
          />
        ))}
        <smtpad
          shape="rect"
          portHints={['mech1']}
          pcbX={-mech_x}
          pcbY={FFC05_MECH_ROW_Y}
          width={`${FFC05_MECH_PAD_W}mm`}
          height={`${FFC05_MECH_PAD_H}mm`}
        />
        <smtpad
          shape="rect"
          portHints={['mech2']}
          pcbX={mech_x}
          pcbY={FFC05_MECH_ROW_Y}
          width={`${FFC05_MECH_PAD_W}mm`}
          height={`${FFC05_MECH_PAD_H}mm`}
        />
        <silkscreenpath
          route={[
            { x: -half_body_w, y: FFC05_PAD_ROW_Y - 0.7 },
            { x:  half_body_w, y: FFC05_PAD_ROW_Y - 0.7 },
            { x:  half_body_w, y: FFC05_PAD_ROW_Y - 0.7 + FFC05_BODY_DEPTH },
            { x: -half_body_w, y: FFC05_PAD_ROW_Y - 0.7 + FFC05_BODY_DEPTH },
            { x: -half_body_w, y: FFC05_PAD_ROW_Y - 0.7 },
          ]}
          strokeWidth="0.12mm"
        />
        <silkscreencircle pcbX={-half_body_w - 0.4} pcbY={FFC05_PAD_ROW_Y} radius={0.2} strokeWidth="0.12mm" />
      </footprint>
    </chip>
  );
};

export type Ffc05_30P_Props = BasePartProps;

const FFC30_PIN_LABELS = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => [`pin${i + 1}`, [`P${i + 1}`]]),
) as Record<string, string[]>;

export const Ffc05_30P = ({ name, pn, ...rest }: Ffc05_30P_Props) => (
  <chip
    name={name}
    footprint="hflex30_p0.5"
    pinLabels={FFC30_PIN_LABELS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);
