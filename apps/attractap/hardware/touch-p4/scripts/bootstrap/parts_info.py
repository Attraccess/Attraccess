"""Parts-list data of every part that is not a plain resistor or capacitor, by LCSC number: manufacturer,
full description, lifecycle and an approved alternate. design.py puts them on the parts; the parts lists
in fab/jlcpcb/ and docs/parts.md show them.

Manufacturer and part number are LCSC's (EasyEDA part data). Lifecycle is the maker's own status where
the maker publishes one, else the part status a distributor shows (DigiKey), with the date it was read;
"not stated" where neither gives one. An alternate is listed only when its maker's pin table and package
match the fitted part (a datasheet statement or the two pin tables compared); "none" where no such part
was found. The sources are in docs/parts.md.
"""

# lifecycle sources (read on 25 November 2026)
ESPRESSIF = 'Mass Production (products.espressif.com)'
TI = 'ACTIVE (ti.com)'
DIGIKEY = 'Active (DigiKey part status)'
NOT_STATED = 'not stated by the maker'
# discretes with no part-specific alternate: another maker's part of the same value, rating and package
EQUIVALENT = 'equivalent part of the same value, rating and package'

# LCSC -> (manufacturer, description, lifecycle, alternate). Lifecycle is given for ICs and modules.
PARTS = {
    'C54540373': ('Espressif', 'MCU ESP32-P4, dual-core RISC-V 400 MHz, 32 MB PSRAM in package, chip revision '
                  'v3.x, QFN-104 10 x 10 mm', ESPRESSIF,
                  'Espressif ESP32-P4NRW16X (JLCPCB C55820335): 16 MB PSRAM, firmware must fit; no stock'),
    'C20627095': ('Espressif', 'Wi-Fi 6 / BLE 5 / 802.15.4 module ESP32-C6, 4 MB flash, MHF III antenna '
                  'connector, -40 to 105 C', ESPRESSIF,
                  'Espressif ESP32-C6-MINI-1U-N4 (C7558096): -40 to 85 C; no stock'),
    'C97521': ('Winbond', '128 Mbit QSPI NOR flash, SOIC-8 208 mil', DIGIKEY,
               'GigaDevice GD25Q128ESIGR (C2928891)'),
    'C703537': ('IC Plus', '10/100 Ethernet PHY, RMII, -40 to 85 C, QFN-32 4 x 4 mm', NOT_STATED,
                'the same part, LCSC C910373'),
    'C53457895': ('Tokmas', 'NFC reader IC, pin-compatible with NXP PN532, QFN-40 6 x 6 mm', NOT_STATED,
                  'NXP PN5321A3HN/C106 (C28925): NRND at NXP'),
    'C141836': ('Texas Instruments', '2 A synchronous buck, 2.5 to 5.5 V in, 0.6 V reference, SOT-23-5', TI,
                'SGMICRO SGM61020XN5G/TR (C5153643)'),
    'C2941042': ('Texas Instruments', 'Ideal diode controller for an N-channel MOSFET, 3.2 to 65 V, 80 uA, '
                 'AEC-Q100, SOT-23-6', TI,
                 'Maxinmicro MX74700T (C22468156): same pins, 300 uA, not automotive-qualified'),
    'C3662799': ('Texas Instruments', 'eFuse 2.7 to 23 V 5.5 A, 28 mOhm, true reverse current blocking, adjustable '
                 'UVLO and OVLO, VQFN-10 2 x 2 mm', TI,
                 'none stocked (TPS259470LRPWR, latch-off, has the same pins: no stock)'),
    'C132016': ('Texas Instruments', 'Voltage supervisor 2.93 V, 200 ms, open-drain active-low reset, SOT-23', TI,
                '3PEAK TPV803S-3STR (C2842356): 2.85 to 3.00 V, 140 to 280 ms'),
    'C67272': ('Infineon', 'N-channel MOSFET 30 V 5.3 A, 27 mOhm at 10 V, 40 mOhm at 4.5 V, +-20 V gate, SOT-23',
               '', 'Diodes DMN3023L-7 (C443825): 25 mOhm at 10 V, +-20 V gate, same pins'),
    'C2071056': ('Diodes Inc.', '5 V 2 A synchronous buck, 3.8 to 32 V in, TSOT-26', DIGIKEY,
                 'SCT SCT2325TVBR (C509064): fixed 5 V, check the inductor value'),
    'C264086': ('Diodes Inc.', 'White LED boost driver, 1 MHz, overvoltage protection, SOT-23-6', DIGIKEY,
                'MSKSEMI MSAP3032KTR-G1 (C49208388): 1.2 MHz, PWM dimming 20 kHz to 1 MHz'),
    'C477924': ('Texas Instruments', '8-bit I2C IO expander, address 0x20 to 0x27, TSSOP-16', TI,
                'NXP PCA9554PW,118 (C17230); not the PCA9554A'),
    'C473338': ('Texas Instruments', 'Single bus buffer, 3-state, 1.6 to 5.5 V, level-shifting inputs, SOT-23-5',
                TI, 'I-core AiP74LV1T125GB235.TR (C5354320)'),
    'C110926': ('STMicroelectronics', '3-axis accelerometer, I2C/SPI, 12-bit, LGA-12 2 x 2 mm', DIGIKEY,
                'none stocked found (STMicroelectronics IIS2DHTR, C2655071: 1 piece)'),
    'C140921': ('Texas Instruments', 'Omnipolar Hall switch, 4.8 mT, push-pull, 20 Hz, SOT-23', TI,
                'Texas Instruments DRV5032FBDBZR (C2655033): samples at 5 Hz'),
    'C142526': ('Vishay', 'Proximity and ambient light sensor, I2C, 0x60', DIGIKEY + ' (not the -H3 suffix)',
                'none'),
    'C7519': ('STMicroelectronics', 'ESD protection, two USB lines and VBUS, SOT-23-6', DIGIKEY,
              'STMicroelectronics USBLC6-2SC6Y (C2969755)'),
    'C5380106': ('SDAPO', 'Isolated IEEE 802.3af powered-device module, 5 V 9 W, 1500 V isolation',
                 NOT_STATED + ' (listed as current on sdapo.com)',
                 'Silvertel Ag9905M: same pin table; footprint identity not proven; no stock'),
    'C20917': ('Alpha & Omega', 'N-channel MOSFET 30 V 5.7 A, SOT-23', 'Full Production (aosmd.com)',
               'UMW AO3400A (C347475)'),
    'C165948': ('Korean Hroparts Elec (HRO)', 'USB-C receptacle, USB 2.0, 16 pins, SMD with shell pins',
                NOT_STATED, 'HRO TYPE-C-31-M-12A (C5337088)'),
    'C3096082': ('Same Sky (CUI Devices)', 'DC power jack 5.5 x 2.1 mm, through hole, 24 V', DIGIKEY,
                 'Same Sky PJ-002AH (C2961147)'),
    'C2765061': ('WAGO', 'PCB terminal block, push-button, 2 poles, 3.5 mm, wires 0.2 to 1.5 mm2', DIGIKEY,
                 'WAGO 2601-3102 lever terminal (C20252913) in the same holes'),
    'C91754': ('HanRun', 'RJ45 jack, 10/100 magnetics, PoE rectifier bridges, two LEDs, through hole',
               NOT_STATED, 'none'),
    'C202114': ('Hirose', 'FPC connector, 40 pins, 0.5 mm, bottom contact, flip lock', DIGIKEY,
                'none with the same land pattern'),
    'C5149201': ('OPSCO', 'RGB LED with integrated driver, reverse mount, 3.2 x 2.8 mm', NOT_STATED,
                 'OPSCO SK6812MINI-EA (C5378731)'),
    'C94599': ('Huaneng', 'Magnetic buzzer 2.7 kHz, 16 ohm, 8.5 x 8.5 mm, SMD', NOT_STATED,
               'XHXDZ SMD8530-16 ohm (C49246948): check which pad is +'),
    'C318884': ('XKB Connection', 'Tactile switch 5.1 x 5.1 mm, SMD, 1.5 mm actuator', '',
                EQUIVALENT),
    'C255943': ('Epson', 'Crystal 40 MHz, 9 pF load, +-10 ppm, ESR 40 ohm, 3.2 x 2.5 mm', '',
                'Tai-Saw TZ0308D (C379787): 9 pF, +-10 ppm, ESR 30 ohm'),
    'C9006': ('YXC', 'Crystal 25 MHz, 12 pF load, +-10 ppm, 3.2 x 2.5 mm', '',
              'Epson X1E0000210139 (C91750): 12 pF, +-10 ppm, ESR 40 ohm'),
    'C113669': ('YXC', 'Crystal 27.12 MHz, 12 pF load, +-10 ppm, 3.2 x 2.5 mm', '',
                'Epson X1E0000210860 (C255927): 12 pF, +-10 ppm, ESR 40 ohm'),
    'C89650': ('Bourns', 'PTC resettable fuse, 2 A hold, 4 A trip, 8 V, 1812', '',
               'Littelfuse 1812L200/16DR (C439873): trips at 3.5 A, 16 V, taller'),
    'C21000': ('RUILON', 'PTC resettable fuse, 1.1 A hold, 2.2 A trip, 33 V, 1812', '',
               'Littelfuse 1812L110/33MR (C142747): trips at 1.95 A, 33 V, 20 A maximum fault current'),
    'C19077523': ('R+O (Hongjiacheng)', 'TVS diode, unidirectional, 400 W, 5 V stand-off, 9.2 V at 43.5 A, SMA', '',
                  'Littelfuse SMAJ5.0A (C83329): same ratings'),
    'C19077554': ('R+O (Hongjiacheng)', 'TVS diode, unidirectional, 400 W, 58 V stand-off, 93.6 V at 4.3 A, SMA', '',
                  'Littelfuse SMAJ58A (C151246): same ratings'),
    'C178227': ('Littelfuse', 'TVS diode, unidirectional, 600 W, 28 V stand-off, 31.1 to 34.4 V breakdown, '
                '45.4 V at 13.3 A, SMB', '', 'Vishay SMBJ28A-E3/52 (C553979): same ratings'),
    'C8678': ('MDD (Microdiode)', 'Schottky diode 40 V 3 A, SMA', '',
              'Diodes Inc B340A-13-F (C85098): 40 V 3 A, 0.35 V at 0.5 A'),
    'C8598': ('CJ (Changjiang)', 'Schottky diode 40 V 1 A, SOD-123', '', 'MCC B5819W-TP (C84354): same ratings'),
    'C81598': ('ST (Shenzhen Xianke)', 'Switching diode 100 V 150 mA, SOD-123', '',
               'Vishay 1N4148W-HE3-08 (C117823): same ratings'),
    'C21519': ('TDK', 'Ferrite bead 600 ohm at 100 MHz, 2 A, 0.1 ohm, 0805', '',
               'Sunlord UPZ2012E601-2R0TF (C98308): 600 ohm, 2 A, 0.09 ohm, similar curve'),
    'C85833': ('Murata', 'Ferrite bead 600 ohm at 100 MHz, 1.3 A, 0.15 ohm, 0603', '',
               'Sunlord UPZ1608U601-1R3TF (C97000): 600 ohm, 1.3 A, 0.15 ohm'),
    'C98361': ('Sunlord', 'Power inductor 2.2 uH 20 %, saturation 6.1 A, rated 4.3 A, 48 mOhm, 4 x 4 x 2 mm', '',
               'CENKER CKCSA4020-2.2uH/M (C5291938): same ratings'),
    'C354540': ('CENKER', 'Power inductor 2.2 uH 20 %, saturation 2.6 A, rated 1.9 A, 2.5 x 2.0 x 1.25 mm', '',
                'Sunlord WPN252012H2R2MT (C98350): same ratings'),
    'C5291940': ('CENKER', 'Power inductor 6.8 uH 20 %, saturation 3.0 A, rated 2.4 A, 4 x 4 x 2 mm', '',
                 'Sunlord WPN4020H6R8MT (C97036): same ratings'),
    'C45403': ('Sunlord', 'Power inductor 10 uH 20 %, saturation 0.72 A, rated 0.77 A, 3 x 3 x 1.5 mm', '',
               'TDK VLS3015CX-100M-1 (C2044430): saturation 0.92 A, rated 1.17 A'),
    'C91630': ('Murata', 'Wire-wound inductor 560 nH 5 %, 450 mA, 0603', '',
               'Chilisin BWLS00161109R56J00 (C6473441): 560 nH 5 %, Q 17, body 0.3 mm wider'),
    'C251040': ('Nichicon', 'Aluminium electrolytic 47 uF 50 V 20 %, 6.3 x 7.7 mm, 0.66 ohm at 100 kHz, 105 C',
                '', 'ROQANG RVT1H470M0607 (C72523) or Lelon VZH470M1HTR-0607 (C164078)'),
    'C7469977': ('FOSAN', 'Aluminium electrolytic 100 uF 16 V 20 %, 6.3 x 5.4 mm, 105 C 2000 h', '',
                 EQUIVALENT),
    'C25501': ('UNI-ROYAL (Uniroyal Elec)', 'Resistor array 4 x 33 ohm 5 % 62.5 mW, 4 x 0402 convex', '',
               EQUIVALENT),
}


def info(lcsc):
    """(manufacturer, description, lifecycle, alternate) of a part, or None."""
    return PARTS.get(lcsc)


# Bought for every reader but not assembled by JLCPCB: (variants, quantity, item, manufacturer, part
# number, description, alternate). The complete parts lists (fab/jlcpcb/parts-list-<variant>.csv) add them.
NOT_ASSEMBLED = [
    (('wifi', 'lan'), 1, 'Display panel', 'commodity (Elecrow DIS16804D or the same panel)',
     '4.0in 480x480 ST7701S + GT911, 40 pins', 'IPS TFT 4.0 in 480 x 480, RGB565, capacitive touch, 40-pin 0.5 mm '
     'flex; taped on, flex into J601 (docs/design-notes.md, "Display mounting and flex")',
     'any panel with the same drawing and pin table (docs/design-notes.md)'),
    (('wifi', 'lan'), 1, 'Wi-Fi antenna', 'Shanghai Deman Electronics', 'TFPD08H10060011',
     'Sleeve monopole 2.4 GHz, 2.33 dBi peak, MHF III plug: the antenna the module was certified with. '
     'Quote from Espressif or Deman (docs/parts.md)',
     'Taoglas GW.26.0111 (2.24 dBi) on CAB.A02 SMA bulkhead cable: radiated tests needed (docs/compliance.md)'),
]
