// ESP32-P4 application MCU bare QFN-104 W25Q128 flash 40 MHz crystal BOOT RESET
// FEATURE: hardware/core — ATT-349 Phase 2 Core board application processor

import {
  boardCoord,
  C0402,
  C0603,
  Crystal40Mhz,
  Esp32P4Nrw32,
  L0603,
  R0402,
  TactileTs1088,
  W25q128Jv,
} from '@attraccess/attractap-hw-shared';

const C_100NF_PN = 'C307331';
const C_10UF_PN = 'C96446';
const C_1UF_PN = 'C15849';
const C_10PF_PN = 'C32949';
const R_10K_PN = 'C25744';
const R_4K7_PN = 'C25900';
const R_33R_PN = 'C25105';
const FB_PN = 'C14709';
const P4_PN = 'C22387510';
const W25Q128_PN = 'C97521';
const XTAL40_PN = 'C5261245';
const TS1088_PN = 'C720477';

export interface McuP4Props {
  readonly boardW: number;
  readonly boardH: number;
}

export const McuP4 = ({ boardW, boardH }: McuP4Props) => {
  const at = (x: number, y: number) => boardCoord({ x, y, boardW, boardH });
  const atBottom = (x: number, y: number) => ({
    ...boardCoord({ x, y, boardW, boardH }),
    layer: 'bottom' as const,
  });
  return (
    <>
      <Esp32P4Nrw32 name="U_P4" pn={P4_PN} {...at(25, 18)} />

      <C0402 name="C_VDDPST1" pn={C_100NF_PN} capacitance="100nF" {...atBottom(20.5, 18)} />
      <C0402 name="C_VDDPST2" pn={C_100NF_PN} capacitance="100nF" {...atBottom(20.5, 19)} />
      <C0402 name="C_VDDPST3" pn={C_100NF_PN} capacitance="100nF" {...atBottom(20.5, 20)} />
      <C0402 name="C_VDDPST4" pn={C_100NF_PN} capacitance="100nF" {...atBottom(20.5, 21)} />
      <C0402 name="C_VDDPST5" pn={C_100NF_PN} capacitance="100nF" {...atBottom(29.5, 18)} />
      <C0402 name="C_VDDPST6" pn={C_100NF_PN} capacitance="100nF" {...atBottom(29.5, 19)} />
      <C0402 name="C_VDDPST_A" pn={C_100NF_PN} capacitance="100nF" {...atBottom(29.5, 20)} />
      <C0402 name="C_VDDPST_B" pn={C_100NF_PN} capacitance="100nF" {...atBottom(29.5, 21)} />
      <C0402 name="C_VDDPST_LDO" pn={C_100NF_PN} capacitance="100nF" {...atBottom(25, 13)} />
      <C0402 name="C_VDDPST_DCDC" pn={C_100NF_PN} capacitance="100nF" {...atBottom(26, 13)} />
      <C0402 name="C_VDD_HP_0" pn={C_100NF_PN} capacitance="100nF" {...atBottom(22, 23)} />
      <C0402 name="C_VDD_HP_2" pn={C_100NF_PN} capacitance="100nF" {...atBottom(24, 23)} />
      <C0402 name="C_VDD_HP_3" pn={C_100NF_PN} capacitance="100nF" {...atBottom(26, 23)} />
      <C0402 name="C_VDD_MIPI" pn={C_100NF_PN} capacitance="100nF" {...atBottom(28, 23)} />
      <C0402 name="C_VCCA" pn={C_100NF_PN} capacitance="100nF" {...atBottom(30, 23)} />
      <C0603 name="C_VDD_BULK_T" pn={C_10UF_PN} capacitance="10uF" {...atBottom(22, 13)} />
      <C0603 name="C_VDD_BULK_B" pn={C_10UF_PN} capacitance="10uF" {...atBottom(28, 13)} />

      <L0603 name="FB_VDDA" pn={FB_PN} inductance="120R@100MHz" {...atBottom(31, 18)} />
      <C0402 name="C_VDDA" pn={C_100NF_PN} capacitance="100nF" {...atBottom(31.5, 19)} />
      <C0603 name="C_VBAT" pn={C_10UF_PN} capacitance="10uF" {...atBottom(31, 20)} />

      <C0402 name="C_FB_LDO1" pn={C_1UF_PN} capacitance="1uF" {...atBottom(31.5, 15)} />
      <C0402 name="C_FB_LDO2" pn={C_1UF_PN} capacitance="1uF" {...atBottom(31.5, 14)} />
      <C0402 name="C_FB_LDO3" pn={C_1UF_PN} capacitance="1uF" {...atBottom(30.5, 14)} />
      <C0402 name="C_FB_LDO4" pn={C_1UF_PN} capacitance="1uF" {...atBottom(29.5, 14)} />
      <C0402 name="C_FB_DCDC" pn={C_1UF_PN} capacitance="1uF" {...atBottom(28.5, 14)} />

      <Crystal40Mhz name="Y1" pn={XTAL40_PN} {...at(25, 25)} />
      <C0402 name="C_XTAL_P" pn={C_10PF_PN} capacitance="10pF" {...at(23, 25)} />
      <C0402 name="C_XTAL_N" pn={C_10PF_PN} capacitance="10pF" {...at(27, 25)} />

      <W25q128Jv name="U_FLASH" pn={W25Q128_PN} {...atBottom(25, 9)} />
      <C0402 name="C_FLASH" pn={C_100NF_PN} capacitance="100nF" {...atBottom(28, 9)} />
      <R0402 name="R_FLASH_CS" pn={R_10K_PN} resistance="10k" {...atBottom(22, 9)} />
      <R0402 name="R_FLASH_WP" pn={R_10K_PN} resistance="10k" {...atBottom(22, 10)} />
      <R0402 name="R_FLASH_HOLD" pn={R_10K_PN} resistance="10k" {...atBottom(22, 11)} />

      <R0402 name="R_EN" pn={R_10K_PN} resistance="10k" {...at(33, 18)} />
      <C0402 name="C_EN" pn={C_100NF_PN} capacitance="100nF" {...at(33, 19)} />
      <TactileTs1088 name="SW_RESET" pn={TS1088_PN} {...at(36, 18)} />
      <TactileTs1088 name="SW_BOOT" pn={TS1088_PN} {...at(36, 22)} />
      <R0402 name="R_BOOT_PU" pn={R_10K_PN} resistance="10k" {...at(33, 22)} />

      <R0402 name="R_MDIO_PU" pn={R_4K7_PN} resistance="4.7k" {...at(17, 14)} />
      <R0402 name="R_MDC_PU" pn={R_4K7_PN} resistance="4.7k" {...at(17, 15)} />
      <R0402 name="R_REFCLK" pn={R_33R_PN} resistance="33" {...at(17, 16)} />

      <trace from=".Y1 > .XIN" to=".U_P4 > .XTAL_P" />
      <trace from=".Y1 > .XOUT" to=".U_P4 > .XTAL_N" />
      <trace from=".Y1 > .GND1" to=".U_P4 > .GND" />
      <trace from=".Y1 > .GND2" to=".U_P4 > .GND" />
      <trace from=".C_XTAL_P > .pin1" to=".U_P4 > .XTAL_P" />
      <trace from=".C_XTAL_P > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_XTAL_N > .pin1" to=".U_P4 > .XTAL_N" />
      <trace from=".C_XTAL_N > .pin2" to=".U_P4 > .GND" />

      <trace from=".U_FLASH > .CS_N" to=".U_P4 > .FLASH_CS" />
      <trace from=".U_FLASH > .DO" to=".U_P4 > .FLASH_Q" />
      <trace from=".U_FLASH > .IO2_WP" to=".U_P4 > .FLASH_WP" />
      <trace from=".U_FLASH > .GND" to=".U_P4 > .GND" />
      <trace from=".U_FLASH > .DI" to=".U_P4 > .FLASH_D" />
      <trace from=".U_FLASH > .CLK" to=".U_P4 > .FLASH_CK" />
      <trace from=".U_FLASH > .IO3_HOLD" to=".U_P4 > .FLASH_HOLD" />
      <trace from=".U_FLASH > .VCC" to=".C_FLASH > .pin1" />
      <trace from=".C_FLASH > .pin2" to=".U_P4 > .GND" />
      <trace from=".R_FLASH_CS > .pin1" to=".U_FLASH > .CS_N" />
      <trace from=".R_FLASH_CS > .pin2" to=".U_FLASH > .VCC" />
      <trace from=".R_FLASH_WP > .pin1" to=".U_FLASH > .IO2_WP" />
      <trace from=".R_FLASH_WP > .pin2" to=".U_FLASH > .VCC" />
      <trace from=".R_FLASH_HOLD > .pin1" to=".U_FLASH > .IO3_HOLD" />
      <trace from=".R_FLASH_HOLD > .pin2" to=".U_FLASH > .VCC" />

      <trace from=".R_EN > .pin1" to=".U_P4 > .CHIP_PU" />
      <trace from=".R_EN > .pin2" to=".U_P4 > .VBAT" />
      <trace from=".C_EN > .pin1" to=".U_P4 > .CHIP_PU" />
      <trace from=".C_EN > .pin2" to=".U_P4 > .GND" />
      <trace from=".SW_RESET > .A" to=".U_P4 > .CHIP_PU" />
      <trace from=".SW_RESET > .B" to=".U_P4 > .GND" />
      <trace from=".SW_BOOT > .A" to=".U_P4 > .GPIO0" />
      <trace from=".SW_BOOT > .B" to=".U_P4 > .GND" />
      <trace from=".R_BOOT_PU > .pin1" to=".U_P4 > .GPIO0" />
      <trace from=".R_BOOT_PU > .pin2" to=".U_P4 > .VBAT" />

      <trace from=".FB_VDDA > .pin1" to=".U_P4 > .VBAT" />
      <trace from=".FB_VDDA > .pin2" to=".U_P4 > .VDDA" />
      <trace from=".C_VDDA > .pin1" to=".U_P4 > .VDDA" />
      <trace from=".C_VDDA > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VBAT > .pin1" to=".U_P4 > .VBAT" />
      <trace from=".C_VBAT > .pin2" to=".U_P4 > .GND" />

      <trace from=".C_VDDPST1 > .pin1" to=".U_P4 > .VDDPST_1" />
      <trace from=".C_VDDPST1 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST2 > .pin1" to=".U_P4 > .VDDPST_2" />
      <trace from=".C_VDDPST2 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST3 > .pin1" to=".U_P4 > .VDDPST_3" />
      <trace from=".C_VDDPST3 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST4 > .pin1" to=".U_P4 > .VDDPST_4" />
      <trace from=".C_VDDPST4 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST5 > .pin1" to=".U_P4 > .VDDPST_5" />
      <trace from=".C_VDDPST5 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST6 > .pin1" to=".U_P4 > .VDDPST_6" />
      <trace from=".C_VDDPST6 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST_A > .pin1" to=".U_P4 > .VDDPST_A" />
      <trace from=".C_VDDPST_A > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST_B > .pin1" to=".U_P4 > .VDDPST_B" />
      <trace from=".C_VDDPST_B > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST_LDO > .pin1" to=".U_P4 > .VDDPST_LDO" />
      <trace from=".C_VDDPST_LDO > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDDPST_DCDC > .pin1" to=".U_P4 > .VDDPST_DCDC" />
      <trace from=".C_VDDPST_DCDC > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDD_HP_0 > .pin1" to=".U_P4 > .VDD_HP_0" />
      <trace from=".C_VDD_HP_0 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDD_HP_2 > .pin1" to=".U_P4 > .VDD_HP_2" />
      <trace from=".C_VDD_HP_2 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDD_HP_3 > .pin1" to=".U_P4 > .VDD_HP_3" />
      <trace from=".C_VDD_HP_3 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDD_MIPI > .pin1" to=".U_P4 > .VDD_MIPI_DPHY" />
      <trace from=".C_VDD_MIPI > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VCCA > .pin1" to=".U_P4 > .VCCA" />
      <trace from=".C_VCCA > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDD_BULK_T > .pin1" to=".U_P4 > .VDD_HP_0" />
      <trace from=".C_VDD_BULK_T > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_VDD_BULK_B > .pin1" to=".U_P4 > .VDD_HP_3" />
      <trace from=".C_VDD_BULK_B > .pin2" to=".U_P4 > .GND" />

      <trace from=".C_FB_LDO1 > .pin1" to=".U_P4 > .VFB_VO1" />
      <trace from=".C_FB_LDO1 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_FB_LDO2 > .pin1" to=".U_P4 > .VFB_VO2" />
      <trace from=".C_FB_LDO2 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_FB_LDO3 > .pin1" to=".U_P4 > .VFB_VO3" />
      <trace from=".C_FB_LDO3 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_FB_LDO4 > .pin1" to=".U_P4 > .VFB_VO4" />
      <trace from=".C_FB_LDO4 > .pin2" to=".U_P4 > .GND" />
      <trace from=".C_FB_DCDC > .pin1" to=".U_P4 > .FB_DCDC" />
      <trace from=".C_FB_DCDC > .pin2" to=".U_P4 > .GND" />
      <trace from=".U_P4 > .EN_DCDC" to=".U_P4 > .VBAT" />

      <trace from=".R_MDIO_PU > .pin1" to=".U_P4 > .GPIO47" />
      <trace from=".R_MDIO_PU > .pin2" to=".U_P4 > .VBAT" />
      <trace from=".R_MDC_PU > .pin1" to=".U_P4 > .GPIO46" />
      <trace from=".R_MDC_PU > .pin2" to=".U_P4 > .VBAT" />
      <trace from=".R_REFCLK > .pin1" to=".U_P4 > .GPIO39" />
    </>
  );
};
