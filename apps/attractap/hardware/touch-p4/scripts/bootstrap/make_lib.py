"""Build the project library kicad/lib from the LCSC/EasyEDA conversions and generate the NFC antenna.

Usage: make_lib.py <dir with lcsc.kicad_sym and lcsc.pretty>
The LCSC conversions were produced with easyeda2kicad (see README). This script only needs to be
re-run when a part is added to design.py.
"""
import os
import re
import shutil
import sys

from sexpr import Sym, dumps, find, first, loads
from footprint_silk import buzzer_plus_mark, trim_silk
import design as design_mod
from lib_symbols import write_derived

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.normpath(os.path.join(HERE, '..', '..', 'kicad', 'lib'))
NICK = 'attractap'

# NFC loop antenna geometry (mm). Outer size, turns, track width, pitch.
import geometry

ANT_W, ANT_H, ANT_TURNS, ANT_TRACK, ANT_PITCH = geometry.ANT_W, geometry.ANT_H, 4, 0.5, 0.9
# Symbols whose footprint is not the converted one. The LED uses KiCad's footprint: it has the board
# cut-out with relieved corners and pads that keep their distance from it.
FOOTPRINT_OVERRIDE = {'SK6812MINI-E_C5149201': 'attractap:LED_SK6812MINI-E_ReverseMount_Clear'}
ANT_FEED_Y = -12.0   # where the outer end starts on the left side, relative to the loop centre


def antenna_points():
    hw, hh, p = ANT_W / 2, ANT_H / 2, ANT_PITCH
    pts = [(-hw, ANT_FEED_Y), (-hw, -hh), (hw, -hh), (hw, hh)]
    for k in range(1, ANT_TURNS):
        pts += [(-hw + k * p, hh - (k - 1) * p), (-hw + k * p, -hh + k * p),
                (hw - k * p, -hh + k * p), (hw - k * p, hh - k * p)]
    k = ANT_TURNS
    pts += [(-hw + k * p, hh - (k - 1) * p), (-hw + k * p, ANT_FEED_Y + 1.5)]
    return pts


def antenna_footprint():
    pts = antenna_points()
    S = Sym
    fp = [S('footprint'), 'NFC_Antenna_4T', [S('version'), 20240108], [S('generator'), 'attractap_make_lib'],
          [S('layer'), 'F.Cu'],
          [S('descr'), '13.56 MHz loop antenna, %d turns, %gx%g mm, on the back copper layer' % (
              ANT_TURNS, ANT_W, ANT_H)],
          [S('property'), 'Reference', 'REF**', [S('at'), 0, -ANT_H / 2 - 1.5, 0], [S('layer'), 'F.Fab'],
           [S('effects'), [S('font'), [S('size'), 1, 1], [S('thickness'), 0.15]]]],
          [S('property'), 'Value', 'NFC_Antenna_4T', [S('at'), 0, ANT_H / 2 + 1.5, 0], [S('layer'), 'F.Fab'],
           [S('effects'), [S('font'), [S('size'), 1, 1], [S('thickness'), 0.15]]]],
          [S('attr'), S('exclude_from_pos_files'), S('exclude_from_bom')],
          [S('net_tie_pad_groups'), '1, 2']]
    # one copper polygon for the whole spiral: KiCad's net-tie rule needs a single shape touching both pads
    h = ANT_TRACK / 2
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        segs = []
        if i:
            segs.append((pts[i - 1], pts[i]))
        if i + 1 < len(pts):
            segs.append((pts[i], pts[i + 1]))
        nx = ny = 0.0
        for (ax_, ay_), (bx_, by_) in segs:
            dx, dy = bx_ - ax_, by_ - ay_
            ln = (dx * dx + dy * dy) ** 0.5
            nx += -dy / ln
            ny += dx / ln
        left.append((round(x + nx * h, 4), round(y + ny * h, 4)))
        right.append((round(x - nx * h, 4), round(y - ny * h, 4)))
    outline = left + right[::-1]
    fp.append([S('fp_poly'), [S('pts')] + [[S('xy'), x, y] for x, y in outline],
               [S('stroke'), [S('width'), 0], [S('type'), S('solid')]], [S('fill'), S('solid')],
               [S('layer'), 'B.Cu']])
    hw, hh = ANT_W / 2, ANT_H / 2
    fp.append([S('fp_rect'), [S('start'), -hw, -hh], [S('end'), hw, hh],
               [S('stroke'), [S('width'), 0.1], [S('type'), S('solid')]], [S('fill'), S('none')],
               [S('layer'), 'F.Fab']])
    for num, (x, y) in (('1', pts[0]), ('2', pts[-1])):
        fp.append([S('pad'), num, S('thru_hole'), S('circle'), [S('at'), x, y], [S('size'), 0.8, 0.8],
                   [S('drill'), 0.3], [S('layers'), '*.Cu']])
    return dumps(fp) + '\n'


# ESP32-P4 as a three-unit symbol: GPIO, system, power. None leaves a gap between pin groups.
P4_UNITS = [
    ('GPIO', ['GPIO%d' % n for n in range(0, 24)], ['GPIO%d' % n for n in range(24, 55)]),
    ('System',
     ['CHIP_PU', None, 'XTAL_P', 'XTAL_N', None, 'FLASH_CS', 'FLASH_CK', 'FLASH_D', 'FLASH_Q', 'FLASH_WP',
      'FLASH_HOLD', None, 'USB_DP', 'USB_DM'],
     ['DSI_REXT', 'DSI_CLKP', 'DSI_CLKN', 'DSI_DATAP0', 'DSI_DATAN0', 'DSI_DATAP1', 'DSI_DATAN1', None,
      'CSI_REXT', 'CSI_CLKP', 'CSI_CLKN', 'CSI_DATAP0', 'CSI_DATAN0', 'CSI_DATAP1', 'CSI_DATAN1']),
    ('Power',
     ['VDD_LP', 'VDD_IO_0', 'VDD_IO_4', 'VDD_IO_5', 'VDD_IO_6', 'VDD_ANA', 'VDD_BAT', 'VDD_USBPHY',
      'VDD_MIPI_DPHY', None, 'VDD_LDO', 'VDD_DCDCC', None, 'VDD_HP_0', 'VDD_HP_1', 'VDD_HP_2', 'VDD_HP_3'],
     ['VDDO_FLASH', 'VDD_FLASHIO', None, 'VDDO_PSRAM', 'VDD_PSRAM_0', 'VDD_PSRAM_1', None, 'VDDO_3', 'VDDO_4',
      None, 'EN_DCDC', 'FB_DCDC', None, 'GND']),
]


def multi_unit_symbol(name, src_symbol, units, footprint, lcsc, half_width=15.24):
    """Build a multi-unit box symbol; pin numbers are taken from ``src_symbol`` by pin name."""
    number = {}
    for sub in find(src_symbol, 'symbol'):
        for pin in find(sub, 'pin'):
            number[first(pin, 'name')[1]] = first(pin, 'number')[1]
    S = Sym

    def eff(size=1.27, hide=False):
        e = [S('effects'), [S('font'), [S('size'), size, size]]]
        if hide:
            e.append([S('hide'), S('yes')])
        return e
    sym = [S('symbol'), name, [S('pin_names'), [S('offset'), 1.016]], [S('exclude_from_sim'), S('no')],
           [S('in_bom'), S('yes')], [S('on_board'), S('yes')],
           [S('property'), 'Reference', 'U', [S('at'), -half_width, 2.54, 0], eff()],
           [S('property'), 'Value', name, [S('at'), 0, 2.54, 0], eff()],
           [S('property'), 'Footprint', footprint, [S('at'), 0, 0, 0], eff(hide=True)],
           [S('property'), 'Datasheet', '', [S('at'), 0, 0, 0], eff(hide=True)],
           [S('property'), 'Description', 'ESP32-P4, chip revision v3.x, QFN-104', [S('at'), 0, 0, 0], eff(hide=True)],
           [S('property'), 'LCSC Part', lcsc, [S('at'), 0, 0, 0], eff(hide=True)]]
    used = set()
    for i, (uname, left, right) in enumerate(units, 1):
        rows = max(len(left), len(right))
        height = rows * 2.54 + 2.54
        sub = [S('symbol'), '%s_%d_1' % (name, i),
               [S('rectangle'), [S('start'), -half_width, 0], [S('end'), half_width, -height],
                [S('stroke'), [S('width'), 0.254], [S('type'), S('default')]], [S('fill'), [S('type'), S('background')]]],
               [S('text'), uname, [S('at'), 0, -height + 1.6, 0], eff(1.5)]]
        for side, names in (('L', left), ('R', right)):
            for row, pname in enumerate(names):
                if pname is None:
                    continue
                y = -2.54 * (row + 1)
                x, ang = (-half_width - 2.54, 0) if side == 'L' else (half_width + 2.54, 180)
                sub.append([S('pin'), S('passive'), S('line'), [S('at'), x, y, ang], [S('length'), 2.54],
                            [S('name'), pname, eff()], [S('number'), number[pname], eff()]])
                used.add(pname)
        sym.append(sub)
    missing = set(number) - used
    assert not missing, missing
    return sym


def y2_footprint():
    """The Y2 barrier capacitor (2211 case) with the 4.5 mm pad gap of Murata's test board."""
    S = Sym
    (w, h), px = geometry.BARRIER_CAP_PAD, geometry.BARRIER_CAP_PAD_X
    name = 'C_2211_5728Metric_Y2'

    def line(x1, y1, x2, y2, layer, width):
        return [S('fp_line'), [S('start'), x1, y1], [S('end'), x2, y2],
                [S('stroke'), [S('width'), width], [S('type'), S('solid')]], [S('layer'), layer]]
    fp = [S('footprint'), name, [S('version'), 20240108], [S('generator'), 'attractap_make_lib'], [S('layer'), 'F.Cu'],
          [S('descr'), 'Safety capacitor 2211 (5.7 x 2.8 mm), X1/Y2; 4.5 mm between the pads (Murata GA352 test board)'],
          [S('tags'), 'capacitor Y2 safety 2211'],
          [S('property'), 'Reference', 'REF**', [S('at'), 0, -2.6, 0], [S('layer'), 'F.SilkS'],
           [S('effects'), [S('font'), [S('size'), 1, 1], [S('thickness'), 0.15]]]],
          [S('property'), 'Value', name, [S('at'), 0, 2.6, 0], [S('layer'), 'F.Fab'],
           [S('effects'), [S('font'), [S('size'), 1, 1], [S('thickness'), 0.15]]]],
          [S('attr'), S('smd')]]
    bx, by = 2.85, 1.4
    for a, b in (((-bx, -by), (bx, -by)), ((bx, -by), (bx, by)), ((bx, by), (-bx, by)), ((-bx, by), (-bx, -by))):
        fp.append(line(a[0], a[1], b[0], b[1], 'F.Fab', 0.1))
    cx, cy = px + w / 2 + 0.25, h / 2 + 0.25
    for a, b in (((-cx, -cy), (cx, -cy)), ((cx, -cy), (cx, cy)), ((cx, cy), (-cx, cy)), ((-cx, cy), (-cx, -cy))):
        fp.append(line(a[0], a[1], b[0], b[1], 'F.CrtYd', 0.05))
    sx = px - w / 2 - 0.4                         # silkscreen between the pads only, off the copper
    fp.append(line(-sx, -by - 0.12, sx, -by - 0.12, 'F.SilkS', 0.12))
    fp.append(line(-sx, by + 0.12, sx, by + 0.12, 'F.SilkS', 0.12))
    fp.append([S('fp_text'), S('user'), '${REFERENCE}', [S('at'), 0, 0, 0], [S('layer'), 'F.Fab'],
               [S('effects'), [S('font'), [S('size'), 0.8, 0.8], [S('thickness'), 0.12]]]])
    for num, x in (('1', -px), ('2', px)):
        fp.append([S('pad'), num, S('smd'), S('roundrect'), [S('at'), x, 0], [S('size'), w, h],
                   [S('layers'), 'F.Cu', 'F.Paste', 'F.Mask'], [S('roundrect_rratio'), 0.2]])
    attach_model(fp, name)
    return name, dumps(fp) + '\n'


# The DC terminal footprint is the one of the WAGO 2601 lever terminal: four holes, two per pole. The
# WAGO 250 push-button terminal has one pin per pole on the same grid and sits in two diagonal holes
# (+ back left, - front right). Its body reaches 0.75 mm further to the left. Body x1, y1, x2, y2:
WAGO_250_BODY = (-5.0, -4.8, 3.5, 7.2)


def fits_wago_250(tree):
    """Courtyard around both terminal bodies, outline of the 250 body on the fabrication layer."""
    x1, y1, x2, y2 = WAGO_250_BODY
    for line in find(tree, 'fp_line'):
        if first(line, 'layer')[1] == 'F.CrtYd':
            for end in (first(line, 'start'), first(line, 'end')):
                if float(end[1]) < 0:
                    end[1] = x1 - 0.25
    for a, b in (((x1, y1), (x2, y1)), ((x2, y1), (x2, y2)), ((x2, y2), (x1, y2)), ((x1, y2), (x1, y1))):
        tree.append([Sym('fp_line'), [Sym('start'), *a], [Sym('end'), *b], [Sym('layer'), Sym('F.Fab')],
                     [Sym('width'), 0.1]])


# Solder paste on the exposed pad of the ESP32-P4: nine windows instead of one opening as large as
# the pad (which is what the converted footprint has). Paste over the whole 7.5 mm pad can lift the
# package off its 0.35 mm pitch pins. Espressif's own footprint uses the same pattern, about 70 %.
P4_PASTE_WINDOW, P4_PASTE_PITCH = 2.1, 2.5


# The same for the Ethernet PHY's 2.7 mm pad: four windows, with lanes between them for the ground vias.
PHY_PASTE_WINDOW, PHY_PASTE_PITCH = 1.0, 1.5


# The PN532's 4.42 mm pad. Its footprint brings four thermal vias with it, as plated pads 0.5 mm from the
# centre: eight windows in a ring around them (a 3 x 3 grid without its centre), 54 % of the pad.
NFC_PASTE_WINDOW, NFC_PASTE_PITCH = 1.15, 1.5


def paste_windows(tree, size, pitch, n=3):
    """Take the paste off the largest pad and add an n x n grid of paste-only openings in its place. A
    window that would lie on a plated hole of the footprint (a thermal via) is left out: solder paste
    over a hole runs into it."""
    S = Sym
    ep = max((p for p in find(tree, 'pad') if p[2] == 'smd'), key=lambda p: float(first(p, 'size')[1]))
    layers = first(ep, 'layers')
    if 'F.Paste' not in [str(v) for v in layers[1:]]:
        return                                            # done before
    layers[:] = [layers[0]] + [v for v in layers[1:] if str(v) != 'F.Paste']
    x0, y0 = float(first(ep, 'at')[1]), float(first(ep, 'at')[2])
    holes = [(float(first(p, 'at')[1]), float(first(p, 'at')[2]), float(first(p, 'size')[1]) / 2)
             for p in find(tree, 'pad') if p[2] == 'thru_hole']
    steps = [(k - (n - 1) / 2) * pitch for k in range(n)]
    for dx in steps:
        for dy in steps:
            x, y = x0 + dx, y0 + dy
            if any(abs(x - hx) < size / 2 + r and abs(y - hy) < size / 2 + r for hx, hy, r in holes):
                continue
            tree.append([S('pad'), '', S('smd'), S('rect'), [S('at'), x, y],
                         [S('size'), size, size], [S('layers'), S('F.Paste')]])


def no_paste_on_plated_holes(tree):
    """The converter gives a thermal via inside an exposed pad the layers `*.Cu *.Paste *.Mask`: a paste
    opening on the hole, on both sides of the board. Parts with wire leads have none on their pads."""
    for pad in find(tree, 'pad'):
        layers = first(pad, 'layers')
        if pad[2] == 'thru_hole' and layers:
            layers[:] = [v for v in layers if not str(v).endswith('.Paste')]


# VCNL4040 proximity sensor, as the converted footprint lies: body 4 x 2 mm, pins 1 to 4 along the bottom from the
# left. From the datasheet's package drawing: emitter 0.85 mm from the end with pins 4 and 5, 1.2 mm wide; detector
# 0.55 mm from the end with pins 1 and 8, 1.1 mm wide.
PROX_BODY = (-2.0, -1.0, 2.0, 1.0)
PROX_EMITTER, PROX_DETECTOR = (1.15, 0.0, 0.6), (-1.45, 0.0, 0.55)


def proximity_sensor_outline(tree):
    """The converted footprint draws its courtyard along the body and leaves the pads outside it, and has nothing
    on the fabrication layer. Courtyard around the pads; body, emitter and detector on the fabrication layer."""
    S = Sym
    tree[:] = [i for i in tree if not (isinstance(i, list) and i and i[0] == 'fp_line'
                                       and first(i, 'layer')[1] == 'F.CrtYd')]
    pads = [(float(first(p, 'at')[1]), float(first(p, 'at')[2]), float(first(p, 'size')[1]) / 2,
             float(first(p, 'size')[2]) / 2) for p in find(tree, 'pad')]
    x1, y1, x2, y2 = PROX_BODY
    cx, cy = max(x + w for x, _y, w, _h in pads) + 0.25, max(y + h for _x, y, _w, h in pads) + 0.25
    cx, cy = round(max(cx, x2 + 0.25), 2), round(max(cy, y2 + 0.25), 2)

    def box(a, b, c, d, layer, width):
        for p, q in (((a, b), (c, b)), ((c, b), (c, d)), ((c, d), (a, d)), ((a, d), (a, b))):
            tree.append([S('fp_line'), [S('start'), *p], [S('end'), *q], [S('layer'), S(layer)], [S('width'), width]])

    box(-cx, -cy, cx, cy, 'F.CrtYd', 0.05)
    box(x1, y1, x2, y2, 'F.Fab', 0.1)
    for x, y, r in (PROX_EMITTER, PROX_DETECTOR):
        tree.append([S('fp_circle'), [S('center'), x, y], [S('end'), x + r, y], [S('layer'), S('F.Fab')],
                     [S('width'), 0.1]])


def usb_c_power_pads(tree):
    """The converter drew the four 0.6 mm power pads of the USB-C receptacle as polygons with a 0.1 mm
    outline, which KiCad makes 0.7 x 1.4 mm: 0.10 mm from VBUS to GND where HRO's drawing has 0.20 mm.
    Plain 0.6 x 1.3 mm pads at the same centres, as the drawing has them."""
    for pad in find(tree, 'pad'):
        if pad[3] == 'custom' and str(pad[1]) in ('A1B12', 'B1A12', 'A4B9', 'B4A9'):
            at, layers = first(pad, 'at'), first(pad, 'layers')
            pad[:] = [Sym('pad'), pad[1], Sym('smd'), Sym('rect'), at, [Sym('size'), 0.6, 1.3], layers]


def c6_ground_pads(tree):
    """The module's nine ground pads: 1.45 mm at a pitch of 1.975 mm, centred on the module (datasheet
    v1.5, figures 11-1 and 11-2). The converted footprint had 1.80 mm and the block 0.05 mm off."""
    for pad in find(tree, 'pad'):
        size = first(pad, 'size')
        if str(pad[1]) == '49' and size and abs(float(size[1]) - 1.45) < 0.01:
            at = first(pad, 'at')
            ix, iy = round((float(at[1]) - 0.02) / 1.8), round((float(at[2]) + 0.05) / 1.8)
            if abs(float(at[1]) - ix * 1.975) > 0.001 and abs(float(at[1]) - ix * 1.8 - 0.02) < 0.01:
                at[1], at[2] = round(ix * 1.975, 3), round(iy * 1.975, 3)


def fpc_signal_pads(tree):
    """Hirose's mounting pattern for the FH12 has 0.30 mm signal pads; the converter took the 0.25 mm of
    the stencil opening. Copper 0.30 mm, paste 0.25 mm."""
    for pad in find(tree, 'pad'):
        size = first(pad, 'size')
        if str(pad[1]).isdigit() and int(pad[1]) <= 40 and size and abs(float(size[2]) - 0.25) < 0.001:
            size[2] = 0.3
            pad.append([Sym('solder_paste_margin'), -0.025])


def custom_pad_strokes(tree):
    """The converter draws L-shaped pads (the TPS259470A's corner pins) as polygons with a 0.1 mm
    outline, which adds 0.05 mm of copper all round. The polygon is the land TI draws: no outline."""
    for pad in find(tree, 'pad'):
        if pad[3] == 'custom':
            for poly in find(first(pad, 'primitives') or [], 'gr_poly'):
                w = first(poly, 'width')
                if w:
                    w[1] = 0


# ESP32-P4 signal pads as in Espressif's KiCad footprint (espressif/kicad-libraries, ESP32-P4.kicad_mod):
# 0.20 x 0.65 mm from 4.55 to 5.20 mm off the centre. The converted pads were 0.15 mm wide and 0.125 mm
# further out. At the 0.35 mm pitch 0.15 mm stays between two pads; a solder mask margin of 0.025 mm
# leaves a mask web of 0.10 mm, JLCPCB's smallest.
P4_PAD = (0.65, 0.20, 4.875, 0.025)
# The first and last pad of each row would come 0.113 mm from the corner pad of the next row, diagonally
# across the corner; JLCPCB asks 0.15 mm between pads of different nets. Those eight pads end 0.04 mm
# earlier on the inside (0.163 mm across the corner); the heel of the lead keeps 0.11 mm of pad beyond it.
# The converter rounded the positions to 0.01 mm, which made some gaps 0.14 mm: every pad goes back onto
# the 0.35 mm grid, 26 to a row centred on the package.
P4_CORNER_PADS, P4_CORNER_TRIM, P4_PITCH = {1, 26, 27, 52, 53, 78, 79, 104}, 0.04, 0.35


def p4_signal_pads(tree):
    import math
    length, width, centre, mask = P4_PAD
    for pad in find(tree, 'pad'):
        if not str(pad[1]).isdigit() or not 1 <= int(pad[1]) <= 104:
            continue
        at, size = first(pad, 'at'), first(pad, 'size')
        x, y = float(at[1]), float(at[2])
        trim = P4_CORNER_TRIM if int(pad[1]) in P4_CORNER_PADS else 0.0
        # the converted pads stand 5.0 mm off the centre, earlier runs left them between 4.875 and 4.9: a pad
        # belongs to the row whose offset it has (the other coordinate is at most 4.375)
        row_x = abs(x) > 4.6
        row_y = abs(y) > 4.6
        snap = lambda v: round((round(v / P4_PITCH - 0.5) + 0.5) * P4_PITCH, 4)
        if row_x:
            at[1] = round(math.copysign(centre + trim / 2, x), 4)
            at[2] = snap(y)
        elif row_y:
            at[2] = round(math.copysign(centre + trim / 2, y), 4)
            at[1] = snap(x)
        # the converter wrote some pads turned by 90 degrees and others with width and length swapped
        tall = float(size[2]) > float(size[1])
        size[1], size[2] = (width, length - trim) if tall else (length - trim, width)
        if not first(pad, 'solder_mask_margin'):
            pad.append([Sym('solder_mask_margin'), mask])


MODEL_DIR = '${KIPRJMOD}/lib/attractap.3dshapes/'


def attach_model(tree, name):
    """The footprint's 3D model from kicad/lib/attractap.3dshapes, placed as lib_models.MODELS says."""
    import lib_models
    if name not in lib_models.MODELS:
        return
    _src, off, rot = lib_models.MODELS[name]
    tree[:] = [i for i in tree if not (isinstance(i, list) and i and i[0] == 'model')]
    tree.append([Sym('model'), MODEL_DIR + name + '.stpz', [Sym('offset'), [Sym('xyz')] + list(off)],
                 [Sym('scale'), [Sym('xyz'), 1, 1, 1]], [Sym('rotate'), [Sym('xyz')] + list(rot)]])


def fix_footprint(name, text, fresh=True):
    """Repair two habits of the converter: mechanical holes as plated pads, thermal vias without a number.
    fresh=False: the footprint comes from the project library and has the outline fixes already."""
    tree = loads(text)
    if fresh and name == 'CONN-TH_4P-P3.5-2601-3102':
        fits_wago_250(tree)
    if fresh and name == 'SENSORS-SMD_VCNL4040M3OE':
        proximity_sensor_outline(tree)
    if name.startswith('USB-C_SMD-TYPE-C-31-M-12'):
        usb_c_power_pads(tree)
    if name.startswith('WIFIM-SMD_61P'):
        c6_ground_pads(tree)
    if name.startswith('FPC-SMD_FH12-40S'):
        fpc_signal_pads(tree)
    if name.startswith('VQFN-10_L2.0-W2.0'):
        custom_pad_strokes(tree)
    if name.startswith('QFN-104'):
        p4_signal_pads(tree)
    if name.startswith('BUZ-SMD_4P-L8.5'):
        buzzer_plus_mark(tree)
    trim_silk(tree, name)
    attach_model(tree, name)
    if name.startswith('QFN-104'):
        paste_windows(tree, P4_PASTE_WINDOW, P4_PASTE_PITCH)
    if name.startswith('QFN-32'):
        paste_windows(tree, PHY_PASTE_WINDOW, PHY_PASTE_PITCH, n=2)
    if name.startswith('QFN-40'):
        paste_windows(tree, NFC_PASTE_WINDOW, NFC_PASTE_PITCH)
    if name.startswith('QFN'):
        no_paste_on_plated_holes(tree)
    # The converter marks the inductors as through-hole parts. With that flag a placement export that
    # takes surface-mount parts only would leave them out.
    attr = first(tree, 'attr')
    if attr and name.startswith('IND-SMD') and all(p[2] == 'smd' for p in find(tree, 'pad')):
        attr[1:] = [Sym('smd')]
    ep = None
    for pad in find(tree, 'pad'):
        if str(pad[1]) and first(pad, 'size') and float(first(pad, 'size')[1]) > 2.5 and pad[2] == 'smd':
            ep = ep or str(pad[1])
    for pad in find(tree, 'pad'):
        if str(pad[1]) != '' or pad[2] != 'thru_hole':
            continue
        size, drill = first(pad, 'size'), first(pad, 'drill')
        d = []
        for v in drill[1:]:
            try:
                d.append(float(v))
            except (TypeError, ValueError):
                pass
        if d and abs(float(size[1]) - d[0]) < 0.02:
            pad[2] = Sym('np_thru_hole')                  # plain mounting hole
        elif name.startswith('QFN') and ep:
            pad[1] = ep                                   # thermal via inside the exposed pad
    return dumps(tree) + '\n'


# The LED is KiCad's footprint with its pads 0.1 mm shorter on the side of the cut-out. KiCad's pads end
# 0.25 mm from the relieved corners of the cut-out, and a milled outline may lie 0.2 mm off.
LED_SOURCE = ('LED_SMD', 'LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount')
LED_NAME, LED_PAD_TRIM = 'LED_SK6812MINI-E_ReverseMount_Clear', 0.1


def led_footprint():
    lib = os.environ.get('KICAD10_FOOTPRINT_DIR')
    if not lib:
        raise SystemExit('KICAD10_FOOTPRINT_DIR is not set (source tools/kicad-env.sh)')
    text = open(os.path.join(lib, LED_SOURCE[0] + '.pretty', LED_SOURCE[1] + '.kicad_mod'), encoding='utf-8').read()
    tree = loads(text)
    tree[1] = LED_NAME
    attach_model(tree, LED_NAME)
    for pad in find(tree, 'pad'):
        at, size = first(pad, 'at'), first(pad, 'size')
        x = float(at[1])
        size[1] = round(float(size[1]) - LED_PAD_TRIM, 3)
        at[1] = round(x + (LED_PAD_TRIM / 2 if x > 0 else -LED_PAD_TRIM / 2), 3)
    return dumps(tree) + '\n'


def refit():
    """Apply fix_footprint() and the generated footprints again to the library that is in the project,
    without the converter's output. Every fix leaves a footprint alone that already has it."""
    folder = os.path.join(LIB, NICK + '.pretty')
    for file in sorted(os.listdir(folder)):
        name = file[:-len('.kicad_mod')]
        path = os.path.join(folder, file)
        if name == 'NFC_Antenna_4T':
            new = antenna_footprint()
        elif name == LED_NAME:
            continue
        elif name == y2_footprint()[0]:
            new = y2_footprint()[1]
        else:
            new = fix_footprint(name, open(path, encoding='utf-8').read(), fresh=False)
        if new != open(path, encoding='utf-8').read():
            open(path, 'w', encoding='utf-8').write(new)
            print('updated', file)
    open(os.path.join(folder, LED_NAME + '.kicad_mod'), 'w', encoding='utf-8').write(led_footprint())
    print('wrote', LED_NAME)
    name, text = y2_footprint()
    open(os.path.join(folder, name + '.kicad_mod'), 'w', encoding='utf-8').write(text)
    write_derived()


def main(src):
    d = design_mod.build()
    os.makedirs(os.path.join(LIB, NICK + '.pretty'), exist_ok=True)
    fps = sorted({p.fp.split(':', 1)[1] for p in d.parts.values() if p.fp.startswith(NICK + ':')})
    syms = sorted({p.sym.split(':', 1)[1] for p in d.parts.values() if p.sym.startswith(NICK + ':')})
    for name in fps:
        dst = os.path.join(LIB, NICK + '.pretty', name + '.kicad_mod')
        if name == 'NFC_Antenna_4T':
            open(dst, 'w', encoding='utf-8').write(antenna_footprint())
            continue
        if name == LED_NAME:
            open(dst, 'w', encoding='utf-8').write(led_footprint())
            continue
        if name == y2_footprint()[0]:
            open(dst, 'w', encoding='utf-8').write(y2_footprint()[1])
            continue
        text = open(os.path.join(src, 'lcsc.pretty', name + '.kicad_mod'), encoding='utf-8').read()
        # 3D models are not shipped in the repository
        text = re.sub(r'\n\s*\(model [^\n]*\n(?:[^\n]*\n)*?\s*\)\n(?=\))', '\n', text)
        text = fix_footprint(name, text)
        open(dst, 'w', encoding='utf-8').write(text)
    lib = loads(open(os.path.join(src, 'lcsc.kicad_sym'), encoding='utf-8').read())
    have = {s[1]: s for s in find(lib, 'symbol')}
    out = [Sym('kicad_symbol_lib')] + [i for i in lib[1:] if not (isinstance(i, list) and i[0] == 'symbol')]
    for name in syms:
        if name not in have:            # drawn by derived_symbols() below
            continue
        s = have[name]
        if name == 'ESP32-P4NRW32X':
            s = multi_unit_symbol(name, s, P4_UNITS, NICK + ':QFN-104_L10.0-W10.0-P0.35-TL-EP7.5', 'C54540373')
        for prop in find(s, 'property'):
            if prop[1] == 'Footprint':
                prop[2] = FOOTPRINT_OVERRIDE.get(name, prop[2].replace('lcsc:', NICK + ':'))
        # Arcs in these old-format symbols make KiCad report "symbol doesn't match copy in library"
        # (they are rebuilt with rounding on every load). They are decoration only.
        for sub in find(s, 'symbol'):
            sub[:] = [item for item in sub if not (isinstance(item, list) and item and item[0] == 'arc')]
        out.append(s)
    text = dumps(out) + '\n'
    text = text.replace('CATHODE(SENSOE)', 'CATHODE(SENSOR)')     # a typing error in the VCNL4040's symbol
    # the converted symbols carry no pin types; 'passive' keeps the electrical rule check quiet
    for kind in ('unspecified', 'power_in', 'power_out', 'input', 'output', 'bidirectional'):
        text = text.replace('(pin %s ' % kind, '(pin passive ')
    open(os.path.join(LIB, NICK + '.kicad_sym'), 'w', encoding='utf-8').write(text)
    write_derived()
    proj = os.path.dirname(LIB)
    open(os.path.join(proj, 'sym-lib-table'), 'w').write(
        '(sym_lib_table\n  (version 7)\n  (lib (name "%s")(type "KiCad")(uri "${KIPRJMOD}/lib/%s.kicad_sym")'
        '(options "")(descr "Attractap project symbols"))\n)\n' % (NICK, NICK))
    open(os.path.join(proj, 'fp-lib-table'), 'w').write(
        '(fp_lib_table\n  (version 7)\n  (lib (name "%s")(type "KiCad")(uri "${KIPRJMOD}/lib/%s.pretty")'
        '(options "")(descr "Attractap project footprints"))\n)\n' % (NICK, NICK))
    print('%d footprints, %d symbols -> %s' % (len(fps), len(syms), LIB))


if __name__ == '__main__':
    if sys.argv[1:] == ['--refit']:
        refit()
    else:
        main(sys.argv[1])
