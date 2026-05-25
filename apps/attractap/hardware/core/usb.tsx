// Dual USB-C 16P 2MD receptacles USBLC6 ESD 22R series J_USB to P4 J_USB_C6 to C6
// FEATURE: hardware/core — ATT-349 Phase 2 Core board USB programming + power-in

import {
  boardCoord,
  R0402,
  UsbCRecept16P_2MD,
  Usblc6_2Sc6,
} from '@attraccess/attractap-hw-shared';

const R_22R_PN = 'C25092';
const USBC_PN = 'C2765186';
const USBLC6_PN = 'C2687116';

export interface UsbBlockProps {
  readonly boardW: number;
  readonly boardH: number;
}

export const UsbBlock = ({ boardW, boardH }: UsbBlockProps) => {
  const at = (x: number, y: number) => boardCoord({ x, y, boardW, boardH });
  return (
    <>
      <UsbCRecept16P_2MD name="J_USB" pn={USBC_PN} {...at(55, 9)} />
      <Usblc6_2Sc6 name="U_USB_ESD" pn={USBLC6_PN} {...at(48, 9)} />
      <R0402 name="R_USB_DM" pn={R_22R_PN} resistance="22" {...at(43, 9)} />
      <R0402 name="R_USB_DP" pn={R_22R_PN} resistance="22" {...at(43, 10.5)} />

      <UsbCRecept16P_2MD name="J_USB_C6" pn={USBC_PN} pcbRotation={270} {...at(5, 30)} />
      <Usblc6_2Sc6 name="U_USB_C6_ESD" pn={USBLC6_PN} {...at(12, 30)} />
      <R0402 name="R_USB_C6_DM" pn={R_22R_PN} resistance="22" {...at(17, 30)} />
      <R0402 name="R_USB_C6_DP" pn={R_22R_PN} resistance="22" {...at(17, 31.5)} />

      <trace from=".J_USB > .Dn1" to=".J_USB > .Dn2" />
      <trace from=".J_USB > .Dp1" to=".J_USB > .Dp2" />

      <trace from=".J_USB > .Dn1" to=".U_USB_ESD > .IO1_A" />
      <trace from=".U_USB_ESD > .IO1_B" to=".U_USB_ESD > .IO1_A" />
      <trace from=".J_USB > .Dp1" to=".U_USB_ESD > .IO2_A" />
      <trace from=".U_USB_ESD > .IO2_B" to=".U_USB_ESD > .IO2_A" />
      <trace from=".U_USB_ESD > .VBUS" to=".J_USB > .VBUS" />
      <trace from=".U_USB_ESD > .GND" to=".J_USB > .GND_A1B12" />

      <trace from=".U_USB_ESD > .IO1_A" to=".R_USB_DM > .pin1" />
      <trace from=".U_USB_ESD > .IO2_A" to=".R_USB_DP > .pin1" />

      <trace from=".J_USB_C6 > .Dn1" to=".J_USB_C6 > .Dn2" />
      <trace from=".J_USB_C6 > .Dp1" to=".J_USB_C6 > .Dp2" />

      <trace from=".J_USB_C6 > .Dn1" to=".U_USB_C6_ESD > .IO1_A" />
      <trace from=".U_USB_C6_ESD > .IO1_B" to=".U_USB_C6_ESD > .IO1_A" />
      <trace from=".J_USB_C6 > .Dp1" to=".U_USB_C6_ESD > .IO2_A" />
      <trace from=".U_USB_C6_ESD > .IO2_B" to=".U_USB_C6_ESD > .IO2_A" />
      <trace from=".U_USB_C6_ESD > .VBUS" to=".J_USB_C6 > .VBUS" />
      <trace from=".U_USB_C6_ESD > .GND" to=".J_USB_C6 > .GND_A1B12" />

      <trace from=".U_USB_C6_ESD > .IO1_A" to=".R_USB_C6_DM > .pin1" />
      <trace from=".U_USB_C6_ESD > .IO2_A" to=".R_USB_C6_DP > .pin1" />
    </>
  );
};
