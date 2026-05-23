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
  pin10: ['VDDIO_NC1'],
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
  pin22: ['VDDIO_NC2'],
  pin23: ['TXP'],
  pin24: ['TXN'],
} as const;

export type Lan8720aProps = BasePartProps;

export const Lan8720a = ({ name, pn, ...rest }: Lan8720aProps) => (
  <chip
    name={name}
    footprint="qfn24"
    pinLabels={LAN8720A_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="LAN8720A 10/100 Ethernet PHY (RMII)" />
  </chip>
);

const HY931147C_PINS = {
  pin1: ['TX_P'],
  pin2: ['TX_N'],
  pin3: ['RX_P'],
  pin4: ['CT_TX'],
  pin5: ['CT_RX'],
  pin6: ['RX_N'],
  pin7: ['CABLE_3'],
  pin8: ['CABLE_6'],
  pin9: ['CABLE_1'],
  pin10: ['CABLE_2'],
  pin11: ['CABLE_4_5_A'],
  pin12: ['CABLE_4_5_B'],
  pin13: ['CABLE_7_8_A'],
  pin14: ['CABLE_7_8_B'],
  pin15: ['LED_LINK_A'],
  pin16: ['LED_LINK_K'],
  pin17: ['LED_ACT_A'],
  pin18: ['LED_ACT_K'],
  pin19: ['SHIELD_1'],
  pin20: ['SHIELD_2'],
} as const;

export type Hy931147cProps = BasePartProps;

export const Hy931147c = ({ name, pn, ...rest }: Hy931147cProps) => (
  <chip
    name={name}
    footprint="dip20"
    pinLabels={HY931147C_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="HY931147C — PoE-rated RJ45 magjack 10/100, 1500Vrms iso (placeholder fp; JLC fetches real magjack)" />
  </chip>
);

export type Crystal25M_5032_Props = BasePartProps;

const CRYSTAL_5032_PINS = {
  pin1: ['pin1'],
  pin2: ['pin2'],
} as const;

export const Crystal25M_5032 = ({ name, pn, ...rest }: Crystal25M_5032_Props) => (
  <chip
    name={name}
    footprint="dip2"
    pinLabels={CRYSTAL_5032_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="25 MHz SMD5032 crystal, 20 pF load" />
  </chip>
);
