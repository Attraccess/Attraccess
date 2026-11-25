"""Generate the hierarchical KiCad schematic from design.py (bootstrap tool for revision A).

Structure produced:
  attractap-touch-p4.kicad_sch          root: block diagram, one sheet symbol per function
  attractap-touch-p4-<block>.kicad_sch  one sheet per function, parts grouped in framed sub-blocks

Nets that stay inside a sheet use local labels, nets that cross sheets use hierarchical
labels and sheet pins, the supply rails GND / +3V3 / +5V use power symbols.

Usage: python3 build_sch.py
"""
import os

import design
import libs
import sch_draw
import sch_finish
import sch_layouts
from sch_draw import POWER, snap
from sexpr import Sym, dumps

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', '..', 'kicad'))
NAME = 'attractap-touch-p4'
S = Sym

# key, sheet name (no spaces: it becomes part of net names), title, subtitle
SHEETS = [
    ('power', 'Power', 'Power input', 'USB-C, DC and PoE inputs, supply OR-ing, 3.3 V buck converter'),
    ('mcu', 'MCU', 'MCU', 'ESP32-P4 GPIO map, flash, crystal, reset and boot straps, USB'),
    ('mcu_power', 'MCU_Power', 'MCU power', 'ESP32-P4 supply pins, decoupling, 1.1 V core converter'),
    ('wifi', 'WiFi', 'Wi-Fi', 'ESP32-C5-MINI-1 co-processor (esp-hosted over SDIO) and its 3.3 V converter'),
    ('eth', 'Ethernet', 'Ethernet', 'IP101GRI RMII PHY, RJ45 with magnetics and PoE rectifiers (LAN version only)'),
    ('nfc', 'NFC', 'NFC', 'PN532 reader, EMC filter, antenna matching, PCB loop antenna'),
    ('display', 'Display', 'Display', '40-pin panel connector, backlight driver, IO expander'),
    ('ui', 'UI', 'LEDs, buzzer, tamper', 'Addressable RGB LEDs, level shifter, buzzer driver, tamper sensors'),
    ('mech', 'Mechanical', 'Mechanical', 'Mounting holes and fiducials'),
]
NOTES = {
    'power': [
        'Supply: USB-C 5 V, DC 12 to 24 V (barrel jack or spring terminal) or PoE (802.3af, isolated module).',
        'All three end on the +5V rail through blocking switches (U105 eFuse; U106/Q101, U107/Q102 ideal diodes),',
        'so any combination may be connected: the highest one feeds the board, none feeds another back.',
        'R104 / R105 take up the switches\' leakage (microamps), so an unpowered input stays at 0 V.',
        'USB: U105 starts the rail at 0.9 V/ms (C118), limits at 2 A (R110), off below 3.9 V and above 5.8 V.',
        'DC input: C117 - L103 - C112/C113 filter the converter ripple off the supply cable; C120 damps a live',
        'plug-in; D106 clamps surges behind L103. U104 starts at 8.5 to 9.4 V (R103/R113).',
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
        'The C5 runs the esp-hosted co-processor firmware. First flash through the C5 test points (C5_TX, C5_RX,',
        'C5_EN, GND; C5_BOOT = IO28 held low at reset), later updates over SDIO from the ESP32-P4. Its USB pins',
        'carry SDIO D2/D3, so these test points are the only wired way in.',
        'SDIO uses the P4 SDMMC slot 0 pins: D0-D3 = GPIO39-42, CLK = GPIO43, CMD = GPIO44.',
        "The module's PCB antenna stands over the cut in the board's top edge: no copper and no metal near it.",
        'U302 feeds only the module: always on with the 5 V rail; EN RC and all pull-ups on +3V3_WIFI.',
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
        'for the loop as simulated from the copper: 1.25 uH, or 1.20 uH on a metal wall. With parts of 5 %',
        'the transmitter stays below 100 mA for a loop of 1.10 to 1.25 uH (sim/, docs/design-notes.md).',
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
        'U704 proximity sensor on I2C0 at 0x60: infrared reflection from the dock plate 13.9 mm away, and ambient',
        'light. Pins 2 and 5 are joined as the datasheet asks. INT is open drain, on TP815.',
    ],
    'mech': [],
}


# Who drew and who checked this revision. The release procedure (docs/release.md) has the checker sign
# here before an order.
DRAWN_BY = 'Attraccess, generated from design.py'
CHECKED_BY = 'open: sign-off before ordering (docs/release.md)'
# Revision A has not been built; these are the dated states of its design, newest last. docs/release.md has
# the same table (a test compares them).
REV = 'A'
DATE = '2026-11-25'
HISTORY = [
    ('2026-11-15', 'First design, generated from the circuit description'),
    ('2026-11-21', 'Review: Ethernet jack, silkscreen, tamper sensors (accelerometer, hall switch, proximity)'),
    ('2026-11-22', 'Six layers; checked against the datasheets: PN532 paste, DC input capacitors'),
    ('2026-11-24', 'Simulated: NFC matching; ESP32-C6-MINI-1U with an antenna connector'),
    ('2026-11-25', 'Industry review: core divider 499k, 3 kV barrier capacitors, schematic redrawn, TVS symbols'),
    ('2026-11-25', 'Industry review: parts data and alternates, fab drawing, IPC-D-356 netlist, 3D models, '
                   'land patterns of USB-C, ESP32-C6 and display connector'),
    ('2026-11-25', 'Industry review: eFuse and ideal diodes on the 5 V rail, reset supervisor, damped DC input, '
                   'TLV62569 3.3 V converter, test points, DC and PoE present to the firmware'),
    ('2026-11-25', 'Industry review: layout rework (ESP32-P4 land pattern, decoupling, USB pair, impedance), '
                   '2.0 x 1.6 mm crystal, designators on the silkscreen, assembly drawing'),
    ('2026-11-25', 'Wi-Fi module ESP32-C5-MINI-1 (2.4 and 5 GHz, PCB antenna) instead of the ESP32-C6-MINI-1U, '
                   'with a 3.3 V converter of its own'),
]


def uid(*parts):
    return sch_draw.uid(*parts)


def unit_pins(sym, unit):
    pins = libs.symbol_pins(sym)
    units = {p[6] for p in pins}
    if units <= {0, 1}:
        return pins
    return [p for p in pins if p[6] in (0, unit)]


def instance(path):
    """A function that makes a symbol instance for one sheet (path = its hierarchical path)."""
    def make(libid, x, y, ang, unit, u, ref, props, pin_numbers, dnp=False, in_bom=True, mirror=False):
        item = [S('symbol'), [S('lib_id'), libid], [S('at'), x, y, ang]] + ([[S('mirror'), S('y')]] if mirror else []) + [
                [S('unit'), unit],
                [S('exclude_from_sim'), S('no')], [S('in_bom'), S('yes') if in_bom else S('no')],
                [S('on_board'), S('yes')], [S('dnp'), S('yes') if dnp else S('no')], [S('uuid'), u]]
        for k, v, at, a, eff in props:
            item.append([S('property'), k, v, [S('at'), at[0], at[1], a], eff])
        for num in pin_numbers:
            item.append([S('pin'), num, [S('uuid'), uid(u, 'pin', num)]])
        item.append([S('instances'), [S('project'), NAME, [S('path'), path, [S('reference'), ref],
                                                           [S('unit'), unit]]]])
        return item
    return make


def symbol_items(cv, make):
    out = []
    for (ref, unit), u in sorted(cv.units.items()):
        part = u.part
        props = []
        shown = set(u.fields)
        for k, v in [('Reference', ref), ('Value', part.value), ('Footprint', part.fp), ('Datasheet', ''),
                     ('Description', part.desc)] + [(k, v) for k, v in [('LCSC', part.lcsc), ('MPN', part.mpn),
                                                    ('Manufacturer', part.mfr), ('Variant', part.variant)]
                                                    + sorted(part.extra.items()) if v]:
            if k in shown:
                fx, fy, fa, just = u.fields[k]
                props.append((k, v, (round(fx, 3), round(fy, 3)), fa, sch_draw.font(1.27)))
            else:
                props.append((k, v, (u.x, u.y), 0, sch_draw.font(1.27, hide=True)))
        pins = [num for num in u.pins]
        out.append(make(part.sym, u.x, u.y, u.angle, unit, uid('sym', ref, str(unit)), ref, props, pins,
                        dnp=part.dnp, in_bom=not part.dnp and not ref.startswith(design.NOT_FITTED),
                        mirror=u.mirror))
    return out


def title_block(title, subtitle):
    return [S('title_block'), [S('title'), 'Attractap Touch P4: ' + title], [S('date'), DATE], [S('rev'), REV],
            [S('company'), 'Attraccess'], [S('comment'), 1, subtitle],
            [S('comment'), 2, 'Revision history: sheet 1. Generated by scripts/bootstrap/build_sch.py'],
            [S('comment'), 3, 'Drawn by: ' + DRAWN_BY], [S('comment'), 4, 'Checked by: ' + CHECKED_BY]]


def write_sheet(fn, sheet_uuid, paper, title, subtitle, lib, items_, extra=()):
    tree = [S('kicad_sch'), [S('version'), 20250114], [S('generator'), 'attractap_build_sch'],
            [S('generator_version'), '10.0'], [S('uuid'), sheet_uuid], [S('paper'), paper],
            title_block(title, subtitle), [S('lib_symbols')] + list(lib.values())]
    tree += items_ + list(extra)
    open(os.path.join(PROJECT, fn), 'w', encoding='utf-8').write(dumps(tree) + '\n')


def fallback(cv, parts, x0, y0, width):
    """Parts a layout does not place: in a row with labels on every pin (a new part shows up drawn)."""
    x, y, row = x0, y0, 0.0
    for part, unit in parts:
        if True:
            sym = cv.use(part.sym)
            u = sch_draw.Unit(part, unit, 0, 0, 0, sym)
            w = u.body[2] - u.body[0] + 30
            h = u.body[3] - u.body[1] + 20
            if x + w > x0 + width:
                x, y, row = x0, y + row, 0.0
            cv.put(part, x + 15 - u.body[0], y + 10 - u.body[1], 0, unit)
            x += w
            row = max(row, h)
    return y + row


def main():
    d = libs.resolve(design.build())
    root_uuid = uid('root')
    net_sheets, net_pins, content = {}, {}, {}
    for p in d.parts.values():
        sym = libs.symbol(p.sym)
        for unit, (sheet, _group) in p.units.items():
            content.setdefault(sheet, []).append((p, unit))
            for num, *_ in unit_pins(sym, unit):
                net = p.nets.get(num)
                if net:
                    net_sheets.setdefault(net, set()).add(sheet)
                    net_pins[net] = net_pins.get(net, 0) + 1
    scope = {n: ('power' if n in POWER else 'hier' if len(s) > 1 else 'local') for n, s in net_sheets.items()}
    by_ref = d.parts
    root_items, root_lib = [], {}
    rx, ry = 34.0, 66.0
    findings = 0
    for i, (key, name, title, subtitle) in enumerate(SHEETS):
        page = str(i + 2)
        cv = sch_draw.Canvas(key, page, scope, net_pins)
        notes = NOTES.get(key, [])
        cv.text(title, 12, 15, 4.0, bold=True)
        cv.text(subtitle, 12, 21, 2.0)
        for j, line in enumerate(notes):
            cv.text(line, 12, 27 + j * 2.8, 1.5)
        top = snap(30 + 2.8 * len(notes) + 6)
        sch_layouts.draw(key, cv, by_ref, top)
        rest = [(p, u) for p, u in content.get(key, []) if (p.ref, u) not in cv.units]
        if rest:
            print('%s: no layout for %s, drawn in a row' % (key, ' '.join(p.ref for p, _u in rest)))
            cv.begin('Not yet arranged')
            fallback(cv, rest, 20, 250, 380)
        if key == 'power':
            # tell the rule check that these rails are driven (the regulators have passive pins)
            cv.begin(None)
            for k, net in enumerate(('GND', '+3V3', '+5V')):
                cv.flag(net, 372.0 + k * 12.7, top - 22)
        sch_finish.finish(cv)
        sch_finish.check(cv)
        sch_finish.make_frames(cv)
        problems = sch_finish.lint(cv)
        paper = sch_layouts.paper(sch_finish.extent(cv))
        for f in problems:
            print('  lint %s: %s' % (key, f))
        findings += len(problems)
        sheet_uuid = uid('sheet', key)
        path = '/%s/%s' % (root_uuid, sheet_uuid)
        make = instance(path)
        items_ = symbol_items(cv, make) + sch_finish.items(cv, path, NAME, page, make)
        for n, (net, x, y) in enumerate(cv.flags):
            cv.use('power:PWR_FLAG')
            items_.append(make('power:PWR_FLAG', x, y, 0, 1, uid(key, 'flg', net), '#FLG%s%02d' % (page, n + 1), [
                ('Reference', '#FLG', (x, y), 0, sch_draw.font(hide=True)),
                ('Value', 'PWR_FLAG', (x, y - 4.2), 0, sch_draw.font(1.0)),
                ('Footprint', '', (x, y), 0, sch_draw.font(hide=True)),
                ('Datasheet', '', (x, y), 0, sch_draw.font(hide=True))], ['1']))
        fn = NAME + '-' + key + '.kicad_sch'
        write_sheet(fn, sheet_uuid, paper, title, subtitle, cv.lib, items_)
        # ---- sheet symbol on the root with one pin per net that leaves the sheet
        iface = sorted(n for n, s in net_sheets.items() if key in s and scope[n] == 'hier')
        half = (len(iface) + 1) // 2
        w = 76.2
        h = snap(max(half, 3) * 2.54 + 7.62)
        if ry + h > 262.0:
            rx, ry = rx + w + 60.0, 66.0
        x, y = snap(rx), snap(ry)
        item = [S('sheet'), [S('at'), x, y], [S('size'), w, h], [S('exclude_from_sim'), S('no')],
                [S('in_bom'), S('yes')], [S('on_board'), S('yes')], [S('dnp'), S('no')],
                [S('stroke'), [S('width'), 0.1524], [S('type'), S('solid')]],
                [S('fill'), [S('color'), 255, 255, 194, 1.0]], [S('uuid'), sheet_uuid],
                [S('property'), 'Sheetname', name, [S('at'), x, y - 0.7, 0], sch_draw.font(2.0, justify='left bottom')],
                [S('property'), 'Sheetfile', fn, [S('at'), x, y + h + 0.6, 0], sch_draw.font(1.27, justify='left top')]]
        for k, net in enumerate(iface):
            left = k < half
            py = snap(y + 5.08 + (k if left else k - half) * 2.54)
            px = x if left else x + w
            item.append([S('pin'), net, S('passive'), [S('at'), px, py, 180 if left else 0],
                         [S('uuid'), uid('sheetpin', key, net)], sch_draw.font(justify='left' if left else 'right')])
            ex = px - 2.54 if left else px + 2.54
            root_items.append([S('wire'), [S('pts'), [S('xy'), px, py], [S('xy'), ex, py]],
                               [S('stroke'), [S('width'), 0], [S('type'), S('default')]],
                               [S('uuid'), uid('root', 'w', str(px), str(py), str(ex), str(py))]])
            ang, just = (180, 'right') if left else (0, 'left')
            root_items.append([S('label'), net, [S('at'), ex, py, ang], sch_draw.font(justify=just + ' bottom'),
                               [S('uuid'), uid('root', 'local', net, str(ex), str(py))]])
        item.append([S('instances'), [S('project'), NAME, [S('path'), '/' + root_uuid, [S('page'), page]]]])
        root_items.append(item)
        root_items.append(root_text(subtitle, x, y + h + 5.2, 1.0))
        ry += h + 14.0
    root_items += root_header()
    write_sheet(NAME + '.kicad_sch', root_uuid, 'A3', 'Overview',
                'NFC access reader: ESP32-P4, Wi-Fi 6, Ethernet / PoE option', root_lib, root_items,
                extra=[[S('sheet_instances'), [S('path'), '/', [S('page'), '1']]], [S('embedded_fonts'), S('no')]])
    print('wrote root + %d sheets, %d parts, %d lint findings' % (len(SHEETS), len(d.parts), findings))
    if findings:
        raise SystemExit('the schematic has overlapping text or symbols (see the lint lines above)')


def root_text(s, x, y, size, bold=False):
    return [S('text'), s, [S('exclude_from_sim'), S('no')], [S('at'), x, y, 0],
            sch_draw.font(size, justify='left bottom', bold=bold), [S('uuid'), uid('root', 't', s, str(x), str(y))]]


def root_header():
    out = [root_text('Attractap Touch P4', 15, 22, 5.0, bold=True),
           root_text('Reader board: ESP32-P4 + ESP32-C5 (dual-band Wi-Fi 6), 4.0 in 480x480 touch display, PN532 NFC, '
                     'optional 10/100 Ethernet with PoE, RGB LEDs, buzzer.', 15, 30, 2.0),
           root_text('Assembly variants: "wifi" leaves out every part with the field Variant = lan; "lan" fits all '
                     'parts. Parts marked DNP are never fitted.', 15, 35, 2.0),
           root_text('Each block below is one schematic sheet. The pins are the nets that leave the sheet; '
                     'equal names are connected. GND, +3V3 and +5V are global.', 15, 40, 2.0),
           root_text('Revision history (revision A, not built yet)', 15, 47, 1.8, bold=True)]
    for k, (date, change) in enumerate(HISTORY):
        out.append(root_text('A   %s   %s' % (date, change), 15, 51 + k * 2.4, 1.4))
    return out


if __name__ == '__main__':
    main()
