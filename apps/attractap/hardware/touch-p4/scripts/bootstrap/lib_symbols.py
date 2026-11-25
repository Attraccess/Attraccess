"""Symbols of the project library that are drawn here instead of taken unchanged from the LCSC
conversion or KiCad's library: named after the part that is fitted, or redrawn so that the schematic
reads well (see scripts/bootstrap/README.md, "Schematic drawing"). make_lib.py writes them into
kicad/lib/attractap.kicad_sym."""
import os

from sexpr import Sym, dumps, find, first, loads

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.normpath(os.path.join(HERE, '..', '..', 'kicad', 'lib'))
NICK = 'attractap'


# ---- symbols drawn here instead of taken from the converter or KiCad's library unchanged ----------------
# A box symbol: pins as (number, name); None leaves a row free. Inputs on the left, outputs on the right.
def box_symbol(name, ref, footprint, desc, left=(), right=(), top=(), bottom=(), width=15.24, pin_len=5.08,
               datasheet='', jumpers=()):
    """jumpers: groups of pins joined inside the part (KiCad connects them in the netlist)."""
    S = Sym

    def eff(size=1.27, hide=False, justify=None):
        e = [S('effects'), [S('font'), [S('size'), size, size]]]
        if justify:
            e.append([S('justify'), S(justify)])
        if hide:
            e.append([S('hide'), S('yes')])
        return e
    rows = max(len(left), len(right), 1)
    y_top = 2.54 * ((rows + 2) // 2)
    y_bot = y_top - 2.54 * (rows + 1)
    hw = width / 2
    sym = [S('symbol'), name, [S('pin_names'), [S('offset'), 1.016]], [S('exclude_from_sim'), S('no')],
           [S('in_bom'), S('yes')], [S('on_board'), S('yes')]]
    if jumpers:
        sym.append([S('jumper_pin_groups')] + [list(g) for g in jumpers])
    sym += [
           [S('property'), 'Reference', ref, [S('at'), -hw, y_top + 1.27, 0], eff(justify='left')],
           [S('property'), 'Value', name, [S('at'), -hw, y_bot - 1.27, 0], eff(justify='left')],
           [S('property'), 'Footprint', footprint, [S('at'), 0, 0, 0], eff(hide=True)],
           [S('property'), 'Datasheet', datasheet, [S('at'), 0, 0, 0], eff(hide=True)],
           [S('property'), 'Description', desc, [S('at'), 0, 0, 0], eff(hide=True)]]
    body = [S('symbol'), name + '_0_1',
            [S('rectangle'), [S('start'), -hw, y_top], [S('end'), hw, y_bot],
             [S('stroke'), [S('width'), 0.254], [S('type'), S('default')]], [S('fill'), [S('type'), S('background')]]]]
    pins = [S('symbol'), name + '_1_1']

    def pin(num, pname, x, y, ang):
        pins.append([S('pin'), S('passive'), S('line'), [S('at'), round(x, 3), round(y, 3), ang],
                     [S('length'), pin_len], [S('name'), pname, eff()], [S('number'), num, eff(1.0)]])
    for side, plist in (('L', left), ('R', right)):
        for i, p in enumerate(plist):
            if p:
                y = y_top - 2.54 * (i + 1)
                pin(p[0], p[1], -hw - pin_len if side == 'L' else hw + pin_len, y, 0 if side == 'L' else 180)
    for side, plist in (('T', top), ('B', bottom)):
        n = len(plist)
        for j, p in enumerate(plist):
            if p:
                x = 2.54 * (j - n // 2)
                pin(p[0], p[1], x, y_top + pin_len if side == 'T' else y_bot - pin_len, 270 if side == 'T' else 90)
    # a jumpered pair on opposite sides is drawn as a line through the part
    at = {str(p[6][1]): (float(p[3][1]), float(p[3][2])) for p in pins[2:]}
    for group in jumpers:
        a, b = (at.get(n) for n in group[:2])
        if a and b and a[1] == b[1]:
            body.append([S('polyline'), [S('pts'), [S('xy'), -hw + 6.35, a[1]], [S('xy'), hw - 6.35, a[1]]],
                         [S('stroke'), [S('width'), 0], [S('type'), S('default')]], [S('fill'), [S('type'), S('none')]]])
    sym += [body, pins, [S('embedded_fonts'), S('no')]]
    return sym


def renamed(src, name, value_desc, pin_names=None, footprint=None, datasheet=None):
    """A copy of a symbol under the part's own name (the source has the same pins and package)."""
    s = loads(dumps(src))
    old = s[1].split(':')[-1]
    s[1] = name
    for sub in find(s, 'symbol'):
        sub[1] = name + sub[1][len(old):] if sub[1].startswith(old) else sub[1]
    for prop in find(s, 'property'):
        if prop[1] == 'Value':
            prop[2] = name
        elif prop[1] == 'Description':
            prop[2] = value_desc
        elif prop[1] == 'Footprint' and footprint:
            prop[2] = footprint
        elif prop[1] == 'Datasheet' and datasheet is not None:
            prop[2] = datasheet
    if pin_names:
        for sub in find(s, 'symbol'):
            for p in find(sub, 'pin'):
                num = first(p, 'number')[1]
                if num in pin_names:
                    first(p, 'name')[1] = pin_names[num]
    s[:] = [i for i in s if not (isinstance(i, list) and i and i[0] == 'extends')]
    return s


def derived_symbols(lib):
    """Symbols built here: {name: tree}. lib maps the names of the project library to their trees."""
    import libs
    fp = NICK + ':'
    out = {
        # the converter drew every pin on one side, with numbers longer than its pins over the names
        'TYPE-C-31-M-12': box_symbol(
            'TYPE-C-31-M-12', 'J', fp + 'USB-C_SMD-TYPE-C-31-M-12_1', 'USB-C receptacle, USB 2.0, 16 pins',
            right=[('A4B9', 'VBUS'), ('B4A9', 'VBUS'), None, None, ('A6', 'D+'), ('B6', 'D+'), ('A7', 'D-'), ('B7', 'D-'),
                   None, ('A8', 'SBU1'), ('B8', 'SBU2'), None, ('A5', 'CC1'), ('B5', 'CC2'), None, None],
            bottom=[('A1B12', 'GND'), ('B1A12', 'GND'), ('1', 'SH'), ('2', 'SH'), ('3', 'SH'), ('4', 'SH')],
            width=17.78),
        'USBLC6-2SC6': box_symbol(
            'USBLC6-2SC6', 'U', fp + 'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL', 'ESD protection for USB 2.0 data lines and VBUS',
            left=[None, ('3', 'I/O2'), None, ('1', 'I/O1')], right=[None, ('4', 'I/O2'), None, ('6', 'I/O1')],
            top=[('5', '~')], bottom=[('2', '~')], width=17.78, jumpers=[('3', '4'), ('1', '6')],
            datasheet='https://www.st.com/resource/en/datasheet/usblc6-2.pdf'),
        # inputs on the left, outputs on the right (the converter had them the other way round)
        'DP9900M-5V': box_symbol(
            'DP9900M-5V', 'U', fp + 'PWRM-SMD_DP9900M-5V', 'Isolated IEEE 802.3af PD module, 5 V 9 W',
            left=[('5', 'VIN+'), ('6', 'VIN+'), ('7', 'VIN-'), ('8', 'VIN-')],
            right=[('1', '+VDC'), ('2', '+VDC'), ('3', '-VDC'), ('4', 'ADJ')], width=20.32),
        # input on the left, switch node and feedback on the right, ground at the bottom
        'AP63203WU-7': box_symbol(
            'AP63203WU-7', 'U', fp + 'TSOT-26_L2.9-W1.6-P0.95-LS2.8-BL', '3.3 V 2 A synchronous buck, 3.8 to 32 V in',
            left=[('3', 'VIN'), ('2', 'EN')], right=[('6', 'BST'), ('5', 'SW'), ('1', 'FB')], bottom=[('4', 'GND')],
            width=12.7, datasheet='https://www.diodes.com/assets/Datasheets/AP63200-AP63201-AP63203-AP63205.pdf'),
        'AP63205WU-7': box_symbol(
            'AP63205WU-7', 'U', fp + 'TSOT-26_L2.9-W1.6-P0.95-LS2.8-BL', '5 V 2 A synchronous buck, 3.8 to 32 V in',
            left=[('3', 'VIN'), ('2', 'EN')], right=[('6', 'BST'), ('5', 'SW'), ('1', 'FB')], bottom=[('4', 'GND')],
            width=12.7, datasheet='https://www.diodes.com/assets/Datasheets/AP63200-AP63201-AP63203-AP63205.pdf'),
        # the fitted module has an antenna connector (MINI-1U); same pins and land pattern as the MINI-1
        'ESP32-C6-MINI-1U-H4': box_symbol(
            'ESP32-C6-MINI-1U-H4', 'U', fp + 'WIFIM-SMD_61P-L16.6-W13.2-P0.80-ESP32-C6-MINI-1-N4',
            'ESP32-C6 module, Wi-Fi 6 / BLE 5 / 802.15.4, 4 MB flash, antenna connector, -40 to 105 C',
            left=[('3', '3V3'), None, ('8', 'EN'), ('23', 'IO9'), ('22', 'IO8'), None, ('31', 'TXD0'), ('30', 'RXD0'),
                  None] + [(n, 'GND') for n in ['1', '2', '11', '14'] + [str(k) for k in range(36, 54)]],
            right=[('24', 'IO18'), ('25', 'IO19'), ('26', 'IO20'), ('27', 'IO21'), ('28', 'IO22'), ('29', 'IO23'), None]
                  + [(n, 'IO%s' % io) for n, io in (('12', 0), ('13', 1), ('5', 2), ('6', 3), ('9', 4), ('10', 5),
                                                     ('15', 6), ('16', 7), ('17', 12), ('18', 13), ('19', 14), ('20', 15))]
                  + [None] + [(n, 'NC') for n in ('4', '7', '21', '32', '33', '34', '35')],
            width=20.32, datasheet='https://www.espressif.com/sites/default/files/documentation/esp32-c6-mini-1_mini-1u_datasheet_en.pdf'),
        # pin names from the jack's function: winding pairs to the PHY, PoE outputs, LEDs
        'HY931147C': box_symbol(
            'HY931147C', 'J', fp + 'RJ45-TH_HY931147C', 'RJ45 with 10/100 magnetics, PoE rectifier bridges and two LEDs',
            left=[('5', 'TX+'), ('6', 'TX-'), ('4', 'CT_TX'), None, ('1', 'RX+'), ('2', 'RX-'), ('3', 'CT_RX'), None,
                  ('11', 'LED_Y_A'), ('12', 'LED_Y_K'), ('13', 'LED_G_A'), ('14', 'LED_G_K'), None, None],
            right=[('9', 'POE+'), ('10', 'POE-'), None, ('7', 'NC'), ('8', 'NC')],
            bottom=[('GND1', 'SHIELD'), ('GND2', 'SHIELD')], width=20.32),
        'TLV62569DBVR': box_symbol(
            'TLV62569DBVR', 'U', fp + 'SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR', '2 A synchronous buck, 2.5 to 5.5 V in, SOT-23-5',
            left=[('4', 'VIN'), ('1', 'EN')], right=[('3', 'SW'), ('5', 'FB')], bottom=[('2', 'GND')], width=12.7,
            datasheet='https://www.ti.com/lit/ds/symlink/tlv62569.pdf'),
        # data in on the left, out on the right, so a chain of LEDs reads as one line
        'SK6812MINI-E': box_symbol(
            'SK6812MINI-E', 'D', fp + 'LED_SK6812MINI-E_ReverseMount_Clear', 'RGB LED with integrated driver, reverse mount',
            left=[('2', 'DIN')], right=[('4', 'DOUT')], top=[('3', 'VDD')], bottom=[('1', 'GND')], width=10.16),
        'MLT-8530': box_symbol(
            'MLT-8530', 'BZ', fp + 'BUZ-SMD_4P-L8.5-W8.5-P8.50-BR', 'Electromagnetic buzzer 2.7 kHz; pads 3 and 4 hold it only',
            right=[('3', 'NC'), ('4', 'NC')], top=[('1', '+')], bottom=[('2', '-')], width=10.16),
        'AP3032KTR-G1': box_symbol(
            'AP3032KTR-G1', 'U', fp + 'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR', 'White LED boost driver, 1 MHz, OV protection',
            left=[('6', 'VIN'), ('4', 'CTRL')], right=[('1', 'SW'), ('5', 'OV'), ('3', 'FB')], bottom=[('2', 'GND')],
            width=12.7),
        # host and configuration pins on the left, the radio on the right, supplies on top, grounds below
        'PN5321A3HN': box_symbol(
            'PN5321A3HN', 'U', fp + 'QFN-40_L6.0-W6.0-P0.50-BL-EP', 'NFC reader IC (PN532 family), QFN-40 6 x 6 mm',
            left=[('28', 'MOSI/SDA/HSU_TX'), ('27', 'NSS/P50_SCL/HSU_RX'), ('25', 'P70_IRQ'), ('38', 'RSTPD_N'), None,
                  ('16', 'I0'), ('17', 'I1'), ('18', 'TESTEN'), None, ('14', 'OSCIN'), ('15', 'OSCOUT')],
            right=[('4', 'TX1'), ('5', 'TVDD'), ('6', 'TX2'), None, ('10', 'RX'), ('9', 'VMID'), ('8', 'AVDD'), None]
                  + [(n, name) for n, name in (('2', 'LOADMOD'), ('12', 'AUX1'), ('13', 'AUX2'), ('19', 'P35'),
                                               ('24', 'P30/UART_RX'), ('26', 'RSTOUT_N'), ('29', 'MISO/P71'),
                                               ('30', 'SCK/P72'), ('31', 'P31/UART_TX'), ('32', 'P32_INT0'),
                                               ('33', 'P33_INT1'), ('34', 'P34/SIC_CLK'), ('35', 'SIGOUT'),
                                               ('36', 'SIGIN'), ('37', 'SVDD'), ('20', 'N.C.'), ('21', 'N.C.'),
                                               ('22', 'N.C.'))],
            top=[('40', 'VBAT'), None, ('39', 'DVDD'), None, ('23', 'PVDD')],
            bottom=[('1', 'DVSS'), ('3', 'TVSS1'), ('7', 'TVSS2'), ('11', 'AVSS'), ('41', 'EP')], width=33.02,
            datasheet='https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf'),
        'SN74LV1T125DBVR': renamed(lib['SN74AHCT1G125DBVR'], 'SN74LV1T125DBVR',
                                   'Single bus buffer, 3-state, 1.6 to 5.5 V, level shifting inputs'),
        'LIS2DH12TR': renamed(libs.symbol('Sensor_Motion:LIS2DE12'), 'LIS2DH12TR',
                              '3-axis accelerometer, I2C/SPI, LGA-12 2 x 2 mm', footprint='Package_LGA:LGA-12_2x2mm_P0.5mm',
                              datasheet='https://www.st.com/resource/en/datasheet/lis2dh12.pdf'),
        'DRV5032FADBZR': renamed(libs.symbol('Sensor_Magnetic:DRV5033FAxDBZ'), 'DRV5032FADBZR',
                                 'Low-power omnipolar Hall switch, push-pull, SOT-23', pin_names={'1': 'VDD'},
                                 datasheet='https://www.ti.com/lit/ds/symlink/drv5032.pdf'),
        'SMBJ26A': renamed(libs.symbol('Diode:SM6T6V8A'), 'SMBJ26A',
                           '600 W unidirectional TVS diode, 26 V stand-off, SMB (DO-214AA)',
                           pin_names={'1': 'K', '2': 'A'}, footprint='Diode_SMD:D_SMB', datasheet=''),
    }
    return out


def write_derived():
    path = os.path.join(LIB, NICK + '.kicad_sym')
    tree = loads(open(path, encoding='utf-8').read())
    lib = {s[1]: s for s in find(tree, 'symbol')}
    new = derived_symbols(lib)
    keep = [i for i in tree if not (isinstance(i, list) and i and i[0] == 'symbol' and i[1] in new)]
    text = dumps(keep + [new[n] for n in sorted(new)]) + '\n'
    if text != open(path, encoding='utf-8').read():
        open(path, 'w', encoding='utf-8').write(text)
        print('updated', NICK + '.kicad_sym:', ', '.join(sorted(new)))
