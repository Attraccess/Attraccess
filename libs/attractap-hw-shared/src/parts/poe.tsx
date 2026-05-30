// Typed tscircuit wrappers for the 802.3af PoE PD-side IC family
// FEATURE: hw-shared/poe — WS3203 PD interface, MP9486A buck, MB10S bridge, SMAJ58A TVS, SS34 catch

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const WS3203_PINS = {
  pin1: ['VDD'],
  pin2: ['RTN'],
  pin3: ['DEN'],
  pin4: ['CLS'],
  pin5: ['T2P'],
  pin6: ['PG'],
  pin7: ['GND'],
  pin8: ['GATE'],
  pin9: ['VSS_BIAS'],
  pin10: ['SS_R'],
  pin11: ['ILIM'],
  pin12: ['OCS'],
  pin13: ['BLNK'],
  pin14: ['VOUT_PD'],
} as const;

export type Ws3203Props = BasePartProps;

export const Ws3203 = ({ name, pn, ...rest }: Ws3203Props) => (
  <chip
    name={name}
    pinLabels={WS3203_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    footprint={
      <footprint>
        <smtpad portHints={['pin1']} shape="rect" pcbX={-1.95} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin2']} shape="rect" pcbX={-1.30} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin3']} shape="rect" pcbX={-0.65} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin4']} shape="rect" pcbX={0.00} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin5']} shape="rect" pcbX={0.65} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin6']} shape="rect" pcbX={1.30} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin7']} shape="rect" pcbX={1.95} pcbY={-2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin8']} shape="rect" pcbX={1.95} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin9']} shape="rect" pcbX={1.30} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin10']} shape="rect" pcbX={0.65} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin11']} shape="rect" pcbX={0.00} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin12']} shape="rect" pcbX={-0.65} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin13']} shape="rect" pcbX={-1.30} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
        <smtpad portHints={['pin14']} shape="rect" pcbX={-1.95} pcbY={2.50} width="0.40mm" height="1.40mm" layer="top" />
      </footprint>
    }
    {...rest}
  >
    <fabricationnotetext text="WS3203 — 802.3af PD interface (NJGW), TSSOP-14 0.65mm pitch. Unused pins (T2P/PG/GATE/OCS) NC per ref design." />
  </chip>
);

const MP9486A_PINS = {
  pin1: ['BST'],
  pin2: ['VIN'],
  pin3: ['SW'],
  pin4: ['GND'],
  pin5: ['FB'],
  pin6: ['EN'],
  pin7: ['NC'],
  pin8: ['VCC'],
} as const;

export type Mp9486aProps = BasePartProps;

export const Mp9486a = ({ name, pn, ...rest }: Mp9486aProps) => (
  <chip
    name={name}
    pinLabels={MP9486A_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    footprint={
      <footprint>
        <smtpad portHints={['pin1']} shape="rect" pcbX={-1.905} pcbY={-2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin2']} shape="rect" pcbX={-0.635} pcbY={-2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin3']} shape="rect" pcbX={0.635} pcbY={-2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin4']} shape="rect" pcbX={1.905} pcbY={-2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin5']} shape="rect" pcbX={1.905} pcbY={2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin6']} shape="rect" pcbX={0.635} pcbY={2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin7']} shape="rect" pcbX={-0.635} pcbY={2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin8']} shape="rect" pcbX={-1.905} pcbY={2.225} width="0.60mm" height="1.55mm" layer="top" />
        <smtpad portHints={['pin4', 'GND']} shape="rect" pcbX={0} pcbY={0} width="2.50mm" height="2.50mm" layer="top" />
      </footprint>
    }
    {...rest}
  >
    <fabricationnotetext text="MP9486A 100V/1A async buck — SOIC-8-EP, exposed pad tied to pin4 (GND)." />
  </chip>
);

const MB10S_PINS = {
  pin1: ['AC1'],
  pin2: ['NEG'],
  pin3: ['AC2'],
  pin4: ['POS'],
} as const;

export type Mb10sProps = BasePartProps;

export const Mb10s = ({ name, pn, ...rest }: Mb10sProps) => (
  <chip
    name={name}
    pinLabels={MB10S_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    footprint={
      <footprint>
        <smtpad portHints={['pin1']} shape="rect" pcbX={-3.10} pcbY={-1.20} width="2.0mm" height="1.1mm" layer="top" />
        <smtpad portHints={['pin2']} shape="rect" pcbX={-3.10} pcbY={1.20} width="2.0mm" height="1.1mm" layer="top" />
        <smtpad portHints={['pin3']} shape="rect" pcbX={3.10} pcbY={1.20} width="2.0mm" height="1.1mm" layer="top" />
        <smtpad portHints={['pin4']} shape="rect" pcbX={3.10} pcbY={-1.20} width="2.0mm" height="1.1mm" layer="top" />
      </footprint>
    }
    {...rest}
  >
    <fabricationnotetext text="MB10S — 1kV/1A bridge rectifier, MBS SMD package." />
  </chip>
);

export type Smaj58aProps = BasePartProps;

export const Smaj58a = ({ name, pn, ...rest }: Smaj58aProps) => (
  <diode
    name={name}
    footprint="sma_do214ac"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="SMAJ58A TVS 58V" />
  </diode>
);

export type Ss34Props = BasePartProps;

export const Ss34 = ({ name, pn, ...rest }: Ss34Props) => (
  <diode
    name={name}
    footprint="sma_do214ac"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="SS34 Schottky 40V/3A" />
  </diode>
);
