"""Circuit description, part 1: power input, the ESP32-P4 with its supplies, and the Wi-Fi module.

Each function adds the parts of one schematic sheet to the design (see design.py)."""


DC_INPUT_CAP = '2.2u/100V'      # C112, C113, C117; why this value: see power()
BUCK_L = ('C98361', 'WPN4020H2R2MT')      # Sunlord 2.2 uH, 4 x 4 mm, Isat 6.1 A (L101)
DC_BULK = ('C251040', 'UCD1H470MCL1GS')     # Nichicon 47 uF / 50 V, 6.3 x 7.7 mm, 0.66 ohm at 100 kHz (C120)
DC_TVS = ('C178227', 'SMBJ28A')     # Littelfuse, D106
DC_TVS_IN = ('C151259', 'SMBJ28CA')  # Littelfuse, D107
DC_DIODE = ('C7420364', 'SS310')     # R+O (Hongjiacheng), D105


def power(d):
    """Power input: USB-C, PoE, supply OR-ing, 3.3 V buck."""
    d.begin('power', 100)
    d.group('USB-C input')
    d.add('J', 'USB-C', 'attractap:TYPE-C-31-M-12', 'attractap:USB-C_SMD-TYPE-C-31-M-12_1', {
        'A4B9': 'VBUS', 'B4A9': 'VBUS', 'A1B12': 'GND', 'B1A12': 'GND',
        'A5': 'USB_CC1', 'B5': 'USB_CC2',
        'A6': 'USB_DP', 'B6': 'USB_DP', 'A7': 'USB_DN', 'B7': 'USB_DN',
        '1': 'GND', '2': 'GND', '3': 'GND', '4': 'GND',
    }, nc=('A8', 'B8'), lcsc='C165948', mpn='TYPE-C-31-M-12', desc='USB-C receptacle, 16 pin')
    d.R('5.1k', 'USB_CC1', 'GND')
    d.R('5.1k', 'USB_CC2', 'GND')
    d.add('F', '2A PTC', 'Device:Polyfuse', 'attractap:F1812', {'1': 'VBUS', '2': 'VBUS_F'},
          lcsc='C89650', mpn='MF-MSMF200L-2', desc='Resettable fuse 2 A hold')
    d.add('D', 'SMAJ5.0A', 'Diode:SMAJ5.0A', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'VBUS_F', '2': 'GND'},
          lcsc='C19077523', mpn='SMAJ5.0A', desc='TVS, USB supply')
    d.add('U', 'USBLC6-2SC6', 'attractap:USBLC6-2SC6', 'attractap:SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL', {
        '1': 'USB_DN', '6': 'USB_DN', '3': 'USB_DP', '4': 'USB_DP', '2': 'GND', '5': 'VBUS_F',
    }, lcsc='C7519', mpn='USBLC6-2SC6', desc='USB ESD protection')
    d.FB('VBUS_F', '+5V_USB', big=True)
    # What VBUS sees when the plug goes in: this capacitor (at most 10 uF, USB 2.0 7.2.4.1); the eFuse
    # behind it charges the rest of the board slowly.
    d.C('10u/25V', '+5V_USB', size='0805')
    # The eFuse blocks current from the 5 V rail back into VBUS (also when it is on), but leaks a few
    # microamps while VBUS is unpowered. Without a load the unplugged connector's VBUS would float, and a
    # USB-C host only switches its supply on when it finds VBUS at 0 V.
    d.R('4.7k', '+5V_USB', 'GND', ref='R104', desc='bleed: keeps VBUS at 0 V while another source powers the board')
    # eFuse with true reverse current blocking: slew-limited start (inrush), 2 A limit, UVLO 4.32 V and
    # OVLO 5.62 V set by one divider of 0.1 % resistors: with the OVLO threshold's +-1.7 % the eFuse opens
    # between 5.53 V (above vSafe5V's 5.5 V) and 5.74 V (below the 6.0 V that TLV62569 and PN532 stand).
    # EN/UVLO and OVLO stand 6.5 V, which the divider keeps up to 23 V in.
    d.add('U', 'TPS259470ARPWR', 'attractap:TPS259470ARPWR', 'attractap:VQFN-10_L2.0-W2.0-P0.45-TL', {
        '5': '+5V_USB', '6': '+5V', '1': 'USB_EN', '2': 'USB_OV', '7': 'USB_DVDT', '9': 'USB_ILM', '8': 'GND',
    }, nc=('3', '4', '10'), ref='U105', lcsc='C3662799', mpn='TPS259470ARPWR',
        desc='USB input eFuse: soft start, current limit, no current back into VBUS')
    d.R('330k', '+5V_USB', 'USB_EN', size='0603', ref='R107', show=True, desc='UVLO 4.32 V rising')
    d.R('29.4k', 'USB_EN', 'USB_OV', ref='R108', show=True)
    d.R('97.6k', 'USB_OV', 'GND', ref='R109', show=True, desc='OVLO 5.62 V rising')
    d.R('1.65k', 'USB_ILM', 'GND', ref='R110', show=True, desc='current limit 1.8 to 2.2 A')
    d.C('2.2n', 'USB_DVDT', ref='C118', desc='output slew rate 0.9 V/ms')

    # PoE powered-device supply (isolated module). The jack contains the bridge rectifiers.
    d.group('PoE input (LAN version)')
    d.FB('POE_VP', 'POE_VPF', big=True, variant='lan')
    d.FB('POE_VN', 'POE_VNF', big=True, variant='lan')
    d.add('D', 'SMAJ58A', 'Diode:SMAJ58A', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'POE_VPF', '2': 'POE_VNF'},
          ref='D103', lcsc='C19077554', mpn='SMAJ58A', variant='lan', desc='TVS, PoE input')
    d.add('U', 'DP9900M-5V', 'attractap:DP9900M-5V', 'attractap:PWRM-SMD_DP9900M-5V', {
        '5': 'POE_VPF', '6': 'POE_VPF', '7': 'POE_VNF', '8': 'POE_VNF',
        '1': '+5V_POE', '2': '+5V_POE', '3': 'GND',
    }, nc=('4',), lcsc='C5380106', mpn='DP9900M-5V', variant='lan',
        desc='Isolated 802.3af PD module 5 V 9 W (pin compatible: Silvertel Ag9905M)')
    d.C('1n', 'POE_VNF', 'GND', size='2211', variant='lan', desc='Y2 safety capacitor across the isolation barrier')
    d.add('C', '100u/16V', 'Device:C_Polarized', 'Capacitor_SMD:CP_Elec_6.3x5.4', {'1': '+5V_POE', '2': 'GND'},
          lcsc='C7469977', mpn='FVH016ADA101M0654', variant='lan', desc='PoE module output capacitor')
    d.C('10u/25V', '+5V_POE', size='0805', variant='lan')
    ideal_diode(d, '+5V_POE', 'POE', 'U106', 'Q101', 'C119', variant='lan')

    # 5 V system rail and 3.3 V buck
    d.group('5 V rail and 3.3 V buck converter')
    d.C('22u', '+5V', size='0805')
    d.C('10u/25V', '+5V', size='0805')
    d.C('100n', '+5V')
    d.add('U', 'TLV62569DBVR', 'attractap:TLV62569DBVR', 'attractap:SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR', {
        '4': '+5V', '1': 'BUCK_EN', '2': 'GND', '3': 'BUCK_SW', '5': 'BUCK_FB',
    }, lcsc='C141836', mpn='TLV62569DBVR', desc='3.3 V 2 A buck from the 5 V rail (second source SGM61020)')
    d.R('100k', '+5V', 'BUCK_EN', ref='R106')
    d.C('12p', '+3V3', 'BUCK_FB', desc='feed-forward, zero at 133 kHz (TI: optional, 117 kHz in its example)')
    d.add('L', '2.2uH 4.3A', 'Device:L', 'attractap:IND-SMD_L4.0-W4.0', {'1': 'BUCK_SW', '2': '+3V3'},
          lcsc=BUCK_L[0], mpn=BUCK_L[1])
    # Output capacitor: TI's recommended 10 uF with 2.2 uH (SLVSDG1C table 4). The rail's other capacitors
    # (P4, PHY, sensors) count too: about 44 uF effective at 3.3 V in all, inside the 22 to 52.8 uF that TI
    # has proven stable (2 x 22 uF nominal, +20 / -50 %). The second 22 uF that was here (C110) would have
    # put the rail at 76 uF. The Wi-Fi module has a converter of its own (U302). docs/design-notes.md, "Power".
    d.C('10u', '+3V3', size='0603', desc='3.3 V converter output')
    d.ref('C')                      # C110, the second 22 uF, is gone; the numbers after it stay
    d.C('100n', '+3V3')
    d.R('100k', '+3V3', 'BUCK_FB', ref='R111', show=True)
    d.R('22.1k', 'BUCK_FB', 'GND', ref='R112', show=True, desc='3.315 V')

    # DC input for 12 V / 24 V supplies with its own 5 V converter. Two connectors in parallel:
    # a barrel jack for a plug-in supply and a spring terminal for bare wires. The terminal footprint
    # takes two WAGO parts: 250-202 (push-button, fitted) or 2601-3102 (lever, C20252913, 13 times the price).
    d.group('DC input (12 to 24 V)')
    d.add('J', 'DC jack 5.5/2.1', 'Connector:Barrel_Jack_Switch', 'attractap:DC-IN-TH_PJ-002A',
          {'1': 'VDC_IN', '2': 'GND', '3': 'GND'}, lcsc='C3096082', mpn='PJ-002A',
          desc='DC jack 5.5 x 2.1 mm, centre pin positive, rated 24 V')
    d.add('J', 'DC terminal', 'Connector:Screw_Terminal_01x02', 'attractap:CONN-TH_4P-P3.5-2601-3102',
          {'1': 'VDC_IN', '2': 'GND'}, lcsc='C2765061', mpn='250-202',
          desc='WAGO push-button terminal for bare wires up to 1.5 mm2, in the two diagonal holes: '
               'left pole = +, right pole = -')
    d.add('F', '1.1A PTC 33V', 'Device:Polyfuse', 'attractap:F1812', {'1': 'VDC_IN', '2': 'VDC_F'},
          lcsc='C21000', mpn='SMD1812P110TF/33', desc='Resettable fuse 1.1 A hold, 33 V')
    # Surges (docs/design-notes.md, "Power"): the bidirectional TVS at the connector clamps both polarities;
    # a negative surge would otherwise drive D105 into breakdown. D105 then sees up to 75 V in reverse, so
    # it is a 100 V part. A reversed supply stays below the TVS's stand-off and D105 blocks it.
    d.add('D', 'SMBJ28CA', 'attractap:SMBJ28CA', 'Diode_SMD:D_SMB', {'1': 'VDC_F', '2': 'GND'},
          ref='D107', lcsc=DC_TVS_IN[0], mpn=DC_TVS_IN[1],
          desc='TVS, DC input at the connector, bidirectional (stand-off 28 V, conducts from 31.1 V)')
    d.add('D', 'SS310', 'Device:D_Schottky', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'VDC_R', '2': 'VDC_F'},
          ref='D105', lcsc=DC_DIODE[0], mpn=DC_DIODE[1], desc='Reverse polarity protection, 100 V')
    # Input filter: without it the converter's 1.1 MHz ripple current runs straight out on the supply
    # cable (conducted emission). C117 - L103 - C112/C113 form a pi filter. The electrolytic C120 damps
    # the cable's inductance with the ceramics when a live supply is plugged in: without it the input
    # rang up to 38 V (24 V) and 40 V (26.4 V) at the converter, whose limit is 40 V for 0.4 s.
    # Ceramics of 2.2 uF / 100 V: they keep their capacitance at 24 V (docs/design-notes.md, "Power").
    d.C(DC_INPUT_CAP, 'VDC_R', size='1206', ref='C117',
        desc='DC input filter, connector side. 100 V X7R: keeps 1.5 uF at 24 V')
    d.add('C', '47u/50V', 'Device:C_Polarized', 'Capacitor_SMD:CP_Elec_6.3x7.7', {'1': 'VDC_R', '2': 'GND'},
          ref='C120', lcsc=DC_BULK[0], mpn=DC_BULK[1], desc='damps the input when a live supply is plugged in')
    d.add('L', '2.2uH 2.3A', 'Device:L', 'attractap:IND-SMD_L2.5-W2.0_CKCSA252012', {'1': 'VDC_R', '2': 'VDC'},
          ref='L103', lcsc='C354540', mpn='CKCSA252012-2.2uH/M', desc='DC input filter')
    # Stand-off 28 V: above the highest input it takes continuously (24 V + 10 % = 26.4 V, up to 28 V);
    # it conducts from 31.1 V. Surges and ESD only: plugging in a live supply is damped by C120.
    d.add('D', 'SMBJ28A', 'attractap:SMBJ28A', 'Diode_SMD:D_SMB', {'1': 'VDC', '2': 'GND'},
          ref='D106', lcsc=DC_TVS[0], mpn=DC_TVS[1],
          desc='TVS, DC input (stand-off 28 V, conducts from 31.1 V; U104 stands 40 V for 0.4 s)')
    for _ in range(2):
        d.C(DC_INPUT_CAP, 'VDC', size='1206',
            desc='converter input. 100 V X7R: keeps 1.5 uF at 24 V')
    d.add('U', 'AP63205WU-7', 'attractap:AP63205WU-7', 'attractap:TSOT-26_L2.9-W1.6-P0.95-LS2.8-BL', {
        '3': 'VDC', '2': 'DC_EN', '4': 'GND', '5': 'DC_SW', '6': 'DC_BST', '1': '+5V_DC',
    }, lcsc='C2071056', mpn='AP63205WU-7', desc='5 V 2 A buck for the DC input')
    # EN divider: the converter starts between 8.5 and 9.4 V and stops between 7.4 and 8.4 V (1 % parts,
    # the datasheet's thresholds and pull-up currents); EN stays at 5.3 V with 40 V on VDC (EN stands 35 V).
    d.R('100k', 'VDC', 'DC_EN', ref='R103', show=True)
    d.R('15k', 'DC_EN', 'GND', ref='R113', show=True, desc='starts at 8.5 to 9.4 V')
    d.C('100n', 'DC_BST', 'DC_SW')
    d.add('L', '6.8uH 2.4A', 'Device:L', 'attractap:IND-SMD_L4.0-W4.0', {'1': 'DC_SW', '2': '+5V_DC'},
          lcsc='C5291940', mpn='CKCSA4020-6.8uH/M')
    d.C('22u', '+5V_DC', size='0805')
    d.C('22u', '+5V_DC', size='0805')
    # as R104: the ideal diode leaks a few microamps back; they must not lift this net
    d.R('4.7k', '+5V_DC', 'GND', ref='R105', desc='bleed: keeps the unpowered converter output at 0 V')
    ideal_diode(d, '+5V_DC', 'DC', 'U107', 'Q102', 'C121')


def ideal_diode(d, src, name, ic, fet, cap, **kw):
    """LM74700-Q1 with an N-channel MOSFET from a 5 V source to the +5V rail: about 20 mV forward drop,
    no current back into the source. The charge pump holds the gate 10.8 to 13.9 V above the source."""
    d.add('U', 'LM74700QDBVRQ1', 'attractap:LM74700QDBVRQ1', 'attractap:SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL', {
        '6': src, '4': '+5V', '5': name + '_GATE', '1': name + '_VCAP', '3': src, '2': 'GND',
    }, ref=ic, lcsc='C2941042', mpn='LM74700QDBVRQ1', desc='ideal diode controller, %s input' % name, **kw)
    d.add('Q', 'IRLML0030', 'Transistor_FET:IRLML0030', 'Package_TO_SOT_SMD:SOT-23', {
        '1': name + '_GATE', '2': src, '3': '+5V',
    }, ref=fet, lcsc='C67272', mpn='IRLML0030TRPBF', desc='ideal diode switch, %s input' % name, **kw)
    d.C('100n/50V', src, name + '_VCAP', ref=cap, desc='charge pump, up to 14 V', **kw)


# ESP32-P4 GPIO number -> net. silk.py prints part of this map on the board.
P4_GPIO = {
    0: 'TP_RST', 1: 'I2C0_SCL', 2: 'I2C0_SDA', 3: 'TP_INT',
    4: 'LCD_R5_M', 5: 'LCD_R4_M', 6: 'LCD_R3_M', 7: 'LCD_R2_M', 8: 'LCD_R1_M',
    9: 'LCD_G5_M', 10: 'LCD_G4_M', 11: 'LCD_G3_M', 12: 'LCD_G2_M', 13: 'LCD_G1_M', 14: 'LCD_G0_M',
    15: 'LCD_B5_M', 16: 'LCD_B4_M', 17: 'LCD_B3_M', 18: 'LCD_B2_M', 19: 'LCD_B1_M',
    20: 'LCD_HSYNC_M', 21: 'LCD_VSYNC_M', 22: 'LCD_DE_M', 23: 'LCD_PCLK_M',
    24: 'USB_DN_M', 25: 'USB_DP_M', 26: 'BL_PWM',
    28: 'RMII_CRS_DV', 29: 'RMII_RXD0', 30: 'RMII_RXD1', 31: 'ETH_MDC', 32: 'RMII_REF_CLK',
    33: 'RMII_TX_EN', 34: 'RMII_TXD0', 35: 'RMII_TXD1', 36: 'ETH_MDIO',
    37: 'UART0_TX', 38: 'UART0_RX',
    39: 'SDIO_D0', 40: 'SDIO_D1', 41: 'SDIO_D2', 42: 'SDIO_D3', 43: 'SDIO_CLK_M', 44: 'SDIO_CMD',
    45: 'C5_EN_M', 46: 'BUZZER', 47: 'LED_DATA',
    49: 'NFC_IRQ', 50: 'NFC_RST', 51: 'NFC_SDA', 52: 'NFC_SCL',
}


def mcu(d):
    """MCU: ESP32-P4 core, core DC-DC, flash, clock, reset, straps."""
    d.begin('mcu', 200)
    p4 = {('GPIO%d' % n): net for n, net in P4_GPIO.items()}
    p4.update({
        'VDD_LP': '+3V3', 'VDD_IO_0': '+3V3', 'VDD_IO_4': '+3V3', 'VDD_IO_5': '+3V3', 'VDD_IO_6': '+3V3',
        'VDD_LDO': '+3V3', 'VDD_DCDCC': '+3V3', 'VDD_ANA': '+3V3', 'VDD_BAT': 'VDD_BAT',
        'VDD_USBPHY': 'VDD_USBPHY',
        'VDD_HP_0': 'VDD_HP', 'VDD_HP_1': 'VDD_HP_1', 'VDD_HP_2': 'VDD_HP', 'VDD_HP_3': 'VDD_HP',
        'VDDO_FLASH': 'VDD_FLASH', 'VDD_FLASHIO': 'VDD_FLASH',
        'VDDO_PSRAM': 'VDD_PSRAM', 'VDD_PSRAM_0': 'VDD_PSRAM', 'VDD_PSRAM_1': 'VDD_PSRAM',
        'VDDO_3': 'VDDO_3', 'VDDO_4': 'VDDO_4',
        'FB_DCDC': 'FB_DCDC', 'EN_DCDC': 'EN_DCDC',
        'FLASH_CS': 'FLASH_CS', 'FLASH_Q': 'FLASH_Q', 'FLASH_WP': 'FLASH_WP', 'FLASH_HOLD': 'FLASH_HOLD',
        'FLASH_CK': 'FLASH_CK_M', 'FLASH_D': 'FLASH_D',
        'XTAL_N': 'XTAL_N', 'XTAL_P': 'XTAL_P', 'CHIP_PU': 'CHIP_PU', 'GND': 'GND',
    })
    p4_nc = ('GPIO27', 'GPIO48', 'GPIO53', 'GPIO54', 'DSI_REXT', 'DSI_DATAP1', 'DSI_DATAN1', 'DSI_CLKN', 'DSI_CLKP', 'DSI_DATAP0', 'DSI_DATAN0',
             'VDD_MIPI_DPHY', 'CSI_DATAN0', 'CSI_DATAP0', 'CSI_CLKP', 'CSI_CLKN', 'CSI_DATAN1', 'CSI_DATAP1',
             'CSI_REXT', 'USB_DM', 'USB_DP')
    d.add('U', 'ESP32-P4NRW32X', 'attractap:ESP32-P4NRW32X', 'attractap:QFN-104_L10.0-W10.0-P0.35-TL-EP7.5',
          {'@' + k: v for k, v in p4.items()}, nc=tuple('@' + n for n in p4_nc),
          lcsc='C54540373', mpn='ESP32-P4NRW32X', desc='MCU, chip revision v3.x, 32 MB PSRAM',
          units={1: ('mcu', 'ESP32-P4: GPIO'), 2: ('mcu', 'ESP32-P4: clock, reset, flash, unused interfaces'),
                 3: ('mcu_power', 'ESP32-P4: supply pins')})

    # 3.3 V supply pins
    d.group('3.3 V supply pin decoupling', sheet='mcu_power')
    d.C('10u', '+3V3', size='0603', desc='VDD_LP')
    d.C('100n', '+3V3', desc='VDD_LP')
    d.C('100n', '+3V3', desc='VDD_IO_0')
    d.C('100n', '+3V3', desc='VDD_IO_4')
    d.C('100n', '+3V3', desc='VDD_IO_5')
    d.C('100n', '+3V3', desc='VDD_IO_6')
    d.C('10u', '+3V3', size='0603', desc='VDD_IO bulk')
    d.C('10u', '+3V3', size='0603', desc='VDD_DCDCC')
    d.C('100n', '+3V3', desc='VDD_DCDCC')
    d.C('10u', '+3V3', size='0603', desc='VDD_LDO')
    d.C('100n', '+3V3', desc='VDD_LDO')
    d.C('100n', '+3V3', desc='VDD_ANA')
    d.group('VDD_BAT and USB PHY supply')
    d.R('0R', '+3V3', 'VDD_BAT')
    d.C('10u', 'VDD_BAT', size='0603')
    d.C('100n', 'VDD_BAT')
    d.R('0R', '+3V3', 'VDD_USBPHY')
    d.C('4.7u', 'VDD_USBPHY', size='0603')
    d.C('100n', 'VDD_USBPHY')
    d.C('10n', 'VDD_USBPHY')
    # core rail
    d.group('Core rail decoupling')
    d.C('10u', 'VDD_HP', size='0603', desc='VDD_HP_0')
    d.C('100n', 'VDD_HP', desc='VDD_HP_0')
    d.R('0R', 'VDD_HP', 'VDD_HP_1')
    d.C('100n', 'VDD_HP_1', desc='VDD_HP_1')
    d.C('100n', 'VDD_HP', desc='VDD_HP_2')
    d.C('100n', 'VDD_HP', desc='VDD_HP_3')
    # internal LDO outputs
    d.group('Internal regulator outputs')
    d.C('1u', 'VDD_FLASH', desc='VDDO_FLASH')
    d.C('1u', 'VDD_FLASH', desc='VDD_FLASHIO')
    d.C('100n', 'VDD_FLASH', desc='VDD_FLASHIO')
    d.C('1u', 'VDD_PSRAM', desc='VDDO_PSRAM')
    d.C('1u', 'VDD_PSRAM', desc='VDD_PSRAM_0/1')
    d.C('100n', 'VDD_PSRAM', desc='VDD_PSRAM_0')
    d.C('100n', 'VDD_PSRAM', desc='VDD_PSRAM_1')
    d.C('1u', 'VDDO_3')
    d.C('1u', 'VDDO_4')

    # core DC-DC 1.1 V (Espressif-verified model, voltage trimmed by the chip through FB_DCDC)
    d.group('Core 1.1 V converter')
    d.add('U', 'TLV62569DBVR', 'attractap:TLV62569DBVR', 'attractap:SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR', {
        '4': '+3V3', '1': 'EN_DCDC', '2': 'GND', '3': 'DCDC_SW', '5': 'FB_DCDC',
    }, lcsc='C141836', mpn='TLV62569DBVR', desc='Core buck. Use exactly this part: no output discharge')
    d.C('10u', '+3V3', size='0603', desc='DCDC input')
    d.C('100n', '+3V3', desc='DCDC input')
    d.add('L', '2.2uH 2.3A', 'Device:L', 'attractap:IND-SMD_L2.5-W2.0_CKCSA252012', {'1': 'DCDC_SW', '2': 'VDD_HP'},
          lcsc='C354540', mpn='CKCSA252012-2.2uH/M')
    d.C('22u', 'VDD_HP', size='0805')
    d.C('22u', 'VDD_HP', size='0805')
    # 499 k twice and 22 pF: Espressif's checklist says they "must be populated" for chip revision v3.x
    d.R('499k', 'VDD_HP', 'FB_DCDC', show=True)
    d.C('22p', 'VDD_HP', 'FB_DCDC')
    d.R('499k', 'FB_DCDC', 'GND', show=True)
    d.R('100k', 'EN_DCDC', 'GND', desc='keeps the converter off while the chip is in reset')

    # flash
    d.group('Flash', sheet='mcu')
    d.add('U', 'W25Q128JVSIQ', 'attractap:W25Q128JVSIQTR', 'attractap:SOIC-8_L5.3-W5.3-P1.27-LS8.0-BL', {
        '1': 'FLASH_CS', '2': 'FLASH_Q', '3': 'FLASH_WP', '4': 'GND', '5': 'FLASH_D', '6': 'FLASH_CK',
        '7': 'FLASH_HOLD', '8': 'VDD_FLASH',
    }, lcsc='C97521', mpn='W25Q128JVSIQ', desc='16 MB QSPI flash')
    d.C('100n', 'VDD_FLASH', desc='flash VCC')
    d.R('10k', 'VDD_FLASH', 'FLASH_CS')
    d.R('0R', 'FLASH_CK_M', 'FLASH_CK', desc='EMC tuning')

    # 40 MHz crystal, 2.0 x 1.6 mm, straight on the pins (Espressif: 40 MHz, +-10 ppm; load capacitors from
    # CL = C1 C2 / (C1 + C2) + Cstray: 2 x (9 pF - 3 pF) = 12 pF). R209 and R210, the 0 ohm links that sat
    # between the pins and the crystal, are gone; their designators stay unused.
    d.group('40 MHz crystal')
    d.add('Y', '40MHz 9pF 10ppm', 'Device:Crystal_GND24', 'Crystal:Crystal_SMD_2016-4Pin_2.0x1.6mm', {
        '1': 'XTAL_P', '3': 'XTAL_N', '2': 'GND', '4': 'GND',
    }, lcsc='C2689435', mpn='E1SB40E00001AE')
    d.ref('R'), d.ref('R')
    d.C('12p', 'XTAL_P')
    d.C('12p', 'XTAL_N')

    # reset, boot, straps
    d.group('Reset, boot and straps')
    d.R('10k', '+3V3', 'CHIP_PU')
    d.C('1u', 'CHIP_PU')
    # Supervisor: holds CHIP_PU low while +3V3 is below 2.93 V and 200 ms after it rose, so the chip
    # also resets cleanly when the rail sags while the board changes supplies (Espressif asks for a
    # supervisor or an RC; the RC stays for the button).
    d.add('U', 'TLV803SDBZR', 'attractap:TLV803SDBZR', 'Package_TO_SOT_SMD:SOT-23',
          {'1': 'GND', '2': 'CHIP_PU', '3': '+3V3'}, ref='U204', lcsc='C132016', mpn='TLV803SDBZR',
          desc='supervisor on CHIP_PU, 2.93 V')
    d.C('100n', '+3V3', ref='C241', desc='supervisor supply (the datasheet asks for 0.1 uF)')
    d.add('SW', 'RESET', 'Switch:SW_Push_Dual', 'attractap:SW-SMD_4P-L5.1-W5.1-P3.70-LS6.5-TL_H1.5',
          {'1': 'CHIP_PU', '4': 'GND'}, nc=('2', '3'), lcsc='C318884', mpn='TS-1187A-B-A-B')
    d.add('SW', 'BOOT', 'Switch:SW_Push_Dual', 'attractap:SW-SMD_4P-L5.1-W5.1-P3.70-LS6.5-TL_H1.5',
          {'1': 'BOOT', '4': 'GND'}, nc=('2', '3'), lcsc='C318884', mpn='TS-1187A-B-A-B')
    d.R('10k', '+3V3', 'RMII_TXD1', desc='GPIO35 boot strap: high = boot from flash')
    # GPIO35 is also an RMII transmit line. The button and its test point are far away, so they hang
    # behind this resistor, which sits at the line: no long open branch on a 50 MHz signal. Pressed,
    # the pin sees 3.3 V x 1k / 11k = 0.3 V.
    d.R('1k', 'RMII_TXD1', 'BOOT', ref='R217', desc='decouples the BOOT button branch from RMII_TXD1')
    d.R('10k', '+3V3', 'RMII_TXD0', desc='GPIO34 strap')
    d.R('1.5k', '+3V3', 'ETH_MDIO', desc='MDIO pull-up, also the GPIO36 strap. Fit on every variant')

    # USB series resistors (USB Serial/JTAG on GPIO24/25)
    d.group('USB Serial/JTAG')
    d.R('22R', 'USB_DN', 'USB_DN_M')
    d.R('22R', 'USB_DP', 'USB_DP_M')


def wifi(d):
    """Wi-Fi / Bluetooth co-processor: ESP32-C5-MINI-1 (esp-hosted over SDIO) with a 3.3 V converter of its own."""
    d.begin('wifi', 300)
    # Pins from the datasheet (v1.4, table 3-1); SDIO on the C5's fixed pins (esp-hosted-mcu 3.1.0,
    # getting started, co-processor connections): CLK IO9, CMD IO10, D0 IO8, D1 IO7, D2 IO14, D3 IO13.
    c5 = {
        '3V3': '+3V3_WIFI', 'GND': 'GND', 'EN': 'C5_EN',
        'IO9': 'SDIO_CLK', 'IO10': 'SDIO_CMD', 'IO8': 'SDIO_D0', 'IO7': 'SDIO_D1', 'IO14': 'SDIO_D2',
        'IO13': 'SDIO_D3', 'IO28': 'C5_IO28', 'TX0': 'C5_TXD0', 'RX0': 'C5_RXD0',
    }
    # Strapping pins left open (datasheet chapter 4): IO27 has its pull-up inside (boot from flash, ROM
    # messages on); IO26 counts only with IO27 and IO28 low; IO25 and IO3 (MTDI) choose the SDIO edges at
    # reset, which the slave driver sets again in its configuration; IO2 (MTMS) floats by default.
    c5_nc = ('NC', 'IO0', 'IO1', 'IO2', 'IO3', 'IO4', 'IO5', 'IO6', 'IO15', 'IO23', 'IO24', 'IO25', 'IO26', 'IO27')
    d.group('ESP32-C5 module')
    # Dual-band Wi-Fi 6 with its own PCB antenna, which stands over the cut in the board's top edge. EU-type
    # examination certificate 44024-05-2026-260268 (Eurofins, notified body 0980) for the module with this
    # antenna; FCC ID 2AC7Z-ESPC5MINI1. Rated for 85 C of air around it: see the heat estimate in
    # docs/design-notes.md. The -N4: 4 MB flash holds esp-hosted's two update images; no PSRAM needed.
    d.add('U', 'ESP32-C5-MINI-1-N4-V1.2', 'attractap:ESP32-C5-MINI-1-N4-V1.2', 'attractap:CONN-SMD_ESP32-C5-MINI-1-N4',
          {'@' + k: v for k, v in c5.items()}, nc=tuple('@' + n for n in c5_nc),
          lcsc='C54951860', mpn='ESP32-C5-MINI-1-N4-V1.2',
          desc='Wi-Fi 6 (2.4 and 5 GHz) / BLE 5 / 802.15.4 module with PCB antenna, 4 MB flash')
    # Espressif's typical circuit: 22 uF and 100 nF at the 3V3 pin (datasheet figure 9-1). The module
    # carries 33.4 uF of its own on that pin (figure 8-1), all on this rail: 47.2 uF with the 22 uF at its
    # 13.7 uF at 3.3 V, inside the 52.8 uF that TI has proven for the TLV62569 (see U103).
    d.C('22u', '+3V3_WIFI', size='0805', desc='Wi-Fi module supply, 3.3 V converter output')
    d.C('100n', '+3V3_WIFI')
    d.group('Enable and boot')
    # Reset: R301 and C303 hold EN low until the module's rail is up (Espressif: 10 k, 1 uF); the P4 resets
    # the module through R302 (esp-hosted, GPIO45).
    d.R('10k', '+3V3_WIFI', 'C5_EN')
    d.C('1u', 'C5_EN')
    d.R('1k', 'C5_EN_M', 'C5_EN', desc='host reset of the co-processor')
    # IO28 high at reset boots from flash; held low at reset (test point C5_BOOT) it gives download mode
    # over UART0. HDG 1.3.9: "place a pull-up resistor at the GPIO28 pin"; no capacitor fitted.
    d.R('10k', '+3V3_WIFI', 'C5_IO28', desc='boot from flash; held low at reset: download over UART0')
    d.group('SDIO')
    d.R('22R', 'SDIO_CLK_M', 'SDIO_CLK', desc='source termination')
    # 51 k pull-ups on CMD and D0 to D3 (esp-hosted), to the module's rail. The one on D1 (IO7) also gives
    # the JTAG-source strap its level; that strap counts only once the eFuse JTAG_SEL_ENABLE is burnt.
    for n in ('SDIO_CMD', 'SDIO_D0', 'SDIO_D1', 'SDIO_D2', 'SDIO_D3'):
        d.R('51k', '+3V3_WIFI', n)
    # The radio's own 3.3 V converter: the module asks for 0.6 A (HDG 1.3.2) and brings 33.4 uF, which
    # the shared 3.3 V rail has no room for. The same circuit as U103: TLV62569 with 2.2 uH, 100 k / 22.1 k
    # (3.315 V) and 12 pF across the upper resistor. Always on, like U103: EN from the 5 V rail, no switch
    # (a module whose supply an IO expander switched did not start, esp-hosted issue 127).
    d.group('Wi-Fi module supply')
    d.add('U', 'TLV62569DBVR', 'attractap:TLV62569DBVR', 'attractap:SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR', {
        '4': '+5V', '1': 'WIFI_BUCK_EN', '2': 'GND', '3': 'WIFI_BUCK_SW', '5': 'WIFI_BUCK_FB',
    }, lcsc='C141836', mpn='TLV62569DBVR', desc='3.3 V 2 A buck for the Wi-Fi module, from the 5 V rail')
    d.C('10u/25V', '+5V', size='0805', desc='Wi-Fi converter input')
    d.C('100n', '+5V')
    d.R('100k', '+5V', 'WIFI_BUCK_EN')
    d.add('L', '2.2uH 4.3A', 'Device:L', 'attractap:IND-SMD_L4.0-W4.0', {'1': 'WIFI_BUCK_SW', '2': '+3V3_WIFI'},
          lcsc=BUCK_L[0], mpn=BUCK_L[1])
    d.C('12p', '+3V3_WIFI', 'WIFI_BUCK_FB', desc='feed-forward, zero at 133 kHz (as at U103)')
    d.R('100k', '+3V3_WIFI', 'WIFI_BUCK_FB', show=True)
    d.R('22.1k', 'WIFI_BUCK_FB', 'GND', show=True, desc='3.315 V')
