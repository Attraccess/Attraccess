// NFC board PN532 IC plus 24 WS2812 ring with discrete coil antenna and J_NFC
// FEATURE: hardware/nfc — Phase 2 Attractap V2 board ATT-350

import {
  B2B_127_2xN,
  boardCoord,
  C0402,
  C0603,
  L0603,
  NfcCoilAntenna,
  Pn532Ic,
  R0402,
  R0603,
  Ws2812Mini,
} from '@attraccess/attractap-hw-shared';

const W = 50;
const H = 50;
const at = (x: number, y: number) => boardCoord({ x, y, boardW: W, boardH: H });
const atBottom = (x: number, y: number) => ({
  ...boardCoord({ x, y, boardW: W, boardH: H }),
  layer: 'bottom' as const,
});

const RING_LEDS = 24;
const RING_R = 18;
const RING_CX = 25;
const RING_CY = 25;
const LED_BULK_GROUPS = 6;
const LED_BULK_R = 22.5;

const FB_FERRITE_PN = 'C14709';
const C_100NF_PN = 'C307331';
const C_10UF_PN = 'C96446';
const C_1NF_PN = 'C76947';
const C_47PF_PN = 'C1567';
const C_180PF_PN = 'C20069329';
const R_4K7_PN = 'C25900';
const R_10K_PN = 'C25744';
const R_33R_PN = 'C25105';
const R_4R7_PN = 'C23164';
const R_750R_PN = 'C25132';
const L_560NH_PN = 'C502009';
const WS2812_PN = 'C4154873';
const PN532_PN = 'C28925';
const HEADER_PN = 'C2935458';

const leds = Array.from({ length: RING_LEDS }, (_, i) => {
  const angle = (i * 360) / RING_LEDS;
  const rad = (angle * Math.PI) / 180;
  return {
    i,
    name: `LED${i + 1}`,
    cx: RING_CX + RING_R * Math.cos(rad),
    cy: RING_CY + RING_R * Math.sin(rad),
    rot: angle + 90,
  };
});

const ledBulkCaps = Array.from({ length: LED_BULK_GROUPS }, (_, g) => {
  const angle = (g * 360) / LED_BULK_GROUPS + 30;
  const rad = (angle * Math.PI) / 180;
  return {
    name: `C_LED_G${g + 1}`,
    nearestLed: `LED${Math.round((g * RING_LEDS) / LED_BULK_GROUPS) + 1}`,
    cx: RING_CX + LED_BULK_R * Math.cos(rad),
    cy: RING_CY + LED_BULK_R * Math.sin(rad),
    rot: angle + 90,
  };
});

const traceJsx = (from: string, to: string, key: string) => (
  <trace key={key} from={from} to={to} />
);

export default () => (
  <board
    width={`${W}mm`}
    height={`${H}mm`}
    autorouter="sequential-trace"
    defaultTraceWidth="0.2mm"
  >
    <NfcCoilAntenna name="ANT1" padPitchMm={18} bodyWidthMm={22} bodyHeightMm={22} {...at(25, 25)} />

    {leds.map((l) => (
      <Ws2812Mini
        key={l.name}
        name={l.name}
        pn={WS2812_PN}
        pcbX={l.cx - W / 2}
        pcbY={l.cy - H / 2}
        pcbRotation={l.rot}
      />
    ))}

    {ledBulkCaps.map((c) => (
      <C0603
        key={c.name}
        name={c.name}
        pn={C_10UF_PN}
        capacitance="10uF"
        pcbX={c.cx - W / 2}
        pcbY={c.cy - H / 2}
        pcbRotation={c.rot}
      />
    ))}

    <Pn532Ic name="U1" pn={PN532_PN} {...atBottom(25, 25)} />

    <C0603 name="C_PA" pn={C_10UF_PN} capacitance="10uF" {...atBottom(29.24, 20.76)} />
    <C0402 name="C_VBUS" pn={C_100NF_PN} capacitance="100nF" {...atBottom(25, 31)} />
    <C0402 name="C_PVDD" pn={C_100NF_PN} capacitance="100nF" {...atBottom(31, 25)} />
    <C0402 name="C_SVDD" pn={C_100NF_PN} capacitance="100nF" {...atBottom(25, 19)} />
    <C0402 name="C_AVDD" pn={C_100NF_PN} capacitance="100nF" {...atBottom(19, 25)} />
    <C0402 name="C_VMID" pn={C_100NF_PN} capacitance="100nF" {...atBottom(20.76, 29.24)} />
    <L0603 name="L_TVDD" pn={FB_FERRITE_PN} inductance="120R@100MHz" {...atBottom(20.76, 20.76)} />
    <C0402 name="C_TVDD" pn={C_100NF_PN} capacitance="100nF" {...atBottom(29.24, 29.24)} />

    <R0402 name="R_SDA" pn={R_4K7_PN} resistance="4.7k" {...atBottom(22.41, 34.66)} />
    <R0402 name="R_SCL" pn={R_4K7_PN} resistance="4.7k" {...atBottom(25, 35)} />
    <R0402 name="R_IRQ" pn={R_10K_PN} resistance="10k" {...atBottom(27.59, 34.66)} />
    <R0402 name="R_NSS" pn={R_10K_PN} resistance="10k" {...atBottom(30, 33.5)} />

    <R0603 name="Rq1" pn={R_4R7_PN} resistance="4.7" {...atBottom(32.07, 17.93)} />
    <L0603 name="L0_TX1" pn={L_560NH_PN} inductance="560nH" {...atBottom(33.66, 20)} />
    <C0402 name="C0_TX1" pn={C_180PF_PN} capacitance="180pF" {...atBottom(34.66, 22.41)} />
    <C0402 name="C1_TX1" pn={C_47PF_PN} capacitance="47pF" {...atBottom(35, 25)} />
    <C0402 name="C2_TX1" pn={C_47PF_PN} capacitance="47pF" {...atBottom(34.66, 27.59)} />
    <R0402 name="Rs1" pn={R_750R_PN} resistance="750" {...atBottom(33.66, 30)} />
    <C0402 name="Cs1" pn={C_1NF_PN} capacitance="1nF" {...atBottom(32.07, 32.07)} />

    <R0603 name="Rq2" pn={R_4R7_PN} resistance="4.7" {...atBottom(17.93, 32.07)} />
    <L0603 name="L0_TX2" pn={L_560NH_PN} inductance="560nH" {...atBottom(16.34, 30)} />
    <C0402 name="C0_TX2" pn={C_180PF_PN} capacitance="180pF" {...atBottom(15.34, 27.59)} />
    <C0402 name="C1_TX2" pn={C_47PF_PN} capacitance="47pF" {...atBottom(15, 25)} />
    <C0402 name="C2_TX2" pn={C_47PF_PN} capacitance="47pF" {...atBottom(15.34, 22.41)} />
    <R0402 name="Rs2" pn={R_750R_PN} resistance="750" {...atBottom(16.34, 20)} />
    <C0402 name="Cs2" pn={C_1NF_PN} capacitance="1nF" {...atBottom(17.93, 17.93)} />

    <R0402 name="R_LED" pn={R_33R_PN} resistance="33" {...at(10, 45)} />
    <L0603 name="L_LED" pn={FB_FERRITE_PN} inductance="120R@100MHz" {...at(14, 45)} />
    <C0603 name="C_LED_BULK" pn={C_10UF_PN} capacitance="10uF" {...at(18, 45)} />

    <B2B_127_2xN name="J1" pn={HEADER_PN} pinsPerRow={5} {...at(35, 47)} />

    <hole diameter="3.2mm" {...at(3, 3)} />
    <hole diameter="3.2mm" {...at(47, 3)} />
    <hole diameter="3.2mm" {...at(3, 47)} />
    <hole diameter="3.2mm" {...at(47, 47)} />

    <silkscreentext text="ATT-350 NFC v0" {...at(25, 4)} fontSize="1.2mm" />

    <trace from=".J1 > .pin1" to=".C_VBUS > .pin1" />
    <trace from=".C_VBUS > .pin1" to=".U1 > .VBUS" />
    <trace from=".U1 > .VBUS" to=".U1 > .PVDD" />
    <trace from=".U1 > .PVDD" to=".U1 > .SVDD" />
    <trace from=".U1 > .SVDD" to=".U1 > .VBAT" />
    <trace from=".U1 > .AVDD" to=".C_AVDD > .pin1" />
    <trace from=".C_AVDD > .pin1" to=".U1 > .SVDD" />
    <trace from=".U1 > .VDD_PA" to=".C_PA > .pin1" />
    <trace from=".C_PA > .pin1" to=".U1 > .SVDD" />
    <trace from=".U1 > .I0" to=".U1 > .SVDD" />
    <trace from=".U1 > .NFCC_VLOAD" to=".U1 > .SVDD" />
    <trace from=".C_PVDD > .pin1" to=".U1 > .PVDD" />
    <trace from=".C_SVDD > .pin1" to=".U1 > .SVDD" />

    <trace from=".U1 > .SVDD" to=".L_TVDD > .pin1" />
    <trace from=".L_TVDD > .pin2" to=".U1 > .TVDD" />
    <trace from=".C_TVDD > .pin1" to=".U1 > .TVDD" />

    <trace from=".R_SDA > .pin1" to=".U1 > .SVDD" />
    <trace from=".R_SCL > .pin1" to=".U1 > .SVDD" />
    <trace from=".R_IRQ > .pin1" to=".U1 > .SVDD" />
    <trace from=".R_SDA > .pin2" to=".U1 > .SDA" />
    <trace from=".R_SCL > .pin2" to=".U1 > .SCL" />
    <trace from=".R_IRQ > .pin2" to=".U1 > .IRQ" />

    <trace from=".J1 > .pin3" to=".U1 > .SDA" />
    <trace from=".J1 > .pin4" to=".U1 > .SCL" />
    <trace from=".J1 > .pin5" to=".U1 > .IRQ" />
    <trace from=".J1 > .pin6" to=".U1 > .NRST" />

    <trace from=".J1 > .pin2" to=".U1 > .GND1" />
    <trace from=".U1 > .GND1" to=".U1 > .GND2" />
    <trace from=".U1 > .GND2" to=".U1 > .AVSS" />
    <trace from=".U1 > .AVSS" to=".U1 > .AGND1" />
    <trace from=".U1 > .AGND1" to=".U1 > .AGND2" />
    <trace from=".U1 > .AGND2" to=".U1 > .EP" />
    <trace from=".J1 > .pin9" to=".U1 > .EP" />

    <trace from=".U1 > .I1" to=".U1 > .EP" />
    <trace from=".U1 > .SIGIN" to=".U1 > .EP" />
    <trace from=".R_NSS > .pin1" to=".U1 > .SVDD" />
    <trace from=".R_NSS > .pin2" to=".U1 > .NSS" />
    <trace from=".U1 > .VMID" to=".C_VMID > .pin1" />
    <trace from=".C_VMID > .pin2" to=".U1 > .EP" />

    <trace from=".U1 > .TX1" to=".Rq1 > .pin1" />
    <trace from=".Rq1 > .pin2" to=".L0_TX1 > .pin1" />
    <trace from=".L0_TX1 > .pin2" to=".C0_TX1 > .pin1" />
    <trace from=".C0_TX1 > .pin2" to=".U1 > .EP" />
    <trace from=".L0_TX1 > .pin2" to=".C1_TX1 > .pin1" />
    <trace from=".C1_TX1 > .pin2" to=".C2_TX1 > .pin1" />
    <trace from=".C2_TX1 > .pin2" to=".U1 > .EP" />
    <trace from=".C1_TX1 > .pin2" to=".ANT1 > .P1" />
    <trace from=".ANT1 > .P1" to=".Rs1 > .pin1" />
    <trace from=".Rs1 > .pin2" to=".Cs1 > .pin1" />
    <trace from=".Cs1 > .pin2" to=".U1 > .EP" />

    <trace from=".U1 > .TX2" to=".Rq2 > .pin1" />
    <trace from=".Rq2 > .pin2" to=".L0_TX2 > .pin1" />
    <trace from=".L0_TX2 > .pin2" to=".C0_TX2 > .pin1" />
    <trace from=".C0_TX2 > .pin2" to=".U1 > .EP" />
    <trace from=".L0_TX2 > .pin2" to=".C1_TX2 > .pin1" />
    <trace from=".C1_TX2 > .pin2" to=".C2_TX2 > .pin1" />
    <trace from=".C2_TX2 > .pin2" to=".U1 > .EP" />
    <trace from=".C1_TX2 > .pin2" to=".ANT1 > .P2" />
    <trace from=".ANT1 > .P2" to=".Rs2 > .pin1" />
    <trace from=".Rs2 > .pin2" to=".Cs2 > .pin1" />
    <trace from=".Cs2 > .pin2" to=".U1 > .EP" />

    <trace from=".J1 > .pin8" to=".L_LED > .pin1" />
    <trace from=".L_LED > .pin2" to=".C_LED_BULK > .pin1" />
    <trace from=".C_LED_BULK > .pin2" to=".U1 > .EP" />
    <trace from=".J1 > .pin7" to=".R_LED > .pin1" />
    <trace from=".R_LED > .pin2" to=".LED1 > .DIN" />
    <trace from=".L_LED > .pin2" to=".LED1 > .VDD" />

    {leds.slice(0, -1).map((_l, i) =>
      traceJsx(`.LED${i + 1} > .DOUT`, `.LED${i + 2} > .DIN`, `din-${i}`),
    )}
    {leds.slice(0, -1).map((_l, i) =>
      traceJsx(`.LED${i + 1} > .VDD`, `.LED${i + 2} > .VDD`, `vdd-${i}`),
    )}
    {leds.slice(0, -1).map((_l, i) =>
      traceJsx(`.LED${i + 1} > .GND`, `.LED${i + 2} > .GND`, `gnd-${i}`),
    )}
    <trace from=".LED1 > .GND" to=".U1 > .EP" />

    {ledBulkCaps.map((c, i) =>
      traceJsx(`.${c.name} > .pin1`, `.${c.nearestLed} > .VDD`, `bulkvdd-${i}`),
    )}
    {ledBulkCaps.map((c, i) =>
      traceJsx(`.${c.name} > .pin2`, `.${c.nearestLed} > .GND`, `bulkgnd-${i}`),
    )}
  </board>
);
