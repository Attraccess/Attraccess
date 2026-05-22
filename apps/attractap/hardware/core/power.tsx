// Power tree LM66200 dual ideal-diode SS34 USB-C OR-ing TPS62933 buck to 3V3
// FEATURE: hardware/core — ATT-349 Phase 2 Core board power input mux

import {
  boardCoord,
  C0402,
  C0603,
  L0603,
  Lm66200,
  R0402,
  Ss34,
  Tps62933,
} from '@attraccess/attractap-hw-shared';

const C_100NF_PN = 'C307331';
const C_10UF_PN = 'C96446';
const C_22UF_PN = 'C45783';
const C_10NF_PN = 'C57112';
const R_5K1_PN = 'C23186';
const R_10K_PN = 'C25744';
const R_100K_PN = 'C25741';
const R_36K_PN = 'C43676';
const L_2P2UH_PN = 'C284875';
const LM66200_PN = 'C3235556';
const TPS62933_PN = 'C5219254';
const SS34_PN = 'C432300';

export interface PowerProps {
  readonly boardW: number;
  readonly boardH: number;
}

export const Power = ({ boardW, boardH }: PowerProps) => {
  const at = (x: number, y: number) => boardCoord({ x, y, boardW, boardH });
  return (
    <>
      <Lm66200 name="U_OR" pn={LM66200_PN} {...at(7, 28)} />
      <C0603 name="C_PoE_IN" pn={C_10UF_PN} capacitance="10uF" {...at(3.5, 28)} />
      <C0603 name="C_DC_IN" pn={C_10UF_PN} capacitance="10uF" {...at(3.5, 26.5)} />
      <C0603 name="C_5V_BULK1" pn={C_10UF_PN} capacitance="10uF" {...at(10.5, 28)} />
      <C0603 name="C_5V_BULK2" pn={C_10UF_PN} capacitance="10uF" {...at(10.5, 26.5)} />
      <R0402 name="R_OR_EN" pn={R_10K_PN} resistance="10k" {...at(5, 30)} />

      <Ss34 name="D_VBUS" pn={SS34_PN} {...at(13, 30)} />
      <C0402 name="C_VBUS_Y" pn={C_10NF_PN} capacitance="10nF" {...at(15, 30)} />
      <C0603 name="C_VBUS_BULK" pn={C_22UF_PN} capacitance="22uF" {...at(15.5, 28)} />

      <Tps62933 name="U_BUCK" pn={TPS62933_PN} {...at(7, 23)} />
      <C0603 name="C_BUCK_IN" pn={C_10UF_PN} capacitance="10uF" {...at(3.5, 23)} />
      <C0402 name="C_BUCK_BST" pn={C_100NF_PN} capacitance="100nF" {...at(5, 21)} />
      <R0402 name="R_BUCK_FB_H" pn={R_36K_PN} resistance="36k" {...at(9, 21)} />
      <R0402 name="R_BUCK_FB_L" pn={R_10K_PN} resistance="10k" {...at(11, 21)} />
      <R0402 name="R_BUCK_EN" pn={R_100K_PN} resistance="100k" {...at(9, 25.5)} />
      <L0603 name="L_BUCK" pn={L_2P2UH_PN} inductance="2.2uH" {...at(10.5, 23)} />
      <C0603 name="C_3V3_BULK1" pn={C_10UF_PN} capacitance="10uF" {...at(13, 23)} />
      <C0603 name="C_3V3_BULK2" pn={C_22UF_PN} capacitance="22uF" {...at(13, 21.5)} />

      <R0402 name="R_USB_CC1" pn={R_5K1_PN} resistance="5.1k" {...at(46, 13)} />
      <R0402 name="R_USB_CC2" pn={R_5K1_PN} resistance="5.1k" {...at(46, 11.5)} />

      <trace from=".U_OR > .VIN1" to=".C_PoE_IN > .pin1" />
      <trace from=".U_OR > .VIN2" to=".C_DC_IN > .pin1" />
      <trace from=".C_PoE_IN > .pin2" to=".U_OR > .GND_A" />
      <trace from=".C_DC_IN > .pin2" to=".U_OR > .GND_B" />
      <trace from=".U_OR > .VOUT_A" to=".U_OR > .VOUT_B" />
      <trace from=".U_OR > .VOUT_A" to=".C_5V_BULK1 > .pin1" />
      <trace from=".U_OR > .VOUT_A" to=".C_5V_BULK2 > .pin1" />
      <trace from=".C_5V_BULK1 > .pin2" to=".U_OR > .GND_A" />
      <trace from=".C_5V_BULK2 > .pin2" to=".U_OR > .GND_B" />
      <trace from=".R_OR_EN > .pin1" to=".U_OR > .ON_N" />
      <trace from=".R_OR_EN > .pin2" to=".U_OR > .GND_A" />

      <trace from=".D_VBUS > .anode" to=".C_VBUS_Y > .pin1" />
      <trace from=".D_VBUS > .cathode" to=".U_OR > .VOUT_A" />
      <trace from=".C_VBUS_Y > .pin2" to=".U_OR > .GND_A" />
      <trace from=".D_VBUS > .cathode" to=".C_VBUS_BULK > .pin1" />
      <trace from=".C_VBUS_BULK > .pin2" to=".U_OR > .GND_A" />

      <trace from=".U_BUCK > .VIN" to=".U_OR > .VOUT_A" />
      <trace from=".U_BUCK > .VIN" to=".C_BUCK_IN > .pin1" />
      <trace from=".C_BUCK_IN > .pin2" to=".U_BUCK > .GND" />
      <trace from=".U_BUCK > .SW" to=".C_BUCK_BST > .pin1" />
      <trace from=".U_BUCK > .BST" to=".C_BUCK_BST > .pin2" />
      <trace from=".U_BUCK > .SW" to=".L_BUCK > .pin1" />
      <trace from=".L_BUCK > .pin2" to=".C_3V3_BULK1 > .pin1" />
      <trace from=".L_BUCK > .pin2" to=".C_3V3_BULK2 > .pin1" />
      <trace from=".C_3V3_BULK1 > .pin2" to=".U_BUCK > .GND" />
      <trace from=".C_3V3_BULK2 > .pin2" to=".U_BUCK > .GND" />
      <trace from=".U_BUCK > .FB" to=".R_BUCK_FB_H > .pin1" />
      <trace from=".U_BUCK > .FB" to=".R_BUCK_FB_L > .pin1" />
      <trace from=".R_BUCK_FB_H > .pin2" to=".L_BUCK > .pin2" />
      <trace from=".R_BUCK_FB_L > .pin2" to=".U_BUCK > .GND" />
      <trace from=".U_BUCK > .EN" to=".R_BUCK_EN > .pin1" />
      <trace from=".R_BUCK_EN > .pin2" to=".U_BUCK > .VIN" />
    </>
  );
};
