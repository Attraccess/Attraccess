"""Silkscreen of the project's footprints: cut back from each footprint's own pads, and from the board
edge or the neighbours' pads where SILK_KEEP_IN says so. make_lib.fix_footprint() applies it."""

from sexpr import Sym, find, first


# Silkscreen keeps this far from every opening in the solder mask of the footprint's own pads (JLCPCB asks
# for 0.15 mm; KiCad flags any silk that a mask opening would clip). Lines are cut back, arcs and circles that
# reach a pad become lines and are cut the same way, a filled marker or polygon on a pad goes.
SILK_TO_PAD = 0.15
# Connectors that overhang the board edge by design: their silk ends at the edge, in footprint coordinates
# (x1, y1, x2, y2 of the part that lies on the board). Worked out from placement.py and geometry.py.
SILK_KEEP_IN = {
    # Ethernet jack, turned 90 degrees at (76.8, 79.5): its body reaches over the edge at y = 92.5
    'RJ45-TH_HY931147C': (-12.6, -99, 99, 99),
    # USB-C, turned 90 degrees at (82.3, 18.0): the receptacle stands out over the right edge (x = 86)
    'USB-C_SMD-TYPE-C-31-M-12_1': (-99, -99, 99, 3.65),
    # DC jack, turned 90 degrees at (7.05, 97.3): the plug end lies in the cut-away below y = 107.5, and its left
    # side over the rounded corner of the board there; the outline ends at y = 105.9
    'DC-IN-TH_PJ-002A': (-8.6, -99, 99, 99),
    # DC terminal at (15.5, 100.2): its lower edge lay over the rounded inside corner of the DC cut-away, its right
    # side on the outline of the LED ring's upper left LEDs; the outline ends at y = 107.2 and x = 19.5
    'CONN-TH_4P-P3.5-2601-3102': (-99, -99, 4.0, 7.0),
    # Wi-Fi module (geometry.WIFI_MODULE): its antenna end stands over the cut in the top edge, whose floor
    # lies 7.9 mm above the module's centre; the outline stops 0.5 mm short of it
    'CONN-SMD_ESP32-C5-MINI-1-N4': (-99, -7.4, 99, 99),
    # Small parts whose outline lay outside their pads, where the neighbours' pads are on this board. A
    # crystal of this kind fits its pads only one way or turned half round, which is the same: no silk.
    # A ferrite or an inductor has no polarity. The diode keeps its symbol, the SOT-23-6 its pin 1 dot.
    'CRYSTAL-SMD_4P-L3.2-W2.5-BL': (0, 0, 0, 0),
    'L0805': (-1.6, -99, 1.6, 99),
    'IND-SMD_L3.0-W3.0_SWPA3010S': (-99, -1.5, 99, 1.5),
    'SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR': (-99, -1.4, 99, 1.4),
    'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR': (-99, -1.52, 99, 1.52),
    'SOD-123_L2.7-W1.6-LS3.7-RD-1': (-99, -0.65, 99, 0.65),
    # The fuse's side lines stood 0.5 mm outside its courtyard, on the TVS beside it
    'F1812': (-2.6, -99, 2.6, 99),
}


SILK_MIN_WIDTH = 0.15            # JLCPCB's smallest silkscreen line


def _width(item):
    w = first(item, 'width') or first(first(item, 'stroke') or [], 'width')
    if w and float(w[1]) < SILK_MIN_WIDTH:
        w[1] = SILK_MIN_WIDTH            # widened in the footprint itself, then cut back like any other line
    return float(w[1]) if w else 0.12


def _pad_boxes(tree):
    """Mask openings of the pads on the top side, as boxes in footprint coordinates."""
    import math
    boxes = []
    for pad in find(tree, 'pad'):
        layers = [str(v) for v in (first(pad, 'layers') or [])[1:]]
        if not any(l in ('F.Mask', '*.Mask') for l in layers):
            continue
        at, size = first(pad, 'at'), first(pad, 'size')
        x, y = float(at[1]), float(at[2])
        rot = math.radians(float(at[3])) if len(at) > 3 else 0.0
        w, h = float(size[1]) / 2, float(size[2]) / 2
        pts = [(sx * w, sy * h) for sx in (-1, 1) for sy in (-1, 1)]
        for prim in find(first(pad, 'primitives') or [], 'gr_poly'):
            pts += [(float(p[1]), float(p[2])) for p in find(first(prim, 'pts'), 'xy')]
        rp = [(px * math.cos(rot) + py * math.sin(rot), -px * math.sin(rot) + py * math.cos(rot)) for px, py in pts]
        m = first(pad, 'solder_mask_margin')
        m = max(float(m[1]), 0.0) if m else 0.0
        boxes.append((x + min(p[0] for p in rp) - m, y + min(p[1] for p in rp) - m,
                      x + max(p[0] for p in rp) + m, y + max(p[1] for p in rp) + m))
    return boxes


def _inside(a, b, box):
    """Parameter interval of the segment a-b inside the box (Liang-Barsky), or None."""
    t0, t1 = 0.0, 1.0
    dx, dy = b[0] - a[0], b[1] - a[1]
    for p, q in ((-dx, a[0] - box[0]), (dx, box[2] - a[0]), (-dy, a[1] - box[1]), (dy, box[3] - a[1])):
        if p == 0:
            if q < 0:
                return None
            continue
        r = q / p
        if p < 0:
            t0 = max(t0, r)
        else:
            t1 = min(t1, r)
    return (t0, t1) if t0 < t1 else None


def _keep(a, b, cut, keep_in):
    """Pieces of the segment a-b outside every box in cut and inside keep_in."""
    import math
    gone = [iv for iv in (_inside(a, b, box) for box in cut) if iv]
    if keep_in:
        iv = _inside(a, b, keep_in)
        gone += [(0.0, 1.0)] if not iv else [(0.0, iv[0]), (iv[1], 1.0)]
    gone.sort()
    pieces, t = [], 0.0
    for s, e in gone:
        if s > t:
            pieces.append((t, s))
        t = max(t, e)
    if t < 1.0:
        pieces.append((t, 1.0))
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    return [((a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s), (a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e))
            for s, e in pieces if (e - s) * L >= 0.15]


def _polyline(item):
    """Silk item as a list of points (closed shapes end where they start), or None for text."""
    import math
    kind = item[0]
    if kind == 'fp_line':
        s, e = first(item, 'start'), first(item, 'end')
        return [(float(s[1]), float(s[2])), (float(e[1]), float(e[2]))]
    if kind == 'fp_rect':
        s, e = first(item, 'start'), first(item, 'end')
        x1, y1, x2, y2 = float(s[1]), float(s[2]), float(e[1]), float(e[2])
        return [(x1, y1), (x2, y1), (x2, y2), (x1, y2), (x1, y1)]
    if kind == 'fp_circle':
        c, e = first(item, 'center'), first(item, 'end')
        cx, cy = float(c[1]), float(c[2])
        r = math.hypot(float(e[1]) - cx, float(e[2]) - cy)
        return [(cx + r * math.cos(k * math.pi / 18), cy + r * math.sin(k * math.pi / 18)) for k in range(37)]
    if kind == 'fp_arc':
        if first(item, 'mid'):
            pts = [first(item, k) for k in ('start', 'mid', 'end')]
            (x1, y1), (x2, y2), (x3, y3) = [(float(p[1]), float(p[2])) for p in pts]
            d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
            cx = ((x1 ** 2 + y1 ** 2) * (y2 - y3) + (x2 ** 2 + y2 ** 2) * (y3 - y1) + (x3 ** 2 + y3 ** 2) * (y1 - y2)) / d
            cy = ((x1 ** 2 + y1 ** 2) * (x3 - x2) + (x2 ** 2 + y2 ** 2) * (x1 - x3) + (x3 ** 2 + y3 ** 2) * (x2 - x1)) / d
            a1, a2, a3 = (math.atan2(y - cy, x - cx) for x, y in ((x1, y1), (x2, y2), (x3, y3)))
            sweep = (a3 - a1) % (2 * math.pi)
            if (a2 - a1) % (2 * math.pi) > sweep:
                sweep -= 2 * math.pi
            start = a1
        else:                                     # old format: start is the centre, end the first point
            c, e = first(item, 'start'), first(item, 'end')
            cx, cy = float(c[1]), float(c[2])
            start = math.atan2(float(e[2]) - cy, float(e[1]) - cx)
            sweep = math.radians(float(first(item, 'angle')[1]))
        r = math.hypot(*(lambda p: (float(p[1]) - cx, float(p[2]) - cy))(first(item, 'end')))
        n = max(2, int(abs(sweep) / math.radians(10)) + 1)
        return [(cx + r * math.cos(start + sweep * k / n), cy + r * math.sin(start + sweep * k / n)) for k in range(n + 1)]
    if kind == 'fp_poly':
        return [(float(p[1]), float(p[2])) for p in find(first(item, 'pts'), 'xy')]
    return None


def buzzer_plus_mark(tree):
    """The converter's + beside pad 1 is 2 mm tall and runs into the outline: 1.2 mm, inside it."""
    for text in find(tree, 'fp_text'):
        if str(text[1]) == 'user' and str(text[2]) == '+':
            at, font = first(text, 'at'), first(first(text, 'effects'), 'font')
            at[1:] = [-1.0, 1.4, 90.0]
            size, thick = first(font, 'size'), first(font, 'thickness')
            size[1:] = [1.2, 1.2]
            thick[1] = 0.15


def trim_silk(tree, name):
    """Cut the silkscreen back from the footprint's own pads (and, for SILK_KEEP_IN, to the board)."""
    import math
    pads = _pad_boxes(tree)
    keep_in = SILK_KEEP_IN.get(name)
    out = []
    for item in tree:
        if not (isinstance(item, list) and item and str(item[0]) in ('fp_line', 'fp_rect', 'fp_circle', 'fp_arc', 'fp_poly')
                and str((first(item, 'layer') or [None, ''])[1]) == 'F.SilkS'):
            out.append(item)
            continue
        pts = _polyline(item)
        w = _width(item)
        cut = [(x1 - w / 2 - SILK_TO_PAD, y1 - w / 2 - SILK_TO_PAD, x2 + w / 2 + SILK_TO_PAD, y2 + w / 2 + SILK_TO_PAD)
               for x1, y1, x2, y2 in pads]
        box = (keep_in[0] + w / 2, keep_in[1] + w / 2, keep_in[2] - w / 2, keep_in[3] - w / 2) if keep_in else None
        segs = [(a, b) for a, b in zip(pts, pts[1:]) if a != b]
        length = lambda pieces: sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in pieces)
        hit = any(length(_keep(a, b, cut, box)) < length([(a, b)]) - min(0.01, 0.5 * length([(a, b)]))
                  for a, b in segs)
        if not hit:
            out.append(item)
            continue
        filled = str((first(item, 'fill') or [None, ''])[1]) in ('solid', 'yes')
        if str(item[0]) == 'fp_poly' or filled or (str(item[0]) == 'fp_circle' and w > 0.5 * max(
                abs(p[0] - pts[0][0]) for p in pts)):
            continue                              # a marker or a filled shape on a pad: drop it
        for a, b in segs:
            for p, q in _keep(a, b, cut, box):
                out.append([Sym('fp_line'), [Sym('start'), round(p[0], 3), round(p[1], 3)],
                            [Sym('end'), round(q[0], 3), round(q[1], 3)], [Sym('layer'), Sym('F.SilkS')],
                            [Sym('width'), w]])
    tree[:] = out
