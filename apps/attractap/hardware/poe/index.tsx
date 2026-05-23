// PoE PD board — 802.3af, integrated magjack, WS3203 PD + MP9486A buck, LAN8720A PHY
// FEATURE: hardware/poe — see docs/research/2026-05-23-att-351-poe-deep-research.md

import {
  J_POE,
  assertWiresAllSignals,
  B2B_127_2xN,
  R0402,
  C0402,
  L0603,
  Ams1117_3v3,
  ElecCap_22uF_100V,
  Lan8720a,
  Hy931147c,
  Crystal25M_5032,
  Ws3203,
  Mp9486a,
  Mb10s,
  Smaj58a,
  Ss34,
} from '@attraccess/attractap-hw-shared';

assertWiresAllSignals(J_POE, {
  '+5V': 'net.V5V',
  GND: 'net.PD_GND',
  RMII_TXD0: 'net.RMII_TXD0',
  RMII_TXD1: 'net.RMII_TXD1',
  RMII_TX_EN: 'net.RMII_TX_EN',
  RMII_RXD0: 'net.RMII_RXD0_OUT',
  RMII_RXD1: 'net.RMII_RXD1_OUT',
  RMII_CRS_DV: 'net.RMII_CRS_DV_OUT',
  RMII_REF_CLK: 'net.RMII_REF_CLK',
  MDIO: 'net.MDIO',
  MDC: 'net.MDC',
  nRST: 'net.PHY_nRST',
});

export default () => (
  <board
    width="60mm"
    height="35mm"
    autorouter="sequential-trace"
    defaultTraceWidth="0.2mm"
  >
    {/* ─── Cable-side: PoE-rated magjack + 2x bridges (Mode A + Mode B) + TVS ── */}
    <Hy931147c name="J1" pn="C91754" pcbX={-22} pcbY={0} pcbRotation={0} />
    <Mb10s name="BR1" pn="C2488" pcbX={-10} pcbY={8} pcbRotation={0} />
    <Mb10s name="BR2" pn="C2488" pcbX={-10} pcbY={-8} pcbRotation={0} />
    <Smaj58a name="D_TVS" pn="C2980408" pcbX={0} pcbY={8} pcbRotation={0} />
    <C0402 name="C_DEN" pn="C307331" capacitance="100nF" pcbX={0} pcbY={5} />

    <net name="V_PoE_BUS" />
    <net name="PD_GND" />

    {/* Mode B (data-pair) center taps -> BR1 */}
    <trace from=".J1 > .CT_TX" to=".BR1 > .AC1" />
    <trace from=".J1 > .CT_RX" to=".BR1 > .AC2" />

    {/* Mode A (spare-pair) -> BR2 */}
    <trace from=".J1 > .CABLE_4_5_A" to=".BR2 > .AC1" />
    <trace from=".J1 > .CABLE_7_8_A" to=".BR2 > .AC2" />

    {/* Both bridges OR into the V_PoE_BUS net */}
    <trace from=".BR1 > .POS" to="net.V_PoE_BUS" />
    <trace from=".BR2 > .POS" to="net.V_PoE_BUS" />
    <trace from=".BR1 > .NEG" to="net.PD_GND" />
    <trace from=".BR2 > .NEG" to="net.PD_GND" />

    {/* TVS clamp + detection cap across V_PoE_BUS-to-PD_GND */}
    <trace from=".D_TVS > .pin1" to="net.V_PoE_BUS" />
    <trace from=".D_TVS > .pin2" to="net.PD_GND" />
    <trace from=".C_DEN > .pin1" to="net.V_PoE_BUS" />
    <trace from=".C_DEN > .pin2" to="net.PD_GND" />

    {/* ─── WS3203 PD interface — detect, classify, hot-swap pass FET ─────── */}
    <Ws3203 name="U_PD" pn="C5143001" pcbX={5} pcbY={0} />
    <R0402 name="R_DEN" pn="C138027" resistance="24.9k" tolerance="1%" pcbX={5} pcbY={-6} />
    <R0402 name="R_CLS" pn="C185397" resistance="768" tolerance="1%" pcbX={9} pcbY={-6} />
    <R0402 name="R_ILIM" pn="C25768" resistance="22k" tolerance="1%" pcbX={5} pcbY={6} />
    <C0402 name="C_SS" pn="C307331" capacitance="100nF" pcbX={9} pcbY={6} />
    <C0402 name="C_VSS_BIAS" pn="C307331" capacitance="100nF" pcbX={13} pcbY={6} />
    <C0402 name="C_BLNK" pn="C76947" capacitance="1nF" pcbX={9} pcbY={3} />

    <net name="V_OUT_PD" />

    <trace from=".U_PD > .VDD" to="net.V_PoE_BUS" />
    <trace from=".U_PD > .RTN" to="net.PD_GND" />
    <trace from=".U_PD > .GND" to="net.PD_GND" />
    <trace from=".U_PD > .DEN" to=".R_DEN > .pin1" />
    <trace from=".R_DEN > .pin2" to="net.PD_GND" />
    <trace from=".U_PD > .CLS" to=".R_CLS > .pin1" />
    <trace from=".R_CLS > .pin2" to="net.PD_GND" />
    <trace from=".U_PD > .ILIM" to=".R_ILIM > .pin1" />
    <trace from=".R_ILIM > .pin2" to="net.PD_GND" />
    <trace from=".U_PD > .SS_R" to=".C_SS > .pin1" />
    <trace from=".C_SS > .pin2" to="net.PD_GND" />
    <trace from=".U_PD > .VSS_BIAS" to=".C_VSS_BIAS > .pin1" />
    <trace from=".C_VSS_BIAS > .pin2" to="net.PD_GND" />
    <trace from=".U_PD > .VOUT_PD" to="net.V_OUT_PD" />
    {/* BLNK — 1nF blanking cap to RTN (TPS2375-family typical) */}
    <trace from=".U_PD > .BLNK" to=".C_BLNK > .pin1" />
    <trace from=".C_BLNK > .pin2" to="net.PD_GND" />
    {/* Unused per WS3203 ref design (802.3af Class 0): T2P, PG, GATE, OCS — left NC */}

    {/* ─── MP9486A 100V -> 5V async buck ─────────────────────────────────── */}
    <Mp9486a name="U_BUCK" pn="C404013" pcbX={18} pcbY={0} />
    <ElecCap_22uF_100V name="C_VIN_BULK" pn="C46550391" pcbX={14} pcbY={-3} />
    <C0402 name="C_VIN_LF" pn="C307331" capacitance="100nF" pcbX={14} pcbY={3} />
    <C0402 name="C_BST" pn="C307331" capacitance="100nF" pcbX={18} pcbY={-6} />
    <Ss34 name="D_CATCH" pn="C8678" pcbX={22} pcbY={-3} />
    <L0603 name="L_BUCK" pn="C168137" inductance="47uH" pcbX={25} pcbY={0} />
    <R0402 name="R_FB_TOP" pn="C25904" resistance="51.1k" tolerance="1%" pcbX={26} pcbY={4} />
    <R0402 name="R_FB_BOT" pn="C25744" resistance="10k" tolerance="1%" pcbX={26} pcbY={7} />
    <R0402 name="R_EN" pn="C25741" resistance="100k" tolerance="1%" pcbX={14} pcbY={6} />
    <C0402 name="C_OUT_HF" pn="C307331" capacitance="100nF" pcbX={29} pcbY={3} />
    <ElecCap_22uF_100V name="C_OUT_BULK" pn="C46550391" pcbX={29} pcbY={-3} />

    <net name="SW_NODE" />
    <net name="V5V" />

    <trace from=".U_BUCK > .VIN" to="net.V_OUT_PD" />
    <trace from=".C_VIN_BULK > .pin1" to="net.V_OUT_PD" />
    <trace from=".C_VIN_BULK > .pin2" to="net.PD_GND" />
    <trace from=".C_VIN_LF > .pin1" to="net.V_OUT_PD" />
    <trace from=".C_VIN_LF > .pin2" to="net.PD_GND" />

    {/* EN tied high via 100k */}
    <trace from=".R_EN > .pin1" to="net.V_OUT_PD" />
    <trace from=".R_EN > .pin2" to=".U_BUCK > .EN" />

    {/* Bootstrap cap */}
    <trace from=".U_BUCK > .BST" to=".C_BST > .pin1" />
    <trace from=".C_BST > .pin2" to="net.SW_NODE" />

    {/* Switch node -> catch diode -> inductor */}
    <trace from=".U_BUCK > .SW" to="net.SW_NODE" />
    <trace from=".D_CATCH > .pin1" to="net.PD_GND" />
    <trace from=".D_CATCH > .pin2" to="net.SW_NODE" />
    <trace from=".L_BUCK > .pin1" to="net.SW_NODE" />
    <trace from=".L_BUCK > .pin2" to="net.V5V" />

    {/* Output caps on V5V */}
    <trace from=".C_OUT_HF > .pin1" to="net.V5V" />
    <trace from=".C_OUT_HF > .pin2" to="net.PD_GND" />
    <trace from=".C_OUT_BULK > .pin1" to="net.V5V" />
    <trace from=".C_OUT_BULK > .pin2" to="net.PD_GND" />

    {/* Feedback divider: V5V -> 51.1k -> FB -> 10k -> GND, FB = 0.81V */}
    <trace from="net.V5V" to=".R_FB_TOP > .pin1" />
    <trace from=".R_FB_TOP > .pin2" to=".U_BUCK > .FB" />
    <trace from=".U_BUCK > .FB" to=".R_FB_BOT > .pin1" />
    <trace from=".R_FB_BOT > .pin2" to="net.PD_GND" />
    <trace from=".U_BUCK > .GND" to="net.PD_GND" />

    {/* ─── AMS1117-3.3 — V5V -> +3V3 for LAN8720A VDDIO/VDDA ──────────────── */}
    <Ams1117_3v3 name="U_LDO33" pn="C6186" pcbX={-5} pcbY={10} />
    <C0402 name="C_LDO_IN" pn="C52923" capacitance="1uF" pcbX={-9} pcbY={10} />
    <C0402 name="C_LDO_OUT" pn="C15525" capacitance="10uF" pcbX={-1} pcbY={10} />

    <net name="V3V3" />

    <trace from=".U_LDO33 > .VIN" to="net.V5V" />
    <trace from=".U_LDO33 > .VOUT" to="net.V3V3" />
    <trace from=".U_LDO33 > .ADJ_GND" to="net.PD_GND" />
    <trace from=".U_LDO33 > .TAB" to="net.PD_GND" />
    <trace from=".C_LDO_IN > .pin1" to="net.V5V" />
    <trace from=".C_LDO_IN > .pin2" to="net.PD_GND" />
    <trace from=".C_LDO_OUT > .pin1" to="net.V3V3" />
    <trace from=".C_LDO_OUT > .pin2" to="net.PD_GND" />

    {/* ─── LAN8720A PHY + 25 MHz crystal + decoupling + strap resistors ──── */}
    <Lan8720a name="U_PHY" pn="C17146" pcbX={-10} pcbY={-10} />
    <Crystal25M_5032 name="Y1" pn="C20617602" pcbX={-20} pcbY={-14} />
    <C0402 name="C_XTAL1" pn="C1549" capacitance="18pF" pcbX={-22} pcbY={-15} />
    <C0402 name="C_XTAL2" pn="C1549" capacitance="18pF" pcbX={-18} pcbY={-15} />

    <C0402 name="C_VDDIO_HF" pn="C307331" capacitance="100nF" pcbX={-7} pcbY={-6} />
    <C0402 name="C_VDDIO_LF" pn="C23733" capacitance="4.7uF" pcbX={-5} pcbY={-6} />
    <L0603 name="L_VDDA_FB" pn="C85833" inductance="600R" pcbX={-13} pcbY={-14} />
    <C0402 name="C_VDDA_HF" pn="C307331" capacitance="100nF" pcbX={-15} pcbY={-7} />
    <C0402 name="C_VDDA_LF" pn="C23733" capacitance="4.7uF" pcbX={-14} pcbY={-5} />
    <C0402 name="C_VDDCR_HF" pn="C1537" capacitance="470pF" pcbX={-10} pcbY={-6} />
    <C0402 name="C_VDDCR_LF" pn="C52923" capacitance="1uF" pcbX={-12} pcbY={-6} />

    <R0402 name="R_RBIAS" pn="C25852" resistance="12.1k" tolerance="1%" pcbX={-12} pcbY={-10} />
    <R0402 name="R_MDIO_PU" pn="C25867" resistance="1.5k" tolerance="1%" pcbX={0} pcbY={-12} />

    {/* RMII series-term resistors on PHY-driven RX outputs */}
    <R0402 name="R_S_RXD0" pn="C25077" resistance="10" tolerance="1%" pcbX={-12} pcbY={-14} />
    <R0402 name="R_S_RXD1" pn="C25077" resistance="10" tolerance="1%" pcbX={-10} pcbY={-14} />
    <R0402 name="R_S_CRSDV" pn="C25077" resistance="10" tolerance="1%" pcbX={-8} pcbY={-14} />

    {/* MDI termination: 49.9R pull-ups on TX/RX to VDDA */}
    <R0402 name="R_TXP_TERM" pn="C25120" resistance="49.9" tolerance="1%" pcbX={-16} pcbY={-8} />
    <R0402 name="R_TXN_TERM" pn="C25120" resistance="49.9" tolerance="1%" pcbX={-16} pcbY={-6} />
    <R0402 name="R_RXP_TERM" pn="C25120" resistance="49.9" tolerance="1%" pcbX={-18} pcbY={-8} />
    <R0402 name="R_RXN_TERM" pn="C25120" resistance="49.9" tolerance="1%" pcbX={-18} pcbY={-6} />
    <C0402 name="C_TERM_BYP" pn="C307331" capacitance="100nF" pcbX={-17} pcbY={-3} />

    <net name="MDI_TXP" />
    <net name="MDI_TXN" />
    <net name="MDI_RXP" />
    <net name="MDI_RXN" />
    <net name="MDI_TERM_VDDA" />

    {/* PHY supply wiring — LAN8720A has 3 VDDIO pins (4, 10, 22), all tied to 3V3 */}
    <trace from=".U_PHY > .VDDIO" to="net.V3V3" />
    <trace from=".U_PHY > .VDDIO_2" to="net.V3V3" />
    <trace from=".U_PHY > .VDDIO_3" to="net.V3V3" />
    <trace from=".C_VDDIO_HF > .pin1" to="net.V3V3" />
    <trace from=".C_VDDIO_HF > .pin2" to="net.PD_GND" />
    <trace from=".C_VDDIO_LF > .pin1" to="net.V3V3" />
    <trace from=".C_VDDIO_LF > .pin2" to="net.PD_GND" />
    <trace from="net.V3V3" to=".L_VDDA_FB > .pin1" />
    <trace from=".L_VDDA_FB > .pin2" to=".U_PHY > .VDD2A" />
    <trace from=".U_PHY > .VDD2A" to=".C_VDDA_HF > .pin1" />
    <trace from=".C_VDDA_HF > .pin2" to="net.PD_GND" />
    <trace from=".U_PHY > .VDD2A" to=".C_VDDA_LF > .pin1" />
    <trace from=".C_VDDA_LF > .pin2" to="net.PD_GND" />
    <trace from=".U_PHY > .VDDCR" to=".C_VDDCR_HF > .pin1" />
    <trace from=".C_VDDCR_HF > .pin2" to="net.PD_GND" />
    <trace from=".U_PHY > .VDDCR" to=".C_VDDCR_LF > .pin1" />
    <trace from=".C_VDDCR_LF > .pin2" to="net.PD_GND" />
    <trace from=".U_PHY > .VSS" to="net.PD_GND" />

    {/* RBIAS */}
    <trace from=".U_PHY > .RBIAS" to=".R_RBIAS > .pin1" />
    <trace from=".R_RBIAS > .pin2" to="net.PD_GND" />

    {/* Strap resistors — REGOFF pull-up (enable internal reg) + nINTSEL pull-down (REFCLK OUT) */}
    <R0402 name="R_STRAP_REGOFF" pn="C25744" resistance="10k" tolerance="1%" pcbX={-8} pcbY={-10} />
    <R0402 name="R_STRAP_INTSEL" pn="C25744" resistance="10k" tolerance="1%" pcbX={-8} pcbY={-12} />
    <trace from=".U_PHY > .LED1" to=".R_STRAP_REGOFF > .pin1" />
    <trace from=".R_STRAP_REGOFF > .pin2" to="net.V3V3" />
    <trace from=".U_PHY > .LED2" to=".R_STRAP_INTSEL > .pin1" />
    <trace from=".R_STRAP_INTSEL > .pin2" to="net.PD_GND" />

    {/* Crystal */}
    <trace from=".U_PHY > .XTAL1" to=".Y1 > .pin1" />
    <trace from=".U_PHY > .XTAL2" to=".Y1 > .pin2" />
    <trace from=".Y1 > .pin1" to=".C_XTAL1 > .pin1" />
    <trace from=".C_XTAL1 > .pin2" to="net.PD_GND" />
    <trace from=".Y1 > .pin2" to=".C_XTAL2 > .pin1" />
    <trace from=".C_XTAL2 > .pin2" to="net.PD_GND" />

    {/* MDI termination — TX/RX 49.9R pulls to MDI_TERM_VDDA bypass-cap node */}
    <trace from=".U_PHY > .TXP" to="net.MDI_TXP" />
    <trace from=".U_PHY > .TXN" to="net.MDI_TXN" />
    <trace from=".R_TXP_TERM > .pin1" to="net.MDI_TXP" />
    <trace from=".R_TXP_TERM > .pin2" to="net.MDI_TERM_VDDA" />
    <trace from=".R_TXN_TERM > .pin1" to="net.MDI_TXN" />
    <trace from=".R_TXN_TERM > .pin2" to="net.MDI_TERM_VDDA" />
    <trace from=".R_RXP_TERM > .pin1" to="net.MDI_RXP" />
    <trace from=".R_RXP_TERM > .pin2" to="net.MDI_TERM_VDDA" />
    <trace from=".R_RXN_TERM > .pin1" to="net.MDI_RXN" />
    <trace from=".R_RXN_TERM > .pin2" to="net.MDI_TERM_VDDA" />
    <trace from=".C_TERM_BYP > .pin1" to="net.MDI_TERM_VDDA" />
    <trace from=".C_TERM_BYP > .pin2" to="net.PD_GND" />
    <trace from="net.MDI_TERM_VDDA" to=".U_PHY > .VDD2A" />

    {/* Magjack MDI side to PHY MDI pairs */}
    <trace from=".J1 > .TX_P" to="net.MDI_TXP" />
    <trace from=".J1 > .TX_N" to="net.MDI_TXN" />
    <trace from=".J1 > .RX_P" to="net.MDI_RXP" />
    <trace from=".J1 > .RX_N" to="net.MDI_RXN" />

    {/* MDIO pull-up */}
    <trace from=".U_PHY > .MDIO" to=".R_MDIO_PU > .pin1" />
    <trace from=".R_MDIO_PU > .pin2" to="net.V3V3" />

    {/* RMII series-term resistors */}
    <net name="RMII_RXD0_OUT" />
    <net name="RMII_RXD1_OUT" />
    <net name="RMII_CRS_DV_OUT" />
    <trace from=".U_PHY > .RXD0" to=".R_S_RXD0 > .pin1" />
    <trace from=".R_S_RXD0 > .pin2" to="net.RMII_RXD0_OUT" />
    <trace from=".U_PHY > .RXD1" to=".R_S_RXD1 > .pin1" />
    <trace from=".R_S_RXD1 > .pin2" to="net.RMII_RXD1_OUT" />
    <trace from=".U_PHY > .CRS_DV" to=".R_S_CRSDV > .pin1" />
    <trace from=".R_S_CRSDV > .pin2" to="net.RMII_CRS_DV_OUT" />

    {/* ─── J_POE — 2x8 1.27mm B2B to Core ──────────────────────────────── */}
    <B2B_127_2xN name="J_POE" pn="C7470092" pinsPerRow={8} pcbX={26} pcbY={10} pcbRotation={0} />

    <net name="RMII_TXD0" />
    <net name="RMII_TXD1" />
    <net name="RMII_TX_EN" />
    <net name="RMII_REF_CLK" />
    <net name="MDIO" />
    <net name="MDC" />
    <net name="PHY_nRST" />

    <trace from=".J_POE > .pin1" to="net.V5V" />
    <trace from=".J_POE > .pin2" to="net.V5V" />
    <trace from=".J_POE > .pin3" to="net.PD_GND" />
    <trace from=".J_POE > .pin4" to="net.PD_GND" />
    <trace from=".J_POE > .pin5" to="net.RMII_TXD0" />
    <trace from=".J_POE > .pin6" to="net.RMII_TXD1" />
    <trace from=".J_POE > .pin7" to="net.RMII_TX_EN" />
    <trace from=".J_POE > .pin8" to="net.RMII_RXD0_OUT" />
    <trace from=".J_POE > .pin9" to="net.RMII_RXD1_OUT" />
    <trace from=".J_POE > .pin10" to="net.RMII_CRS_DV_OUT" />
    <trace from=".J_POE > .pin11" to="net.RMII_REF_CLK" />
    <trace from=".J_POE > .pin12" to="net.MDIO" />
    <trace from=".J_POE > .pin13" to="net.MDC" />
    <trace from=".J_POE > .pin14" to="net.PHY_nRST" />
    <trace from=".J_POE > .pin15" to="net.PD_GND" />
    {/* pin 16 = NC */}

    {/* Wire J_POE nets to PHY */}
    <trace from="net.RMII_TXD0" to=".U_PHY > .TXD0" />
    <trace from="net.RMII_TXD1" to=".U_PHY > .TXD1" />
    <trace from="net.RMII_TX_EN" to=".U_PHY > .TXEN" />
    <trace from="net.RMII_REF_CLK" to=".U_PHY > .REFCLKO" />
    <trace from="net.MDIO" to=".U_PHY > .MDIO" />
    <trace from="net.MDC" to=".U_PHY > .MDC" />
    <trace from="net.PHY_nRST" to=".U_PHY > .nRST" />

    {/* ─── RJ45 shield bond: 1nF/2kV Y2 || 1M to PD_GND ──────────────────── */}
    <capacitor name="C_SHIELD_Y2" capacitance="1nF" footprint="1206" supplierPartNumbers={{ jlcpcb: ['C9196'] }} pcbX={-22} pcbY={6} />
    <R0402 name="R_SHIELD_BLEED" pn="C26083" resistance="1M" tolerance="1%" pcbX={-22} pcbY={4} />

    <net name="CHASSIS" />
    <trace from=".J1 > .SHIELD_1" to="net.CHASSIS" />
    <trace from=".J1 > .SHIELD_2" to="net.CHASSIS" />
    <trace from=".C_SHIELD_Y2 > .pin1" to="net.CHASSIS" />
    <trace from=".C_SHIELD_Y2 > .pin2" to="net.PD_GND" />
    <trace from=".R_SHIELD_BLEED > .pin1" to="net.CHASSIS" />
    <trace from=".R_SHIELD_BLEED > .pin2" to="net.PD_GND" />

    {/* ─── RJ45 integrated LEDs (driven by PHY LED1/LED2 pins) ─────────── */}
    <R0402 name="R_LED_LINK" pn="C25104" resistance="330" tolerance="1%" pcbX={-22} pcbY={10} />
    <R0402 name="R_LED_ACT" pn="C25104" resistance="330" tolerance="1%" pcbX={-22} pcbY={12} />

    <trace from=".J1 > .LED_LINK_A" to="net.V3V3" />
    <trace from=".J1 > .LED_LINK_K" to=".R_LED_LINK > .pin1" />
    <trace from=".R_LED_LINK > .pin2" to=".U_PHY > .LED1" />
    <trace from=".J1 > .LED_ACT_A" to="net.V3V3" />
    <trace from=".J1 > .LED_ACT_K" to=".R_LED_ACT > .pin1" />
    <trace from=".R_LED_ACT > .pin2" to=".U_PHY > .LED2" />
  </board>
);
