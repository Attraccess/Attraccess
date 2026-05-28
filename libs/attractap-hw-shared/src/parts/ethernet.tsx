// Typed tscircuit wrappers for the Ethernet IC family used by Attractap V2 PoE
// FEATURE: hw-shared/ethernet — LAN8720A PHY, HanRun PoE magjack, 25 MHz crystal

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const LAN8720A_PINS = {
  pin1: ['VDDCR'],
  pin2: ['VDD2A'],
  pin3: ['RBIAS'],
  pin4: ['VDDIO'],
  pin5: ['LED2', 'nINTSEL'],
  pin6: ['LED1', 'REGOFF'],
  pin7: ['XTAL2'],
  pin8: ['XTAL1', 'CLKIN'],
  pin9: ['VSS'],
  pin10: ['VDDIO_2'],
  pin11: ['nRST'],
  pin12: ['MDIO'],
  pin13: ['MDC'],
  pin14: ['RXER'],
  pin15: ['RXD1', 'PHYAD2'],
  pin16: ['RXD0', 'PHYAD1'],
  pin17: ['CRS_DV', 'PHYAD0', 'MODE2'],
  pin18: ['REFCLKO'],
  pin19: ['TXEN'],
  pin20: ['TXD0'],
  pin21: ['TXD1'],
  pin22: ['VDDIO_3'],
  pin23: ['TXP'],
  pin24: ['TXN'],
} as const;

export type Lan8720aProps = BasePartProps;

export const Lan8720a = ({ name, pn, ...rest }: Lan8720aProps) => (
  <chip
    name={name}
    footprint="qfn24_w4_h4_p0.5mm"
    pinLabels={LAN8720A_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="LAN8720A 10/100 Ethernet PHY (RMII), QFN-24-EP 4x4mm 0.5mm pitch." />
  </chip>
);

const HY931147C_PINS = {
  pin1: ['TX_P', 'J1'],
  pin2: ['TX_N', 'J2'],
  pin3: ['RX_P', 'J3'],
  pin4: ['CABLE_4', 'J4'],
  pin5: ['CABLE_5', 'J5'],
  pin6: ['RX_N', 'J6'],
  pin7: ['CABLE_7', 'J7'],
  pin8: ['CABLE_8', 'J8'],
  pin9: ['NC9'],
  pin10: ['NC10'],
  pin11: ['LED_LINK_A'],
  pin12: ['LED_LINK_K'],
  pin13: ['LED_ACT_A'],
  pin14: ['LED_ACT_K'],
  pin15: ['SHIELD_1'],
  pin16: ['SHIELD_2'],
} as const;

export type Hy931147cProps = BasePartProps;

export const Hy931147c = ({ name, pn, ...rest }: Hy931147cProps) => (
  <chip
    name={name}
    pinLabels={HY931147C_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    footprint={
      <footprint>
        <platedhole shape="circle" portHints={['pin1']} pcbX={6.490} pcbY={-5.715} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin2']} pcbX={3.950} pcbY={-4.445} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin3']} pcbX={6.490} pcbY={-3.175} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin4']} pcbX={3.950} pcbY={-1.905} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin5']} pcbX={6.490} pcbY={-0.635} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin6']} pcbX={3.950} pcbY={0.635} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin7']} pcbX={6.490} pcbY={1.905} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin8']} pcbX={3.950} pcbY={3.175} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin9']} pcbX={6.490} pcbY={4.445} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin10']} pcbX={3.950} pcbY={5.715} holeDiameter="0.9mm" outerDiameter="1.5mm" />
        <platedhole shape="circle" portHints={['pin11']} pcbX={-6.490} pcbY={-6.629} holeDiameter="1.1mm" outerDiameter="1.6mm" />
        <platedhole shape="circle" portHints={['pin12']} pcbX={-6.490} pcbY={-4.089} holeDiameter="1.1mm" outerDiameter="1.6mm" />
        <platedhole shape="circle" portHints={['pin13']} pcbX={-6.490} pcbY={4.089} holeDiameter="1.1mm" outerDiameter="1.6mm" />
        <platedhole shape="circle" portHints={['pin14']} pcbX={-6.490} pcbY={6.629} holeDiameter="1.1mm" outerDiameter="1.6mm" />
        <platedhole shape="circle" portHints={['pin15']} pcbX={0.648} pcbY={-7.747} holeDiameter="1.6mm" outerDiameter="2.0mm" />
        <platedhole shape="circle" portHints={['pin16']} pcbX={0.648} pcbY={7.747} holeDiameter="1.6mm" outerDiameter="2.0mm" />
        <hole shape="circle" pcbX={-2.400} pcbY={-5.700} diameter="1.625mm" />
        <hole shape="circle" pcbX={-2.400} pcbY={5.700} diameter="1.625mm" />
      </footprint>
    }
    {...rest}
  >
    <fabricationnotetext text="HY931147C PoE RJ45 magjack. Pins 4,5,7,8 = spare-pair cable contacts (Mode A). Pin15/16 = chassis shield mounting pegs." />
  </chip>
);

export type Crystal25M_5032_Props = BasePartProps;

const CRYSTAL_5032_PINS = {
  pin1: ['XOUT'],
  pin2: ['GND_1'],
  pin3: ['XIN'],
  pin4: ['GND_2'],
} as const;

export const Crystal25M_5032 = ({ name, pn, ...rest }: Crystal25M_5032_Props) => (
  <chip
    name={name}
    pinLabels={CRYSTAL_5032_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    footprint={
      <footprint>
        <smtpad portHints={['pin1']} shape="rect" pcbX={-2.0} pcbY={1.20} width="1.6mm" height="1.2mm" layer="top" />
        <smtpad portHints={['pin2']} shape="rect" pcbX={2.0} pcbY={1.20} width="1.6mm" height="1.2mm" layer="top" />
        <smtpad portHints={['pin3']} shape="rect" pcbX={2.0} pcbY={-1.20} width="1.6mm" height="1.2mm" layer="top" />
        <smtpad portHints={['pin4']} shape="rect" pcbX={-2.0} pcbY={-1.20} width="1.6mm" height="1.2mm" layer="top" />
      </footprint>
    }
    {...rest}
  >
    <fabricationnotetext text="25 MHz SMD5032-4P crystal, 20 pF load. Pins 1+3 = crystal, pins 2+4 = GND." />
  </chip>
);
