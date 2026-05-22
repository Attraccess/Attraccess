// Beeper board PWM driven magnetic buzzer gated by N MOSFET
// FEATURE: hardware/beeper — Phase 1.5 pipeline-proof Attractap V2 board

import { JstPh125_3P, R0603 } from '@attraccess/attractap-hw-shared';

export default () => (
  <board width="15mm" height="15mm" routingDisabled>
    <JstPh125_3P name="J1" pn="C145997" pcbX={2.5} pcbY={-6} />
    <chip
      name="Q1"
      footprint="sot23"
      pinLabels={{ pin1: ['gate'], pin2: ['source'], pin3: ['drain'] }}
      pcbX={0}
      pcbY={-3}
      supplierPartNumbers={{ jlcpcb: ['C20917'] }}
    >
      <fabricationnotetext text="Q1: AO3400A N-MOSFET logic-level (Vgs(th)≈1.3V), SOT-23 G/S/D" />
    </chip>
    <R0603 name="R1" resistance="100" pn="C22775" pcbX={-2} pcbY={0} />
    <R0603 name="R2" resistance="10k" pn="C25804" pcbX={2} pcbY={0} />
    <diode
      name="D1"
      footprint="sod123"
      pcbX={4.5}
      pcbY={-3}
      supplierPartNumbers={{ jlcpcb: ['C81598'] }}
    />
    <chip
      name="LS1"
      footprint="pinrow2_p5.08_id1.0_od1.8"
      pinLabels={{ pin1: ['BUZZ_HI'], pin2: ['BUZZ_LO'] }}
      pcbX={-3}
      pcbY={4}
      supplierPartNumbers={{ jlcpcb: ['C97884'] }}
    >
      <fabricationnotetext text="LS1: magnetic buzzer 5V — D1 flyback mandatory; swap PN for piezo to drop D1" />
    </chip>
    <hole diameter="3.2mm" pcbX={-4.5} pcbY={-4.5} />
    <hole diameter="3.2mm" pcbX={4.5} pcbY={4.5} />
    <trace from=".J1 > .pin1" to=".LS1 > .pin1" />
    <trace from=".LS1 > .pin2" to=".Q1 > .drain" />
    <trace from=".LS1 > .pin2" to=".D1 > .anode" />
    <trace from=".J1 > .pin1" to=".D1 > .cathode" />
    <trace from=".J1 > .pin3" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".Q1 > .gate" />
    <trace from=".R2 > .pin1" to=".Q1 > .gate" />
    <trace from=".R2 > .pin2" to=".J1 > .pin2" />
    <trace from=".Q1 > .source" to=".J1 > .pin2" />
  </board>
);
