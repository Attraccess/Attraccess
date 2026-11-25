"""Circuit description, part 2: Ethernet, NFC, display, user feedback, and the mechanical parts.

Each function adds the parts of one schematic sheet to the design (see design.py)."""


def eth(d):
    """Ethernet: IP101GRI RMII PHY + RJ45 with magnetics and PoE bridges."""
    d.begin('eth', 400)
    V = dict(variant='lan')
    d.group('Ethernet PHY')
    d.add('U', 'IP101GRI', 'attractap:IP101GRI', 'attractap:QFN-32_L4.0-W4.0-P0.40-BL-EP2.7', {
        '1': 'PHY_TXER', '2': 'PHY_X1', '3': 'PHY_X2', '4': 'PHY_COL', '5': 'RMII_TX_EN',
        '8': 'RMII_TXD1', '9': 'RMII_TXD0', '10': 'PHY_CLK50', '11': 'PHY_LED0', '12': 'PHY_LED3',
        '13': 'PHY_3V3', '14': 'PHY_CLK50', '17': 'PHY_RXD1', '18': 'PHY_RXD0', '19': 'PHY_CRS_DV',
        '20': 'PHY_LEDMOD', '22': 'ETH_MDC', '23': 'ETH_MDIO', '25': 'PHY_ISET',
        '26': 'MDI_RN', '27': 'MDI_RP', '28': 'PHY_REG', '29': 'MDI_TN', '30': 'MDI_TP',
        '31': 'PHY_3V3', '32': 'ETH_RST_N', '33': 'GND',
    }, nc=('6', '7', '15', '16', '21', '24'), lcsc='C703537', mpn='IP101GRI', desc='10/100 RMII PHY', **V)
    d.FB('+3V3', 'PHY_3V3', **V)
    d.C('10u', 'PHY_3V3', size='0603', **V)
    d.C('100n', 'PHY_3V3', desc='AVDD33', **V)
    d.C('100n', 'PHY_3V3', desc='VDDIO', **V)
    d.C('10u', 'PHY_REG', size='0603', **V)
    d.C('100n', 'PHY_REG', **V)
    d.R('6.19k', 'PHY_ISET', 'GND', show=True, **V)
    d.group('25 MHz crystal')
    d.add('Y', '25MHz 12pF', 'Device:Crystal_GND24', 'attractap:CRYSTAL-SMD_4P-L3.2-W2.5-BL', {
        '1': 'PHY_X1', '3': 'PHY_X2', '2': 'GND', '4': 'GND',
    }, lcsc='C9006', mpn='X322525MOB4SI', **V)
    d.C('18p', 'PHY_X1', **V)
    d.C('18p', 'PHY_X2', **V)
    d.group('Configuration straps')
    d.R('5.1k', 'PHY_3V3', 'PHY_COL', desc='strap: RMII mode', **V)
    d.R('5.1k', 'PHY_3V3', 'PHY_LEDMOD', desc='strap: LED mode 2', **V)
    d.R('5.1k', 'PHY_3V3', 'PHY_LED0', desc='PHY address bit 0 = 1', **V)
    d.R('5.1k', 'PHY_LED3', 'GND', desc='PHY address bit 3 = 0', **V)
    d.R('5.1k', 'PHY_TXER', 'GND', **V)
    d.group('RMII series resistors')
    d.R('33R', 'PHY_CLK50', 'RMII_REF_CLK', desc='50 MHz reference to the MAC', **V)
    d.R('33R', 'PHY_RXD0', 'RMII_RXD0', **V)
    d.R('33R', 'PHY_RXD1', 'RMII_RXD1', **V)
    d.R('33R', 'PHY_CRS_DV', 'RMII_CRS_DV', **V)
    d.group('RJ45 jack with magnetics')
    d.add('J', 'HY931147C', 'attractap:HY931147C', 'attractap:RJ45-TH_HY931147C', {
        # Polarity from the winding dots in the datasheet and the standard jack contacts
        # (J1 TX+, J2 TX-, J3 RX+, J6 RX-): P1 goes to J3, P2 to J6, P5 to J1, P6 to J2.
        '1': 'MDI_RP', '2': 'MDI_RN', '3': 'ETH_CT_RX', '4': 'ETH_CT_TX', '5': 'MDI_TP', '6': 'MDI_TN',
        '9': 'POE_VP', '10': 'POE_VN',
        '11': '+3V3', '12': 'ETH_LED_Y_K', '13': 'PHY_LED3', '14': 'ETH_LED_G_K',
        'GND1': 'ETH_SHIELD', 'GND2': 'ETH_SHIELD',
    }, nc=('7', '8'), lcsc='C91754', mpn='HY931147C',
        desc='RJ45, 10/100 magnetics, PoE rectifier bridges', **V)
    d.C('100n', 'ETH_CT_RX', **V)
    d.C('100n', 'ETH_CT_TX', **V)
    d.R('1k', 'ETH_LED_Y_K', 'PHY_LED0', desc='yellow: link/activity', **V)
    d.R('1k', 'ETH_LED_G_K', 'GND', desc='green: 100M link', **V)
    d.C('1n', 'ETH_SHIELD', 'GND', size='1808', desc='shield to ground, 3 kV', **V)
    d.R('1M', 'ETH_SHIELD', 'GND', size='1206', **V)


def nfc(d):
    """NFC: PN532 with PCB loop antenna."""
    d.begin('nfc', 500)
    pn = {
        'DVSS': 'GND', 'TVSS1': 'GND', 'TVSS2': 'GND', 'AVSS': 'GND', 'EP': 'GND',
        'TX1': 'NFC_TX1', 'TX2': 'NFC_TX2', 'TVDD': 'NFC_TVDD', 'AVDD': 'NFC_AVDD', 'DVDD': 'NFC_DVDD',
        'VBAT': 'NFC_VBAT', 'PVDD': '+3V3', 'VMID': 'NFC_VMID', 'RX': 'NFC_RX',
        'OSCIN': 'NFC_X1', 'OSCOUT': 'NFC_X2', 'I0': 'NFC_DVDD', 'I1': 'GND', 'TESTEN': 'GND',
        'P70_IRQ': 'NFC_IRQ', 'RSTPD_N': 'NFC_RST', 'NSS/P50_SCL/HSU_RX': 'NFC_SCL', 'MOSI/SDA/HSU_TX': 'NFC_SDA',
    }
    pn_nc = ('LOADMOD', 'AUX1', 'AUX2', 'P35', 'N.C.', 'P30/UART_RX', 'RSTOUT_N', 'MISO/P71', 'SCK/P72',
             'P31/UART_TX', 'P32_INT0', 'P33_INT1', 'P34/SIC_CLK', 'SIGOUT', 'SIGIN', 'SVDD')
    d.group('PN532')
    d.add('U', 'PN5321A3HN/C106', 'attractap:PN5321A3HN', 'attractap:QFN-40_L6.0-W6.0-P0.50-BL-EP',
          {'@' + k: v for k, v in pn.items()}, nc=tuple('@' + n for n in pn_nc),
          lcsc='C53457895', mpn='PN5321A3HN (Tokmas)',
          desc='NFC reader IC (PN532). Tokmas part with the pinout of the NXP original (C28925), half the price')
    d.group('Supplies')
    d.FB('+5V', 'NFC_VBAT')
    d.C('10u', 'NFC_VBAT', size='0603')
    d.C('100n', 'NFC_VBAT')
    d.C('10u', 'NFC_DVDD', size='0603')
    d.C('100n', 'NFC_DVDD')
    d.FB('NFC_DVDD', 'NFC_AVDD')
    d.C('1u', 'NFC_AVDD')
    d.C('100n', 'NFC_AVDD')
    d.FB('NFC_DVDD', 'NFC_TVDD')
    d.C('4.7u', 'NFC_TVDD', size='0603')
    d.C('100n', 'NFC_TVDD')
    d.C('100n', '+3V3', desc='PVDD')
    d.group('27.12 MHz crystal')
    d.add('Y', '27.12MHz 12pF', 'Device:Crystal_GND24', 'attractap:CRYSTAL-SMD_4P-L3.2-W2.5-BL', {
        '1': 'NFC_X1', '3': 'NFC_X2', '2': 'GND', '4': 'GND',
    }, lcsc='C113669', mpn='X32252712MOB4SI')
    d.C('18p', 'NFC_X1')
    d.C('18p', 'NFC_X2')
    d.group('Host interface')
    d.R('2.2k', '+3V3', 'NFC_SCL')
    d.R('2.2k', '+3V3', 'NFC_SDA')
    d.R('10k', 'NFC_RST', 'GND', desc='holds the PN532 in power-down while the MCU is in reset')
    # RF: EMC filter, matching, damping. Starting values, to be tuned on the assembled unit with a VNA.
    # The parallel capacitance (180 pF + 10 pF) is set for the loop as simulated from the board's copper
    # (sim/nfc_loop.py): 1.25 uH on a wall of wood or stone, 1.20 uH on a metal one, with about 2 pF of its
    # own. With 180 pF + 18 pF, calculated for 1.2 uH without that capacitance, the receiver input was
    # above its limit on four boards in ten and the transmitter above 100 mA on one in 25.
    d.group('Transmit path: EMC filter and antenna matching')
    for side in ('1', '2'):
        tx, f, m, a = 'NFC_TX' + side, 'NFC_F' + side, 'NFC_M' + side, 'NFC_ANT' + side
        d.add('L', '560nH', 'Device:L', 'attractap:IND-SMD_L1.6-W0.8-1', {'1': tx, '2': f},
              lcsc='C91630', mpn='LQW18CNR56J00D', desc='EMC filter L0')
        d.C('220p', f, desc='C0 (EMC filter)')
        d.C('39p', f, m, desc='C1 (tune)')
        d.C('180p', m, desc='C2 (tune)')
        d.C('10p', m, desc='C2b (tune)')
        d.R('1.5R', m, a, size='0603', show=True, desc='damping Rq (tune)')
    d.group('Receive path')
    # 3.9 k and 1 k leave 1.2 to 2.4 Vpp at RX for a loop of 1.15 to 1.27 uH. The input takes AVDD + 1 V
    # (4 Vpp); with the 2.7 k of NXP's reference circuit it saw 3.7 Vpp at 1.25 uH.
    d.R('3.9k', 'NFC_F2', 'NFC_RXC', show=True, desc='receive divider R2 (tune)')
    d.C('1n', 'NFC_RXC', 'NFC_RX')
    d.R('1k', 'NFC_RX', 'NFC_VMID', show=True)
    d.C('100n', 'NFC_VMID')
    d.group('Antenna')
    d.add('ANT', 'NFC loop 4T', 'Device:Antenna_Loop', 'attractap:NFC_Antenna_4T',
          {'1': 'NFC_ANT2', '2': 'NFC_ANT1'}, desc='PCB loop antenna, about 1.2 uH')


def display(d):
    """Display: 40-pin panel connector, backlight driver, IO expander."""
    d.begin('display', 600)
    # Panel pin -> net. The connector is mounted so that connector pin k = panel pin (41 - k).
    panel = {
        1: 'BL_A', 2: 'BL_K', 3: 'BL_K', 4: 'GND', 5: '+3V3', 6: 'LCD_RST', 9: 'LCD_SDA', 10: 'LCD_SCK',
        11: 'LCD_CS', 12: 'LCD_PCLK', 13: 'LCD_DE', 14: 'LCD_VSYNC', 15: 'LCD_HSYNC',
        16: 'GND', 17: 'LCD_B1', 18: 'LCD_B2', 19: 'LCD_B3', 20: 'LCD_B4', 21: 'LCD_B5',
        22: 'LCD_G0', 23: 'LCD_G1', 24: 'LCD_G2', 25: 'LCD_G3', 26: 'LCD_G4', 27: 'LCD_G5',
        28: 'GND', 29: 'LCD_R1', 30: 'LCD_R2', 31: 'LCD_R3', 32: 'LCD_R4', 33: 'LCD_R5',
        34: 'GND', 35: 'TP_INT', 36: 'I2C0_SDA', 37: 'I2C0_SCL', 38: 'TP_RST', 39: '+3V3', 40: 'GND',
    }
    fpc = {str(41 - k): v for k, v in panel.items()}
    fpc.update({'41': 'GND', '42': 'GND'})
    d.group('Panel connector')
    d.add('J', 'LCD 40P 0.5mm', 'attractap:FH12-40S-0.5SH', 'attractap:FPC-SMD_FH12-40S-0.5SH-55', fpc,
          nc=(str(41 - 7), str(41 - 8)), lcsc='C202114', mpn='FH12-40S-0.5SH(55)',
          desc='Panel connector, bottom contact. Connector pin k = panel pin 41-k')
    d.C('1u', '+3V3', desc='panel VCI')
    d.C('100n', '+3V3', desc='panel VCI')
    d.C('1u', '+3V3', desc='touch VCI')
    d.C('100n', '+3V3', desc='touch VCI')
    d.R('2.2k', '+3V3', 'I2C0_SCL')
    d.R('2.2k', '+3V3', 'I2C0_SDA')
    # 33 ohm series arrays close to the MCU (edge-rate control for EMC)
    d.group('Series resistors on the RGB bus')
    rn = [
        ('LCD_R5', 'LCD_R4', 'LCD_R3', 'LCD_R2'),
        ('LCD_R1', 'LCD_G5', 'LCD_G4', 'LCD_G3'),
        ('LCD_G2', 'LCD_G1', 'LCD_G0', 'LCD_B5'),
        ('LCD_B4', 'LCD_B3', 'LCD_B2', 'LCD_B1'),
        ('LCD_HSYNC', 'LCD_VSYNC', 'LCD_DE', 'LCD_PCLK'),
    ]
    for grp in rn:
        nets = {}
        # the arrays sit rotated so that pins 4..1 face the MCU from left to right
        for i, n in enumerate(grp):
            nets[str(4 - i)] = n + '_M'
            nets[str(5 + i)] = n
        d.add('RN', '33R x4', 'Device:R_Pack04', 'Resistor_SMD:R_Array_Convex_4x0402', nets,
              lcsc='C25501', mpn='4D02WGJ0330TCE')
    # backlight: 4S2P, 39 mA
    d.group('Backlight driver')
    d.add('U', 'AP3032KTR-G1', 'attractap:AP3032KTR-G1', 'attractap:SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR', {
        '6': '+5V', '1': 'BL_SW', '2': 'GND', '3': 'BL_K', '4': 'BL_PWM', '5': 'BL_A',
    }, lcsc='C264086', mpn='AP3032KTR-G1', desc='Backlight boost, PWM on CTRL at 25-40 kHz')
    d.C('10u/25V', '+5V', size='0805', desc='backlight boost input')
    d.add('L', '10uH', 'Device:L', 'attractap:IND-SMD_L3.0-W3.0_SWPA3010S', {'1': '+5V', '2': 'BL_SW'},
          lcsc='C45403', mpn='SWPA3015S100MT')
    d.add('D', 'B5819W', 'Device:D_Schottky', 'attractap:SOD-123_L2.7-W1.6-LS3.7-RD-1', {'1': 'BL_A', '2': 'BL_SW'},
          lcsc='C8598', mpn='B5819W')
    d.C('1u/50V', 'BL_A', size='0603')
    d.C('1u/50V', 'BL_A', size='0603')
    d.R('5.1R', 'BL_K', 'GND', size='0603', show=True, desc='LED current sense: 0.2 V / 5.1 R = 39 mA')
    d.R('10k', 'BL_PWM', 'GND', desc='backlight off while the MCU is in reset')
    # IO expander for the signals that are only used while the panel is initialised
    d.group('IO expander')
    d.add('U', 'TCA9554PWR', 'attractap:TCA9554PWR', 'attractap:TSSOP-16_L5.0-W4.4-P0.65-LS6.4-TL', {
        '1': 'GND', '2': 'GND', '3': 'GND', '8': 'GND', '16': '+3V3', '14': 'I2C0_SCL', '15': 'I2C0_SDA',
        '4': 'LCD_CS', '5': 'LCD_SCK', '6': 'LCD_SDA', '7': 'LCD_RST', '9': 'ETH_RST_N', '11': 'DOCK_N',
    }, nc=('10', '12', '13'), lcsc='C477924', mpn='TCA9554PWR', desc='IO expander, I2C address 0x20')
    d.C('100n', '+3V3', desc='IO expander')


def ui(d):
    """User feedback (addressable LEDs and buzzer) and tamper detection."""
    d.begin('ui', 700)
    d.group('LED data level shifter')
    # 74LV1T125: same pinout as the 74AHCT1G125, but specified from 1.6 V supply. The 5 V rail sits one
    # diode drop below its source and can be under the 4.5 V an AHCT part asks for.
    d.add('U', '74LV1T125', 'attractap:SN74LV1T125DBVR', 'attractap:SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR', {
        '1': 'GND', '2': 'LED_DATA', '3': 'GND', '4': 'LED_DATA_5V', '5': '+5V',
    }, lcsc='C473338', mpn='SN74LV1T125DBVR', desc='3.3 V to 5 V level shifter for the LED data line')
    d.C('100n', '+5V', desc='level shifter')
    d.R('100R', 'LED_DATA_5V', 'LED_D0')
    d.C('22u', '+5V', size='0805', desc='LED supply')
    d.group('Addressable LEDs')
    n_led = 8                       # two rows of four, see geometry.LED_X
    for i in range(n_led):
        nets = {'1': 'GND', '2': 'LED_D%d' % i, '3': '+5V'}
        if i + 1 < n_led:
            nets['4'] = 'LED_D%d' % (i + 1)
        d.add('D', 'SK6812MINI-E', 'attractap:SK6812MINI-E',
              'attractap:LED_SK6812MINI-E_ReverseMount_Clear', nets, nc=() if i + 1 < n_led else ('4',),
              lcsc='C5149201', mpn='SK6812MINI-E', desc='RGB LED, reverse mount')
        d.C('100n', '+5V', desc='LED %d' % (i + 1))
    d.group('Buzzer')
    # The coil is between pads 1 (+) and 2 (-), which lie side by side opposite the sound port. Pads 3
    # and 4, next to the port, only hold the part down.
    d.add('BZ', 'MLT-8530', 'attractap:MLT-8530', 'attractap:BUZ-SMD_4P-L8.5-W8.5-P8.50-BR', {
        '1': 'BUZ_P', '2': 'BUZ_N',
    }, nc=('3', '4'), lcsc='C94599', mpn='MLT-8530', desc='Electromagnetic buzzer 2.7 kHz, 16 ohm')
    # 0.16 W at a 50 % tone: a 0.25 W part in the 0603 size (an ordinary 0603 is rated 0.1 W)
    d.R('10R', '+5V', 'BUZ_P', size='0603', lcsc='C253327', mfr='ROHM', mpn='ESR03EZPJ100',
        rating='5% 0.25W', show=True, desc='buzzer current limit, 0.25 W type')
    d.add('D', '1N4148W', 'Device:D', 'attractap:SOD-123F_L2.7-W1.6-LS3.8-RD', {'1': 'BUZ_P', '2': 'BUZ_N'},
          lcsc='C81598', mpn='1N4148W', desc='flyback diode')
    d.add('Q', 'AO3400A', 'Transistor_FET:AO3400A', 'Package_TO_SOT_SMD:SOT-23', {
        '1': 'BUZ_G', '2': 'GND', '3': 'BUZ_N',
    }, lcsc='C20917', mpn='AO3400A')
    d.R('100R', 'BUZZER', 'BUZ_G')
    d.R('100k', 'BUZ_G', 'GND')
    # GPIO47 has no pull resistor while the MCU is in reset: without this the level shifter's input
    # floats and the LEDs can light up at random during power-up
    d.R('100k', 'LED_DATA', 'GND', desc='LED data low while the MCU is in reset')
    # Three sensors that tell the firmware when someone handles the reader. (New parts go at the end of
    # the sheet: the reference designators of the parts above must not change.)
    d.group('Tamper detection')
    # Accelerometer: knocks, tilting, the reader being torn off. On the touch bus; SA0 high gives
    # address 0x19. The firmware reads its latched events over I2C; INT1 is on a test point.
    d.add('U', 'LIS2DH12TR', 'attractap:LIS2DH12TR', 'Package_LGA:LGA-12_2x2mm_P0.5mm', {
        '1': 'I2C0_SCL', '2': '+3V3', '3': 'ACC_SA0', '4': 'I2C0_SDA', '5': 'GND', '6': 'GND', '7': 'GND', '8': 'GND',
        '9': '+3V3', '10': '+3V3', '12': 'ACC_INT',
    }, nc=('11',), lcsc='C110926', mpn='LIS2DH12TR', desc='Accelerometer, I2C address 0x19')
    d.C('100n', '+3V3', desc='accelerometer')
    d.C('10u', '+3V3', size='0603', desc='accelerometer')
    # SA0 has a pull-up inside the part that firmware can switch off; this one keeps the address at 0x19
    d.R('10k', '+3V3', 'ACC_SA0', desc='accelerometer address: SA0 high')
    # Hall switch: its output is low while the magnet in the dock is in front of it (more than 4.8 mT),
    # high when the reader is off the dock (less than 0.5 mT). Read through the IO expander.
    d.add('U', 'DRV5032FA', 'attractap:DRV5032FADBZR', 'Package_TO_SOT_SMD:SOT-23',
          {'1': '+3V3', '2': 'DOCK_N', '3': 'GND'},
          lcsc='C140921', mpn='DRV5032FADBZR', desc='Hall switch: output low with the dock magnet present')
    d.C('100n', '+3V3', desc='hall switch')
    # Proximity sensor: sends infrared pulses across the closed cavity and measures what the dock's plate
    # throws back (geometry.PROX). The reading drops to almost nothing when the reader leaves the dock,
    # and nobody can reach into that light path from outside, unlike the hall switch, which a magnet
    # held against the front keeps quiet. It also measures ambient light: the cavity is dark while it
    # is closed. On the touch bus at address 0x60, read over I2C; INT (open drain) is on a test point.
    # Emitter and receiver share the supply; the two cathode pins are joined as the datasheet asks.
    d.add('U', 'VCNL4040M3OE', 'attractap:VCNL4040M3OE', 'attractap:SENSORS-SMD_VCNL4040M3OE', {
        '1': 'GND', '2': 'PROX_K', '3': '+3V3', '4': '+3V3', '5': 'PROX_K', '6': 'PROX_INT',
        '7': 'I2C0_SDA', '8': 'I2C0_SCL',
    }, lcsc='C142526', mpn='VCNL4040M3OE', desc='Proximity and ambient light sensor, I2C address 0x60')
    d.C('100n', '+3V3', desc='proximity sensor')
    # the datasheet asks for 2.2 uF at the emitter's anode; 10 uF is on the parts list already
    d.C('10u', '+3V3', size='0603', desc='proximity sensor: emitter pulses of up to 200 mA')
    d.R('10k', '+3V3', 'PROX_INT', desc='proximity sensor interrupt: open drain')


def mech(d):
    """Test points, mounting, fiducials."""
    d.begin('mech', 800)
    for net, label, sheet in (
        ('+5V', '5V', 'power'), ('+3V3', '3V3', 'power'), ('VDD_HP', 'VDD_HP', 'mcu_power'),
        ('GND', 'GND', 'power'), ('GND', 'GND', 'power'),
        ('CHIP_PU', 'EN', 'mcu'), ('BOOT', 'BOOT', 'mcu'), ('UART0_TX', 'TX0', 'mcu'),
        ('UART0_RX', 'RX0', 'mcu'),
        ('C6_EN', 'C6_EN', 'wifi'), ('C6_IO9', 'C6_BOOT', 'wifi'), ('C6_TXD0', 'C6_TX', 'wifi'),
        ('C6_RXD0', 'C6_RX', 'wifi'),
        ('ACC_INT', 'ACC_INT', 'ui'), ('PROX_INT', 'PROX_INT', 'ui'),
    ):
        d.TP(net, label, sheet=sheet)
    # every supply rail, both I2C buses and the RMII clock (1 mm pads), drawn together on this sheet
    for net, label, _sheet in (
        ('VDC', 'VDC', 'power'), ('+5V_DC', '5V_DC', 'power'), ('+5V_USB', '5V_USB', 'power'),
        ('+5V_POE', '5V_POE', 'power'), ('VDD_FLASH', 'VDD_FLASH', 'mcu_power'),
        ('NFC_TVDD', 'TVDD', 'nfc'), ('NFC_AVDD', 'AVDD', 'nfc'), ('NFC_DVDD', 'DVDD', 'nfc'),
        ('BL_A', 'BL_A', 'display'), ('I2C0_SDA', 'SDA', 'display'), ('I2C0_SCL', 'SCL', 'display'),
        ('NFC_SDA', 'NFC_SDA', 'nfc'), ('NFC_SCL', 'NFC_SCL', 'nfc'), ('RMII_REF_CLK', 'REF_CLK', 'eth'),
        ('PHY_3V3', 'PHY_3V3', 'eth'),
    ):
        d.TP(net, label, sheet='mech', small=True)
    d.group('Mounting holes')
    for i in range(4):
        d.add('H', 'M3', 'Mechanical:MountingHole', 'MountingHole:MountingHole_3.2mm_M3', {})
    d.group('Fiducials')
    for i in range(3):
        d.add('FID', 'Fiducial', 'Mechanical:Fiducial', 'Fiducial:Fiducial_1mm_Mask2mm', {})
