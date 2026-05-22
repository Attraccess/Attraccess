// Core board ATT-349 ESP32-P4 plus C6 plus power mux plus regulators 4-layer
// FEATURE: hardware/core — Phase 2 Attractap V2 motherboard PCB

import {
  AttraccessLogo,
  BoardLabel,
  boardCoord,
  Pin1Marker,
} from '@attraccess/attractap-hw-shared';
import { Connectors } from './connectors';
import { JtagBlock } from './jtag';
import { McuC6 } from './mcu-c6';
import { McuP4 } from './mcu-p4';
import { Power } from './power';
import { UsbBlock } from './usb';

const W = 50;
const H = 35;
const at = (x: number, y: number) => boardCoord({ x, y, boardW: W, boardH: H });

export default () => (
  <board
    width={`${W}mm`}
    height={`${H}mm`}
    layerCount={4}
    autorouter="sequential-trace"
    defaultTraceWidth="0.18mm"
  >
    <Power boardW={W} boardH={H} />
    <McuP4 boardW={W} boardH={H} />
    <McuC6 boardW={W} boardH={H} />
    <UsbBlock boardW={W} boardH={H} />
    <JtagBlock boardW={W} boardH={H} />
    <Connectors boardW={W} boardH={H} />

    <hole diameter="3.2mm" {...at(3, 3)} />
    <hole diameter="3.2mm" {...at(47, 3)} />
    <hole diameter="3.2mm" {...at(3, 32)} />
    <hole diameter="3.2mm" {...at(47, 32)} />

    <BoardLabel name="ATT-349 CORE" rev="v0" {...at(25, 14)} />
    <AttraccessLogo {...at(8, 9)} scale={1.0} />
    <AttraccessLogo {...at(42, 9)} scale={1.0} />
    <Pin1Marker {...at(20.2, 32)} />
    <Pin1Marker {...at(20.2, 3)} />

    <trace from=".J_POE > .pin1" to=".D_VBUS > .cathode" />
    <trace from=".J_POE > .pin2" to=".J_POE > .pin1" />
    <trace from=".J_POE > .pin1" to=".U_OR > .VIN1" />
    <trace from=".J_PWR_DC > .pin1" to=".U_OR > .VIN2" />
    <trace from=".J_PWR_DC > .pin2" to=".U_OR > .VIN2" />
    <trace from=".J_POE > .pin3" to=".U_OR > .GND_A" />
    <trace from=".J_POE > .pin4" to=".U_OR > .GND_A" />
    <trace from=".J_POE > .pin15" to=".U_OR > .GND_A" />
    <trace from=".J_PWR_DC > .pin3" to=".U_OR > .GND_B" />
    <trace from=".J_PWR_DC > .pin4" to=".U_OR > .GND_B" />

    <trace from=".J_NFC > .pin8" to=".D_VBUS > .cathode" />
    <trace from=".J_BEEP > .pin1" to=".D_VBUS > .cathode" />
    <trace from=".J_DISP > .pin1" to=".D_VBUS > .cathode" />

    <trace from=".J_NFC > .pin1" to=".L_BUCK > .pin2" />
    <trace from=".J_DISP > .pin2" to=".L_BUCK > .pin2" />

    <trace from=".J_NFC > .pin2" to=".U_OR > .GND_A" />
    <trace from=".J_NFC > .pin9" to=".U_OR > .GND_A" />
    <trace from=".J_BEEP > .pin2" to=".U_OR > .GND_A" />
    <trace from=".J_DISP > .pin3" to=".U_OR > .GND_A" />
    <trace from=".J_DISP > .pin6" to=".U_OR > .GND_A" />
    <trace from=".J_DISP > .pin9" to=".U_OR > .GND_A" />
    <trace from=".J_DISP > .pin12" to=".U_OR > .GND_A" />
    <trace from=".J_DISP > .pin20" to=".U_OR > .GND_A" />

    <trace from=".U_P4 > .GND" to=".U_OR > .GND_A" />

    <trace from=".U_P4 > .VDDPST_1" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_2" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_3" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_4" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_5" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_6" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_A" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_B" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_LDO" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDDPST_DCDC" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDD_HP_0" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDD_HP_2" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDD_HP_3" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VDD_MIPI_DPHY" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VCCA" to=".L_BUCK > .pin2" />
    <trace from=".U_P4 > .VBAT" to=".L_BUCK > .pin2" />

    <trace from=".U_C6 > .VDD3V3" to=".L_BUCK > .pin2" />
    <trace from=".U_C6 > .GND1" to=".U_OR > .GND_A" />
    <trace from=".U_FLASH > .VCC" to=".L_BUCK > .pin2" />

    <trace from=".R_USB_CC1 > .pin1" to=".J_USB > .CC1" />
    <trace from=".R_USB_CC2 > .pin1" to=".J_USB > .CC2" />
    <trace from=".R_USB_CC1 > .pin2" to=".U_OR > .GND_A" />
    <trace from=".R_USB_CC2 > .pin2" to=".U_OR > .GND_A" />

    <trace from=".J_USB > .VBUS" to=".D_VBUS > .anode" />
    <trace from=".J_USB > .GND_A1B12" to=".U_OR > .GND_A" />
    <trace from=".R_USB_DM > .pin2" to=".U_P4 > .DM" />
    <trace from=".R_USB_DP > .pin2" to=".U_P4 > .DP" />

    <trace from=".U_P4 > .GPIO39" to=".J_POE > .pin11" />
    <trace from=".R_REFCLK > .pin2" to=".J_POE > .pin11" />
    <trace from=".U_P4 > .GPIO40" to=".J_POE > .pin5" />
    <trace from=".U_P4 > .GPIO41" to=".J_POE > .pin6" />
    <trace from=".U_P4 > .GPIO42" to=".J_POE > .pin7" />
    <trace from=".U_P4 > .GPIO43" to=".J_POE > .pin8" />
    <trace from=".U_P4 > .GPIO44" to=".J_POE > .pin9" />
    <trace from=".U_P4 > .GPIO45" to=".J_POE > .pin10" />
    <trace from=".U_P4 > .GPIO46" to=".J_POE > .pin13" />
    <trace from=".U_P4 > .GPIO47" to=".J_POE > .pin12" />
    <trace from=".U_P4 > .GPIO48" to=".J_POE > .pin14" />

    <trace from=".U_P4 > .GPIO49" to=".U_C6 > .IO19" />
    <trace from=".U_P4 > .GPIO50" to=".U_C6 > .IO18" />
    <trace from=".U_P4 > .GPIO51" to=".U_C6 > .IO20" />
    <trace from=".U_P4 > .GPIO52" to=".U_C6 > .IO21" />
    <trace from=".U_P4 > .GPIO53" to=".U_C6 > .IO22" />
    <trace from=".U_P4 > .GPIO54" to=".U_C6 > .IO23" />

    <trace from=".U_P4 > .GPIO24" to=".J_DISP > .pin16" />
    <trace from=".U_P4 > .GPIO25" to=".J_DISP > .pin17" />
    <trace from=".U_P4 > .GPIO26" to=".J_BEEP > .pin3" />
    <trace from=".U_P4 > .GPIO27" to=".J_NFC > .pin5" />
    <trace from=".U_P4 > .GPIO28" to=".J_NFC > .pin6" />
    <trace from=".U_P4 > .GPIO29" to=".J_NFC > .pin7" />
    <trace from=".U_P4 > .GPIO30" to=".J_DISP > .pin14" />
    <trace from=".U_P4 > .GPIO31" to=".J_DISP > .pin15" />
    <trace from=".U_P4 > .GPIO32" to=".J_DISP > .pin13" />
    <trace from=".U_P4 > .GPIO33" to=".J_DISP > .pin18" />
    <trace from=".U_P4 > .GPIO34" to=".J_DISP > .pin19" />

    <trace from=".U_P4 > .GPIO52" to=".J_NFC > .pin3" />
    <trace from=".U_P4 > .GPIO53" to=".J_NFC > .pin4" />

    <trace from=".U_P4 > .DSI_CLKP" to=".J_DISP > .pin4" />
    <trace from=".U_P4 > .DSI_CLKN" to=".J_DISP > .pin5" />
    <trace from=".U_P4 > .DSI_DATAP0" to=".J_DISP > .pin7" />
    <trace from=".U_P4 > .DSI_DATAN0" to=".J_DISP > .pin8" />
    <trace from=".U_P4 > .DSI_DATAP1" to=".J_DISP > .pin10" />
    <trace from=".U_P4 > .DSI_DATAN1" to=".J_DISP > .pin11" />

    <trace from=".J_SWD > .pin1" to=".L_BUCK > .pin2" />
    <trace from=".J_SWD > .pin2" to=".U_P4 > .GPIO35" />
    <trace from=".J_SWD > .pin3" to=".U_OR > .GND_A" />
    <trace from=".J_SWD > .pin4" to=".U_P4 > .GPIO36" />
    <trace from=".J_SWD > .pin5" to=".U_OR > .GND_A" />
    <trace from=".J_SWD > .pin6" to=".U_P4 > .GPIO37" />
    <trace from=".J_SWD > .pin7" to=".U_P4 > .GPIO43" />
    <trace from=".J_SWD > .pin8" to=".U_P4 > .GPIO38" />
    <trace from=".J_SWD > .pin9" to=".U_P4 > .GPIO44" />
    <trace from=".J_SWD > .pin10" to=".U_P4 > .CHIP_PU" />
  </board>
);
