// ARM Cortex SWD 10 pin SMD header 1.27mm 2x5 wired to ESP32-P4 JTAG alt-functions
// FEATURE: hardware/core — ATT-349 Phase 2 Core board hardware debug interface

import {
  B2B_127_2xN,
  boardCoord,
} from '@attraccess/attractap-hw-shared';

const SWD_HEADER_PN = 'C7501289';

export interface JtagBlockProps {
  readonly boardW: number;
  readonly boardH: number;
}

export const JtagBlock = ({ boardW, boardH }: JtagBlockProps) => {
  const at = (x: number, y: number) => boardCoord({ x, y, boardW, boardH });
  return (
    <>
      <B2B_127_2xN name="J_SWD" pn={SWD_HEADER_PN} pinsPerRow={5} {...at(50, 40)} />
    </>
  );
};
