// Board edge connectors J_POE J_PWR_DC J_NFC J_BEEP J_DISP per design doc 2.3
// FEATURE: hardware/core — ATT-349 Phase 2 Core board daughter card interfaces

import {
  B2B_127_2xN,
  boardCoord,
  Ffc05Ra_N,
  Pico125_3P,
  Pico125_4P,
} from '@attraccess/attractap-hw-shared';

const J_POE_PN = 'C2935956';
const J_PWR_DC_PN = 'C504989';
const J_NFC_PN = 'C7501289';
const J_BEEP_PN = 'C122442';
const J_DISP_PN = 'C2856803';

export interface ConnectorsProps {
  readonly boardW: number;
  readonly boardH: number;
}

export const Connectors = ({ boardW, boardH }: ConnectorsProps) => {
  const at = (x: number, y: number) => boardCoord({ x, y, boardW, boardH });
  return (
    <>
      <B2B_127_2xN name="J_POE" pn={J_POE_PN} pinsPerRow={8} {...at(12, 4)} />
      <Pico125_4P name="J_PWR_DC" pn={J_PWR_DC_PN} {...at(28, 4)} />
      <B2B_127_2xN name="J_NFC" pn={J_NFC_PN} pinsPerRow={5} {...at(12, 42)} />
      <Pico125_3P name="J_BEEP" pn={J_BEEP_PN} {...at(45, 4)} />
      <Ffc05Ra_N name="J_DISP" pn={J_DISP_PN} pinCount={20} {...at(34, 41)} />
    </>
  );
};
