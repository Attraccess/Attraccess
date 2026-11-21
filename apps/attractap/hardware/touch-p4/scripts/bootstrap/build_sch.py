"""Generate the hierarchical KiCad schematic from design.py (bootstrap tool for revision A).

Structure produced:
  attractap-touch-p4.kicad_sch          root: block diagram, one sheet symbol per function
  attractap-touch-p4-<block>.kicad_sch  one sheet per function, parts grouped in framed sub-blocks

Nets that stay inside a sheet use local labels, nets that cross sheets use hierarchical
labels and sheet pins, the supply rails GND / +3V3 / +5V use power symbols.

Usage: python3 build_sch.py
"""
import math
import os
import uuid

import design
import libs
from sexpr import Sym, dumps

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', '..', 'kicad'))
NAME = 'attractap-touch-p4'
S = Sym
GRID = 1.27
NS = uuid.UUID('6f1f0d6e-2c55-4d0e-9a3d-41747472ac70')

POWER = {'GND': 'power:GND', '+3V3': 'power:+3V3', '+5V': 'power:+5V'}
PAPER = [('A3', 420.0, 297.0), ('A2', 594.0, 420.0), ('A1', 841.0, 594.0)]
# key, sheet name (no spaces: it becomes part of net names), title, subtitle
SHEETS = [
    ('power', 'Power', 'Power input', 'USB-C, DC and PoE inputs, supply OR-ing, 3.3 V buck converter'),
    ('mcu', 'MCU', 'MCU', 'ESP32-P4 GPIO map, flash, crystal, reset and boot straps, USB'),
    ('mcu_power', 'MCU_Power', 'MCU power', 'ESP32-P4 supply pins, decoupling, 1.1 V core converter'),
    ('wifi', 'WiFi', 'Wi-Fi', 'ESP32-C6-MINI-1 co-processor (esp-hosted over SDIO)'),
    ('eth', 'Ethernet', 'Ethernet', 'IP101GRI RMII PHY, RJ45 with magnetics and PoE rectifiers (LAN version only)'),
    ('nfc', 'NFC', 'NFC', 'PN532 reader, EMC filter, antenna matching, PCB loop antenna'),
    ('display', 'Display', 'Display', '40-pin panel connector, backlight driver, IO expander'),
    ('ui', 'UI', 'LEDs, buzzer, tamper', 'Addressable RGB LEDs, level shifter, buzzer driver, tamper sensors'),
    ('mech', 'Mechanical', 'Mechanical', 'Mounting holes and fiducials'),
]
NOTES = {
    'power': [
        'Supply: USB-C 5 V, DC 12 to 24 V (barrel jack or spring terminal) or PoE (802.3af, isolated module).',
        'All three end on the +5V rail through Schottky diodes, so any combination may be connected.',
        'R104 / R105 take up the leakage of those diodes, so an unpowered input stays at 0 V.',
        'DC input: C117 - L103 - C112/C113 filter the converter ripple off the supply cable; D106 clamps behind L103.',
        'Do not add capacitance across the PoE input (POE_VPF / POE_VNF): it would break PoE detection.',
        'The PoE module needs a minimum load: 100 mA (DP9900M) or 200 mA (Ag9905M).',
    ],
    'mcu': [
        'ESP32-P4NRW32X, chip revision v3.x. Reference: Espressif ESP32-P4 Hardware Design Guidelines.',
        'Boot: hold BOOT (GPIO35 low) while releasing RESET for download mode. GPIO36 needs R214 for that.',
        'MIPI DSI/CSI and the high-speed USB PHY are not used; their pins stay open.',
        'USB Serial/JTAG is on GPIO24 (D-) / GPIO25 (D+).',
    ],
    'mcu_power': [
        'Every supply pin has a via next to its pad down to the 3.3 V plane or the core rail on the back layer.',
        'U202 must be exactly TLV62569DBVR (no output discharge). The chip trims the 1.1 V rail through FB_DCDC.',
    ],
    'wifi': [
        'The C6 runs the esp-hosted co-processor firmware. First flash through the C6 test points',
        '(C6_TX, C6_RX, C6_EN, C6_BOOT), later updates over SDIO from the ESP32-P4.',
        'SDIO uses the P4 SDMMC slot 0 pins: D0-D3 = GPIO39-42, CLK = GPIO43, CMD = GPIO44.',
    ],
    'eth': [
        'All parts on this sheet are fitted on the LAN version only (field Variant = lan).',
        'PHY address 1, RMII, the PHY outputs the 50 MHz reference clock to GPIO32.',
        'Centre taps go to ground through 100 nF (voltage-mode PHY). PoE V+/V- come rectified from the jack.',
        'The jack datasheet does not label the polarity within each pair;',
        'the PHY and the link partner correct a swapped pair automatically.',
        'ETH_RST_N has no reset circuit: the firmware must pulse it low for 10 ms through the IO expander.',
    ],
    'nfc': [
        'I2C address 0x24. I0 high / I1 low selects I2C. VBAT runs from 5 V, PVDD (interface) from 3.3 V.',
        'C513/C517 (series), C514/C518 + C515/C519 (parallel) and R504/R505 are calculated starting values',
        'for a loop of 1.0 to 1.3 uH: the transmitter current stays below 90 mA anywhere in that range.',
        'Tune them on an assembled unit with the display fitted, using a network analyser (about 40 ohm at TX).',
    ],
    'display': [
        'Panel: 4.0 in 480x480, ST7701S + GT911, 40-pin 0.5 mm flex, contacts facing the board (bottom contact).',
        'The connector numbers its pins in the opposite direction: connector pin k carries panel pin 41-k.',
        'RGB565: panel B0 and R0 are tied to ground. Panel reset and the 3-wire SPI run through the IO expander.',
        'Backlight: 8 LEDs 4S2P, 39 mA. Brightness: PWM on BL_PWM at 25-40 kHz (low = off).',
    ],
    'ui': [
        'LEDs are reverse-mount parts shining through the board. Data flows D701 -> D708.',
        'Buzzer: drive BUZZER with a 2.7 kHz square wave (LEDC). Its coil is between pads 1 and 2;',
        'pads 3 and 4 only hold the part. R705 keeps the LED data line low while the MCU is in reset.',
        'Tamper: U702 accelerometer on I2C0 at 0x19, events read over I2C (INT1 on TP814). U703 hall switch:',
        'DOCK_N (IO expander P6) is low while the magnet in the dock is in front of it.',
    ],
    'mech': [],
}


def uid(*parts):
    return str(uuid.uuid5(NS, '/'.join(parts)))


def font(size=1.27, hide=False, justify=None, bold=False):
    f = [S('font'), [S('size'), size, size]]
    if bold:
        f.append([S('bold'), S('yes')])
    e = [S('effects'), f]
    if justify:
        e.append([S('justify')] + [S(j) for j in justify.split()])
    if hide:
        e.append([S('hide'), S('yes')])
    return e


def snap(v):
    return round(round(v / GRID) * GRID, 4)


def rot(x, y, deg):
    r = math.radians(deg)
    return x * math.cos(r) - y * math.sin(r), x * math.sin(r) + y * math.cos(r)


SIDE = {0: 'L', 90: 'D', 180: 'R', 270: 'U'}


class Sheet:
    def __init__(self, key, name, title, subtitle, page, root_uuid, scope):
        self.key, self.name, self.title, self.subtitle, self.page = key, name, title, subtitle, page
        self.root_uuid = root_uuid
        self.uuid = root_uuid if key == 'root' else uid('sheet', key)
        self.path = '/' + root_uuid if key == 'root' else '/%s/%s' % (root_uuid, self.uuid)
        self.scope = scope            # net -> 'power' | 'hier' | 'local'
        self.items = []
        self.lib = {}
        self.pwr = 0
        self.paper = 'A3'

    def use(self, libid):
        if libid not in self.lib:
            s = libs.symbol(libid)
            s[1] = libid
            self.lib[libid] = s
        return self.lib[libid]

    # ---- graphics
    def text(self, s, x, y, size=1.27, bold=False):
        self.items.append([S('text'), s, [S('exclude_from_sim'), S('no')], [S('at'), x, y, 0],
                           font(size, justify='left bottom', bold=bold),
                           [S('uuid'), uid(self.key, 't', s, str(x), str(y))]])

    def frame(self, x1, y1, x2, y2):
        self.items.append([S('rectangle'), [S('start'), x1, y1], [S('end'), x2, y2],
                           [S('stroke'), [S('width'), 0.15], [S('type'), S('dash')]],
                           [S('fill'), [S('type'), S('none')]],
                           [S('uuid'), uid(self.key, 'fr', str(x1), str(y1))]])

    def wire(self, x1, y1, x2, y2):
        self.items.append([S('wire'), [S('pts'), [S('xy'), x1, y1], [S('xy'), x2, y2]],
                           [S('stroke'), [S('width'), 0], [S('type'), S('default')]],
                           [S('uuid'), uid(self.key, 'w', str(x1), str(y1), str(x2), str(y2))]])

    def nc(self, x, y):
        self.items.append([S('no_connect'), [S('at'), x, y], [S('uuid'), uid(self.key, 'nc', str(x), str(y))]])

    # ---- net markers
    def label(self, net, x, y, side, kind):
        ang, just = {'L': (180, 'right'), 'R': (0, 'left'), 'U': (90, 'left'), 'D': (270, 'right')}[side]
        u = [S('uuid'), uid(self.key, kind, net, str(x), str(y))]
        if kind == 'hier':
            self.items.append([S('hierarchical_label'), net, [S('shape'), S('passive')], [S('at'), x, y, ang],
                               font(justify=just), u])
        else:
            self.items.append([S('label'), net, [S('at'), x, y, ang], font(justify=just + ' bottom'), u])

    def power(self, net, x, y, side):
        """Power symbol whose pin sits at (x, y) and whose graphic points away from the part."""
        libid = POWER[net]
        self.use(libid)
        up = net != 'GND'                                  # supply symbols point up, ground points down
        ang = {'U': 0, 'L': 90, 'D': 180, 'R': 270}[side] if up else {'D': 0, 'R': 90, 'U': 180, 'L': 270}[side]
        self.pwr += 1
        ref = '#PWR%s%03d' % (self.page, self.pwr)
        u = uid(self.key, 'pwr', str(self.pwr))
        tx, ty = {'L': (x - 3.3, y), 'R': (x + 3.3, y), 'U': (x, y - 3.6), 'D': (x, y + 3.6)}[side]
        self.items.append(self._instance(libid, x, y, ang, 1, u, ref, [
            ('Reference', ref, (x, y), 0, font(hide=True)),
            ('Value', net, (tx, ty), 0, font(1.0, justify={'L': 'right', 'R': 'left'}.get(side))),
            ('Footprint', '', (x, y), 0, font(hide=True)), ('Datasheet', '', (x, y), 0, font(hide=True)),
        ], ['1']))

    def flag(self, net, x, y):
        self.use('power:PWR_FLAG')
        self.pwr += 1
        ref = '#FLG%s%03d' % (self.page, self.pwr)
        u = uid(self.key, 'flg', net)
        self.items.append(self._instance('power:PWR_FLAG', x, y, 0, 1, u, ref, [
            ('Reference', ref, (x, y), 0, font(hide=True)), ('Value', 'PWR_FLAG', (x, y - 4.2), 0, font(1.0)),
            ('Footprint', '', (x, y), 0, font(hide=True)), ('Datasheet', '', (x, y), 0, font(hide=True)),
        ], ['1']))
        self.wire(x, y, x, y + 5.08)
        self.power(net, x, y + 5.08, 'D')

    def _instance(self, libid, x, y, ang, unit, u, ref, props, pin_numbers, dnp=False, in_bom=True):
        item = [S('symbol'), [S('lib_id'), libid], [S('at'), x, y, ang], [S('unit'), unit],
                [S('exclude_from_sim'), S('no')], [S('in_bom'), S('yes') if in_bom else S('no')],
                [S('on_board'), S('yes')], [S('dnp'), S('yes') if dnp else S('no')], [S('uuid'), u]]
        for k, v, at, a, eff in props:
            item.append([S('property'), k, v, [S('at'), at[0], at[1], a], eff])
        for num in pin_numbers:
            item.append([S('pin'), num, [S('uuid'), uid(u, 'pin', num)]])
        item.append([S('instances'), [S('project'), NAME, [S('path'), self.path, [S('reference'), ref],
                                                           [S('unit'), unit]]]])
        return item

    # ---- parts
    def place(self, part, unit, x, y, angle):
        sym = self.use(part.sym)
        pins = unit_pins(sym, unit)
        two_pin = len(pins) == 2 and angle == 90
        ys = [p[3] for p in pins] or [0]
        top = y - (max(ys) if angle == 0 else 0) - 2.2
        props = []
        for k, v, hidden in [('Reference', part.ref, False), ('Value', part.value, False),
                             ('Footprint', part.fp, True), ('Datasheet', '', True),
                             ('Description', part.desc, True)] + [
                                 (k, v, True) for k, v in [('LCSC', part.lcsc), ('MPN', part.mpn),
                                                           ('Variant', part.variant)] + sorted(part.extra.items()) if v]:
            if k == 'Reference':
                at = (x, y - 2.6) if two_pin else (x, top - 1.9)
            elif k == 'Value':
                at = (x, y + 2.9) if two_pin else (x, top)
            else:
                at = (x, y)
            # a field inherits the symbol rotation, so 90 here reads horizontally on a rotated part
            props.append((k, v, at, 90 if two_pin else 0, font(1.0 if two_pin else 1.27, hide=hidden)))
        self.items.append(self._instance(part.sym, x, y, angle, unit, uid('sym', part.ref, str(unit)), part.ref,
                                         props, [p[0] for p in pins], dnp=part.dnp,
                                         in_bom=not part.dnp and not part.ref.startswith(design.NOT_FITTED)))
        for num, name, px, py, pang, plen, _ in pins:
            rx, ry = rot(px, py, angle)
            cx, cy = round(x + rx, 4), round(y - ry, 4)
            side = SIDE[int(round(pang + angle)) % 360]
            net = part.nets.get(num)
            if net is None:
                self.nc(cx, cy)
            elif net in POWER:
                self.power(net, cx, cy, side)
            else:
                self.label(net, cx, cy, side, self.scope[net])

    def write(self, extra=()):
        tree = [S('kicad_sch'), [S('version'), 20250114], [S('generator'), 'attractap_build_sch'],
                [S('generator_version'), '9.0'], [S('uuid'), self.uuid], [S('paper'), self.paper],
                [S('title_block'), [S('title'), 'Attractap Touch P4: ' + self.title], [S('rev'), 'A'],
                 [S('company'), 'Attraccess'], [S('comment'), 1, self.subtitle]],
                [S('lib_symbols')] + list(self.lib.values())]
        tree += self.items
        tree += list(extra)
        fn = NAME + ('' if self.key == 'root' else '-' + self.key) + '.kicad_sch'
        open(os.path.join(PROJECT, fn), 'w', encoding='utf-8').write(dumps(tree) + '\n')
        return fn


def unit_pins(sym, unit):
    pins = libs.symbol_pins(sym)
    units = {p[6] for p in pins}
    if units <= {0, 1}:
        return pins
    return [p for p in pins if p[6] in (0, unit)]


def cell(part, unit, sym):
    """Size of the cell a part unit needs including its labels, and its origin offset inside the cell."""
    pins = unit_pins(sym, unit)
    angle = 90 if len(pins) == 2 else 0
    left = right = up = down = 0.0
    x1 = y1 = 1e9
    x2 = y2 = -1e9
    for num, name, px, py, pang, plen, _ in pins:
        rx, ry = rot(px, py, angle)
        cx, cy = rx, -ry
        side = SIDE[int(round(pang + angle)) % 360]
        net = part.nets.get(num)
        ln = 2.0 if net is None else (4.5 if net in POWER else 3.5 + 1.0 * len(net))
        x1, x2, y1, y2 = min(x1, cx), max(x2, cx), min(y1, cy), max(y2, cy)
        if side == 'L':
            left = max(left, ln)
        elif side == 'R':
            right = max(right, ln)
        elif side == 'U':
            up = max(up, ln)
        else:
            down = max(down, ln)
    if not pins:
        x1, x2, y1, y2 = -2.5, 2.5, -2.5, 2.5
    w = snap((x2 - x1) + left + right + 6.0)
    h = snap((y2 - y1) + up + down + 10.0)
    return w, h, left + 3.0 - x1, up + 6.5 - y1, angle


def pack(cells, max_w):
    """Shelf-pack cells [(w, h, payload)] into rows no wider than max_w; returns placements and total size."""
    out, x, y, row_h, total_w = [], 0.0, 0.0, 0.0, 0.0
    for w, h, payload in cells:
        if x > 0 and x + w > max_w:
            x, y, row_h = 0.0, y + row_h, 0.0
        out.append((x, y, payload))
        x += w
        row_h = max(row_h, h)
        total_w = max(total_w, x)
    return out, total_w, y + row_h


def main():
    d = libs.resolve(design.build())
    root_uuid = uid('root')
    # which sheets does every net touch?
    net_sheets = {}
    content = {}                      # sheet -> {group: [(part, unit)]}
    for p in d.parts.values():
        sym = libs.symbol(p.sym)
        for unit, (sheet, group) in p.units.items():
            content.setdefault(sheet, {}).setdefault(group, []).append((p, unit))
            for num, *_ in unit_pins(sym, unit):
                net = p.nets.get(num)
                if net:
                    net_sheets.setdefault(net, set()).add(sheet)
    scope = {n: ('power' if n in POWER else 'hier' if len(s) > 1 else 'local') for n, s in net_sheets.items()}

    root = Sheet('root', '', 'Overview', 'NFC access reader: ESP32-P4, Wi-Fi 6, Ethernet / PoE option', '1',
                 root_uuid, scope)
    root.paper = 'A3'
    root.text('Attractap Touch P4', 15, 22, 5.0, bold=True)
    root.text('Reader board: ESP32-P4 + ESP32-C6 (Wi-Fi 6), 4.0 in 480x480 touch display, PN532 NFC, '
              'optional 10/100 Ethernet with PoE, RGB LEDs, buzzer.', 15, 30, 2.0)
    root.text('Assembly variants: "wifi" leaves out every part with the field Variant = lan; "lan" fits all parts. '
              'Parts marked DNP are never fitted.', 15, 35, 2.0)
    root.text('Each block below is one schematic sheet. The pins are the nets that leave the sheet; '
              'equal names are connected. GND, +3V3 and +5V are global.', 15, 40, 2.0)

    rx, ry = 34.0, 52.0
    for i, (key, name, title, subtitle) in enumerate(SHEETS):
        sh = Sheet(key, name, title, subtitle, str(i + 2), root_uuid, scope)
        # ---- lay out the groups of this sheet
        boxes = []
        for group, members in content.get(key, {}).items():
            cells = []
            for part, unit in members:
                w, h, ox, oy, angle = cell(part, unit, sh.use(part.sym))
                cells.append((w, h, (part, unit, ox, oy, angle)))
            placed, gw, gh = pack(cells, 175.0)
            boxes.append((snap(gw + 6.0), snap(gh + 12.0), (group, placed)))
        notes = NOTES.get(key, [])
        top = snap(30 + 2.8 * len(notes) + 4)
        for paper, pw, ph in PAPER:
            placed_boxes, tw, th = pack(boxes, pw - 26.0)
            if top + th < ph - 16:
                break
        else:
            raise SystemExit('sheet %s does not fit on any paper size' % key)
        sh.paper = paper
        sh.text(title, 12, 15, 4.0, bold=True)
        sh.text(subtitle, 12, 21, 2.0)
        for j, line in enumerate(notes):
            sh.text(line, 12, 27 + j * 2.8, 1.5)
        size = {pl[0]: (w, h) for w, h, pl in boxes}
        for bx, by, (group, placed) in placed_boxes:
            gx, gy = snap(13.0 + bx), snap(top + by)
            bw, bh = size[group]
            sh.frame(gx, gy, gx + bw - 2.54, gy + bh - 2.54)
            sh.text(group, gx + 1.5, gy + 4.6, 2.0, bold=True)
            for cx, cy, (part, unit, ox, oy, angle) in placed:
                sh.place(part, unit, snap(gx + 3.0 + cx + ox), snap(gy + 7.0 + cy + oy), angle)
        if key == 'power':
            # tell the rule check that these rails are driven (the regulators have passive pins)
            for k, net in enumerate(('GND', '+3V3', '+5V')):
                sh.flag(net, snap(340.0 + k * 12.7), snap(top - 14))
        fn = sh.write()

        # ---- sheet symbol on the root with one pin per net that leaves the sheet
        iface = sorted(n for n, s in net_sheets.items() if key in s and scope[n] == 'hier')
        half = (len(iface) + 1) // 2
        w = 76.2
        h = snap(max(half, 3) * 2.54 + 7.62)
        if ry + h > 272.0:
            rx, ry = rx + w + 60.0, 52.0
        x, y = snap(rx), snap(ry)
        item = [S('sheet'), [S('at'), x, y], [S('size'), w, h], [S('exclude_from_sim'), S('no')],
                [S('in_bom'), S('yes')], [S('on_board'), S('yes')], [S('dnp'), S('no')],
                [S('stroke'), [S('width'), 0.1524], [S('type'), S('solid')]],
                [S('fill'), [S('color'), 255, 255, 194, 1.0]], [S('uuid'), sh.uuid],
                [S('property'), 'Sheetname', name, [S('at'), x, y - 0.7, 0], font(2.0, justify='left bottom')],
                [S('property'), 'Sheetfile', fn, [S('at'), x, y + h + 0.6, 0], font(1.27, justify='left top')]]
        for k, net in enumerate(iface):
            left = k < half
            py = snap(y + 5.08 + (k if left else k - half) * 2.54)
            px = x if left else x + w
            item.append([S('pin'), net, S('passive'), [S('at'), px, py, 180 if left else 0],
                         [S('uuid'), uid('sheetpin', key, net)], font(justify='left' if left else 'right')])
            ex = px - 2.54 if left else px + 2.54
            root.wire(px, py, ex, py)
            root.label(net, ex, py, 'L' if left else 'R', 'local')
        item.append([S('instances'), [S('project'), NAME, [S('path'), '/' + root_uuid, [S('page'), str(i + 2)]]]])
        root.items.append(item)
        root.text(subtitle, x, y + h + 5.2, 1.0)
        ry += h + 14.0

    root.write(extra=[[S('sheet_instances'), [S('path'), '/', [S('page'), '1']]], [S('embedded_fonts'), S('no')]])
    print('wrote root + %d sheets, %d parts' % (len(SHEETS), len(d.parts)))


if __name__ == '__main__':
    main()
