"""Circuit description, part 1: power input, the ESP32-P4 with its supplies, and the Wi-Fi module.

Each function adds the parts of one schematic sheet to the design (see design.py)."""


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
    d.add('D', 'SMAJ5.0A', 'Device:D_Zener', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'VBUS_F', '2': 'GND'},
          lcsc='C83329', mpn='SMAJ5.0A', desc='TVS, USB supply')
    d.add('U', 'USBLC6-2SC6', 'attractap:USBLC6-2SC6', 'attractap:SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL', {
        '1': 'USB_DN', '6': 'USB_DN', '3': 'USB_DP', '4': 'USB_DP', '2': 'GND', '5': 'VBUS_F',
    }, lcsc='C7519', mpn='USBLC6-2SC6', desc='USB ESD protection')
    d.FB('VBUS_F', '+5V_USB', big=True)
    d.C('10u/25V', '+5V_USB', size='0805')
    d.add('D', 'SS34', 'Device:D_Schottky', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': '+5V', '2': '+5V_USB'},
          lcsc='C8678', mpn='SS34', desc='Supply OR-ing, USB')

    # PoE powered-device supply (isolated module). The jack contains the bridge rectifiers.
    d.group('PoE input (LAN version)')
    d.FB('POE_VP', 'POE_VPF', big=True, variant='lan')
    d.FB('POE_VN', 'POE_VNF', big=True, variant='lan')
    d.add('D', 'SMAJ58A', 'Device:D_Zener', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'POE_VPF', '2': 'POE_VNF'},
          lcsc='C151246', mpn='SMAJ58A', variant='lan', desc='TVS, PoE input')
    d.add('U', 'DP9900M-5V', 'attractap:DP9900M-5V', 'attractap:PWRM-SMD_DP9900M-5V', {
        '5': 'POE_VPF', '6': 'POE_VPF', '7': 'POE_VNF', '8': 'POE_VNF',
        '1': '+5V_POE', '2': '+5V_POE', '3': 'GND',
    }, nc=('4',), lcsc='C5380106', mpn='DP9900M-5V', variant='lan',
        desc='Isolated 802.3af PD module 5 V 9 W (pin compatible: Silvertel Ag9905M)')
    d.C('1n/2kV', 'POE_VNF', 'GND', size='1206', variant='lan', desc='EMC capacitor across the isolation barrier')
    d.add('C', '100u/16V', 'Device:C_Polarized', 'Capacitor_SMD:CP_Elec_6.3x5.4', {'1': '+5V_POE', '2': 'GND'},
          lcsc='C7469977', mpn='FVH016ADA101M0654', variant='lan', desc='PoE module output capacitor')
    d.C('10u/25V', '+5V_POE', size='0805', variant='lan')
    d.add('D', 'SS34', 'Device:D_Schottky', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': '+5V', '2': '+5V_POE'},
          lcsc='C8678', mpn='SS34', variant='lan', desc='Supply OR-ing, PoE')

    # 5 V system rail and 3.3 V buck
    d.group('5 V rail and 3.3 V buck converter')
    d.C('22u', '+5V', size='0805')
    d.C('10u/25V', '+5V', size='0805')
    d.C('100n', '+5V')
    d.add('U', 'AP63203WU-7', 'attractap:AP63203WU-7', 'attractap:TSOT-26_L2.9-W1.6-P0.95-LS2.8-BL', {
        '3': '+5V', '2': 'BUCK_EN', '4': 'GND', '5': 'BUCK_SW', '6': 'BUCK_BST', '1': '+3V3',
    }, lcsc='C780769', mpn='AP63203WU-7', desc='3.3 V 2 A buck, spread spectrum')
    d.R('100k', '+5V', 'BUCK_EN', ref='R106')
    d.C('100n', 'BUCK_BST', 'BUCK_SW')
    d.add('L', '4.7uH 4A', 'Device:L', 'attractap:IND-SMD_L4.0-W4.0', {'1': 'BUCK_SW', '2': '+3V3'},
          lcsc='C354583', mpn='CKCSA4020-4.7uH/M')
    d.C('22u', '+3V3', size='0805')
    d.C('22u', '+3V3', size='0805')
    d.C('100n', '+3V3')

    # DC input for 12 V / 24 V supplies with its own 5 V converter. Two connectors in parallel:
    # a barrel jack for a plug-in supply and a lever terminal for bare wires.
    d.group('DC input (12 to 24 V)')
    d.add('J', 'DC jack 5.5/2.1', 'attractap:PJ-002A', 'attractap:DC-IN-TH_PJ-002A',
          {'1': 'VDC_IN', '2': 'GND', '3': 'GND'}, lcsc='C3096082', mpn='PJ-002A',
          desc='DC jack 5.5 x 2.1 mm, centre pin positive, rated 24 V')
    d.add('J', 'DC lever terminal', 'attractap:2601-3102', 'attractap:CONN-TH_4P-P3.5-2601-3102',
          {'1': 'VDC_IN', '2': 'GND'}, lcsc='C20252913', mpn='2601-3102',
          desc='WAGO lever terminal for bare wires up to 1.5 mm2: pole 1 = +, pole 2 = -')
    d.add('F', '1.1A PTC 33V', 'Device:Polyfuse', 'attractap:F1812', {'1': 'VDC_IN', '2': 'VDC_F'},
          lcsc='C21000', mpn='SMD1812P110TF/33', desc='Resettable fuse 1.1 A hold, 33 V')
    d.add('D', 'SS34', 'Device:D_Schottky', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'VDC', '2': 'VDC_F'},
          lcsc='C8678', mpn='SS34', desc='Reverse polarity protection')
    d.add('D', 'SMAJ28A', 'Device:D_Zener', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': 'VDC', '2': 'GND'},
          lcsc='C19077545', mpn='SMAJ28A', desc='TVS, DC input (breaks down below the 35 V limit of U104)')
    d.C('10u/50V', 'VDC', size='1206')
    d.C('10u/50V', 'VDC', size='1206')
    d.add('U', 'AP63205WU-7', 'attractap:AP63203WU-7', 'attractap:TSOT-26_L2.9-W1.6-P0.95-LS2.8-BL', {
        '3': 'VDC', '2': 'DC_EN', '4': 'GND', '5': 'DC_SW', '6': 'DC_BST', '1': '+5V_DC',
    }, lcsc='C2071056', mpn='AP63205WU-7', desc='5 V 2 A buck for the DC input (same family as U103)')
    d.R('100k', 'VDC', 'DC_EN')
    d.C('100n', 'DC_BST', 'DC_SW')
    d.add('L', '6.8uH 2.4A', 'Device:L', 'attractap:IND-SMD_L4.0-W4.0', {'1': 'DC_SW', '2': '+5V_DC'},
          lcsc='C5291940', mpn='CKCSA4020-6.8uH/M')
    d.C('22u', '+5V_DC', size='0805')
    d.C('22u', '+5V_DC', size='0805')
    d.add('D', 'SS34', 'Device:D_Schottky', 'attractap:SMA_L4.3-W2.6-LS5.2-RD', {'1': '+5V', '2': '+5V_DC'},
          lcsc='C8678', mpn='SS34', desc='Supply OR-ing, DC input')


def mcu(d):
    """MCU: ESP32-P4 core, core DC-DC, flash, clock, reset, straps."""
    d.begin('mcu', 200)
    g = {  # GPIO number -> net
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
        45: 'C6_EN_M', 46: 'BUZZER', 47: 'LED_DATA',
        49: 'NFC_IRQ', 50: 'NFC_RST', 51: 'NFC_SDA', 52: 'NFC_SCL',
    }
    p4 = {('GPIO%d' % n): net for n, net in g.items()}
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
    d.add('L', '2.2uH 2.6A', 'Device:L', 'attractap:IND-SMD_L2.5-W2.0_CKCSA252012', {'1': 'DCDC_SW', '2': 'VDD_HP'},
          lcsc='C354540', mpn='CKCSA252012-2.2uH/M')
    d.C('22u', 'VDD_HP', size='0805')
    d.C('22u', 'VDD_HP', size='0805')
    d.R('499k', 'VDD_HP', 'FB_DCDC')
    d.C('22p', 'VDD_HP', 'FB_DCDC')
    d.R('499k', 'FB_DCDC', 'GND')
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

    # 40 MHz crystal
    d.group('40 MHz crystal')
    d.add('Y', '40MHz 9pF 10ppm', 'Device:Crystal_GND24', 'attractap:CRYSTAL-SMD_4P-L3.2-W2.5-BL-2', {
        '1': 'XTAL_P_X', '3': 'XTAL_N_X', '2': 'GND', '4': 'GND',
    }, lcsc='C255943', mpn='X1E000021017700')
    d.R('0R', 'XTAL_P', 'XTAL_P_X')
    d.R('0R', 'XTAL_N', 'XTAL_N_X')
    d.C('12p', 'XTAL_P_X')
    d.C('12p', 'XTAL_N_X')

    # reset, boot, straps
    d.group('Reset, boot and straps')
    d.R('10k', '+3V3', 'CHIP_PU')
    d.C('1u', 'CHIP_PU')
    d.add('SW', 'RESET', 'attractap:TS-1187A-B-A-B', 'attractap:SW-SMD_4P-L5.1-W5.1-P3.70-LS6.5-TL_H1.5',
          {'1': 'CHIP_PU', '4': 'GND'}, nc=('2', '3'), lcsc='C318884', mpn='TS-1187A-B-A-B')
    d.add('SW', 'BOOT', 'attractap:TS-1187A-B-A-B', 'attractap:SW-SMD_4P-L5.1-W5.1-P3.70-LS6.5-TL_H1.5',
          {'1': 'RMII_TXD1', '4': 'GND'}, nc=('2', '3'), lcsc='C318884', mpn='TS-1187A-B-A-B')
    d.R('10k', '+3V3', 'RMII_TXD1', desc='GPIO35 boot strap: high = boot from flash')
    d.R('10k', '+3V3', 'RMII_TXD0', desc='GPIO34 strap')
    d.R('1.5k', '+3V3', 'ETH_MDIO', desc='MDIO pull-up, also the GPIO36 strap. Fit on every variant')

    # USB series resistors (USB Serial/JTAG on GPIO24/25)
    d.group('USB Serial/JTAG')
    d.R('22R', 'USB_DN', 'USB_DN_M')
    d.R('22R', 'USB_DP', 'USB_DP_M')


def wifi(d):
    """Wi-Fi / Bluetooth co-processor: ESP32-C6-MINI-1 (esp-hosted over SDIO)."""
    d.begin('wifi', 300)
    c6 = {
        '3V3': '+3V3', 'GND': 'GND', 'EN': 'C6_EN',
        'IO18': 'SDIO_CMD', 'IO19': 'SDIO_CLK', 'IO20': 'SDIO_D0', 'IO21': 'SDIO_D1', 'IO22': 'SDIO_D2',
        'IO23': 'SDIO_D3', 'IO8': 'C6_IO8', 'IO9': 'C6_IO9', 'TXD0': 'C6_TXD0', 'RXD0': 'C6_RXD0',
    }
    c6_nc = ('NC', 'IO2', 'IO3', 'IO4', 'IO5', 'IO0', 'IO1', 'IO6', 'IO7', 'IO12', 'IO13', 'IO14', 'IO15')
    d.group('ESP32-C6 module')
    d.add('U', 'ESP32-C6-MINI-1-N4', 'attractap:ESP32-C6-MINI-1-N4',
          'attractap:WIFIM-SMD_61P-L16.6-W13.2-P0.80-ESP32-C6-MINI-1-N4',
          {'@' + k: v for k, v in c6.items()}, nc=tuple('@' + n for n in c6_nc),
          lcsc='C5736265', mpn='ESP32-C6-MINI-1-N4',
          desc='Wi-Fi 6 / BLE module with PCB antenna. For an external antenna fit the MINI-1U instead (same pads)',
          extra={'Alt_MPN': 'ESP32-C6-MINI-1U-H4', 'Alt_LCSC': 'C20627095'})
    d.C('22u', '+3V3', size='0805')
    d.C('100n', '+3V3')
    d.group('Enable and boot')
    d.R('10k', '+3V3', 'C6_EN')
    d.C('1u', 'C6_EN')
    d.R('1k', 'C6_EN_M', 'C6_EN', desc='host reset of the co-processor')
    d.R('10k', '+3V3', 'C6_IO8')
    d.group('SDIO')
    d.R('22R', 'SDIO_CLK_M', 'SDIO_CLK', desc='source termination')
    for n in ('SDIO_CMD', 'SDIO_D0', 'SDIO_D1', 'SDIO_D2', 'SDIO_D3'):
        d.R('51k', '+3V3', n)
