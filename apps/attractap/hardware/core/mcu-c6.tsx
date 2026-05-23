// ESP32-C6 Wi-Fi Bluetooth coprocessor SDIO 4 bit slave esp_hosted on top side
// FEATURE: hardware/core — ATT-349 Phase 2 Core board network MCU

import {
  boardCoord,
  C0402,
  C0603,
  Esp32C6Mini1,
  R0402,
} from '@attraccess/attractap-hw-shared';

const C_100NF_PN = 'C307331';
const C_10UF_PN = 'C96446';
const C_22UF_PN = 'C45783';
const C_1UF_PN = 'C15849';
const R_10K_PN = 'C25744';
const C6_PN = 'C5736265';

export interface McuC6Props {
  readonly boardW: number;
  readonly boardH: number;
}

export const McuC6 = ({ boardW, boardH }: McuC6Props) => {
  const at = (x: number, y: number) => boardCoord({ x, y, boardW, boardH });
  return (
    <>
      <Esp32C6Mini1 name="U_C6" pn={C6_PN} {...at(45, 27)} />

      <C0603 name="C_C6_BULK" pn={C_22UF_PN} capacitance="22uF" {...at(40, 16)} />
      <C0402 name="C_C6_VDD" pn={C_100NF_PN} capacitance="100nF" {...at(43, 16)} />
      <C0603 name="C_C6_10U" pn={C_10UF_PN} capacitance="10uF" {...at(46, 16)} />
      <C0402 name="C_C6_EN" pn={C_1UF_PN} capacitance="1uF" {...at(49, 16)} />

      <R0402 name="R_C6_EN" pn={R_10K_PN} resistance="10k" {...at(40, 14)} />
      <R0402 name="R_C6_BOOT" pn={R_10K_PN} resistance="10k" {...at(43, 14)} />

      <R0402 name="R_SDIO_CMD" pn={R_10K_PN} resistance="10k" {...at(35, 28)} />
      <R0402 name="R_SDIO_D0" pn={R_10K_PN} resistance="10k" {...at(35, 26.5)} />
      <R0402 name="R_SDIO_D1" pn={R_10K_PN} resistance="10k" {...at(35, 25)} />
      <R0402 name="R_SDIO_D2" pn={R_10K_PN} resistance="10k" {...at(35, 23.5)} />
      <R0402 name="R_SDIO_D3" pn={R_10K_PN} resistance="10k" {...at(35, 22)} />

      <trace from=".C_C6_BULK > .pin1" to=".U_C6 > .VDD3V3" />
      <trace from=".C_C6_BULK > .pin2" to=".U_C6 > .GND1" />
      <trace from=".C_C6_VDD > .pin1" to=".U_C6 > .VDD3V3" />
      <trace from=".C_C6_VDD > .pin2" to=".U_C6 > .GND1" />
      <trace from=".C_C6_10U > .pin1" to=".U_C6 > .VDD3V3" />
      <trace from=".C_C6_10U > .pin2" to=".U_C6 > .GND1" />
      <trace from=".U_C6 > .GND1" to=".U_C6 > .GND2" />
      <trace from=".U_C6 > .GND2" to=".U_C6 > .GND11" />
      <trace from=".U_C6 > .GND11" to=".U_C6 > .GND14" />
      <trace from=".U_C6 > .GND14" to=".U_C6 > .GND36" />
      <trace from=".U_C6 > .GND36" to=".U_C6 > .GND37" />
      <trace from=".U_C6 > .GND37" to=".U_C6 > .GND38" />
      <trace from=".U_C6 > .GND38" to=".U_C6 > .GND39" />
      <trace from=".U_C6 > .GND39" to=".U_C6 > .GND40" />
      <trace from=".U_C6 > .GND40" to=".U_C6 > .GND41" />
      <trace from=".U_C6 > .GND41" to=".U_C6 > .GND42" />
      <trace from=".U_C6 > .GND42" to=".U_C6 > .GND43" />
      <trace from=".U_C6 > .GND43" to=".U_C6 > .GND44" />
      <trace from=".U_C6 > .GND44" to=".U_C6 > .GND45" />
      <trace from=".U_C6 > .GND45" to=".U_C6 > .GND46" />
      <trace from=".U_C6 > .GND46" to=".U_C6 > .GND47" />
      <trace from=".U_C6 > .GND47" to=".U_C6 > .GND48" />
      <trace from=".U_C6 > .GND48" to=".U_C6 > .GND49" />
      <trace from=".U_C6 > .GND49" to=".U_C6 > .GND50" />
      <trace from=".U_C6 > .GND50" to=".U_C6 > .GND51" />
      <trace from=".U_C6 > .GND51" to=".U_C6 > .GND52" />
      <trace from=".U_C6 > .GND52" to=".U_C6 > .GND53" />

      <trace from=".R_C6_EN > .pin1" to=".U_C6 > .EN" />
      <trace from=".R_C6_EN > .pin2" to=".U_C6 > .VDD3V3" />
      <trace from=".C_C6_EN > .pin1" to=".U_C6 > .EN" />
      <trace from=".C_C6_EN > .pin2" to=".U_C6 > .GND1" />
      <trace from=".R_C6_BOOT > .pin1" to=".U_C6 > .IO9" />
      <trace from=".R_C6_BOOT > .pin2" to=".U_C6 > .VDD3V3" />

      <trace from=".R_SDIO_CMD > .pin1" to=".U_C6 > .IO18" />
      <trace from=".R_SDIO_CMD > .pin2" to=".U_C6 > .VDD3V3" />
      <trace from=".R_SDIO_D0 > .pin1" to=".U_C6 > .IO20" />
      <trace from=".R_SDIO_D0 > .pin2" to=".U_C6 > .VDD3V3" />
      <trace from=".R_SDIO_D1 > .pin1" to=".U_C6 > .IO21" />
      <trace from=".R_SDIO_D1 > .pin2" to=".U_C6 > .VDD3V3" />
      <trace from=".R_SDIO_D2 > .pin1" to=".U_C6 > .IO22" />
      <trace from=".R_SDIO_D2 > .pin2" to=".U_C6 > .VDD3V3" />
      <trace from=".R_SDIO_D3 > .pin1" to=".U_C6 > .IO23" />
      <trace from=".R_SDIO_D3 > .pin2" to=".U_C6 > .VDD3V3" />
    </>
  );
};
