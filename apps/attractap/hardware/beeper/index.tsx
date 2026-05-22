// Beeper board PWM driven magnetic buzzer gated by N MOSFET
// FEATURE: hardware/beeper — Phase 1.5 pipeline-proof Attractap V2 board

import {
  Ao3400,
  boardCoord,
  Buzzer5VTh,
  Diode1N4148Ws,
  Pico125_3P,
  R0603,
} from '@attraccess/attractap-hw-shared';

const W = 18;
const H = 24;
const at = (x: number, y: number) => boardCoord({ x, y, boardW: W, boardH: H });

export default () => (
  <board
    width={`${W}mm`}
    height={`${H}mm`}
    autorouter="sequential-trace"
    defaultTraceWidth="0.15mm"
  >
    <Buzzer5VTh name="LS1" pn="C2687681" pitchMm={6.5} bodyDiameterMm={12} buzzerType="magnetic" {...at(9, 8)} />
    <Ao3400 name="Q1" pn="C20917" {...at(3, 17)} />
    <R0603 name="R1" resistance="100" pn="C22775" {...at(7, 17)} />
    <R0603 name="R2" resistance="10k" pn="C25804" {...at(11, 17)} />
    <Diode1N4148Ws name="D1" pn="C81598" {...at(15, 17)} />
    <Pico125_3P name="J1" pn="C122442" {...at(9, 21)} />
    <hole diameter="3.2mm" {...at(3, 21)} />
    <hole diameter="3.2mm" {...at(15, 21)} />
    <trace from=".LS1 > .BUZZ_LO" to=".D1 > .anode" />
    <trace from=".D1 > .anode" to=".Q1 > .drain" />
    <trace from=".J1 > .pin1" to=".LS1 > .BUZZ_HI" />
    <trace from=".J1 > .pin1" to=".D1 > .cathode" />
    <trace from=".J1 > .pin3" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".Q1 > .gate" />
    <trace from=".R2 > .pin1" to=".Q1 > .gate" />
    <trace from=".R2 > .pin2" to=".J1 > .pin2" />
    <trace from=".Q1 > .source" to=".J1 > .pin2" />
  </board>
);
