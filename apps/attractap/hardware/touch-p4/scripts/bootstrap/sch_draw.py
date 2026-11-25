"""Drawing engine for the schematic sheets (used by build_sch.py and the sch_*.py layouts).

A layout places the parts of one functional block and draws the wires between them. What a layout
leaves open is finished here: supply pins get a power symbol (supplies point up, ground points
down), the other pins a short wire with a label, unused pins a no-connect flag. Before a sheet is
written, finish() checks that no wire, pin or label joins two nets (the whole check is conservative:
whatever KiCad might take as connected counts as connected), and lint() reports text that overlaps
other text, a symbol or a wire, so a layout can be fixed before anyone has to read it.

Coordinates are millimetres on the sheet, y down, on the 1.27 mm grid.
"""
import math
import uuid

import libs
from sexpr import Sym as S, find, first

GRID = 1.27
P = 2.54                                   # pin pitch; the usual length of a stub
POWER = {'GND': 'power:GND', '+3V3': 'power:+3V3', '+5V': 'power:+5V'}
SIDE = {0: 'L', 90: 'D', 180: 'R', 270: 'U'}
DIR = {'L': (-1, 0), 'R': (1, 0), 'U': (0, -1), 'D': (0, 1)}
NS = uuid.UUID('6f1f0d6e-2c55-4d0e-9a3d-41747472ac70')
CHAR = 1.0                                 # width of a character of KiCad's font, in text heights (with spacing)


def uid(*parts):
    return str(uuid.uuid5(NS, '/'.join(parts)))


def snap(v):
    return round(round(v / GRID) * GRID, 4)


def key(x, y):
    return (round(x, 2), round(y, 2))


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


def tf(x, y, angle, px, py):
    """A point of a library symbol (y up) on the sheet (y down) for a symbol at x, y turned by angle."""
    r = math.radians(angle)
    rx, ry = px * math.cos(r) - py * math.sin(r), px * math.sin(r) + py * math.cos(r)
    return round(x + rx, 4), round(y - ry, 4)


def text_box(s, x, y, size, justify='center', angle=0):
    """Rough extent of a text: KiCad's stroke font is about 0.8 text heights per character."""
    w, h = max(len(s), 1) * size * CHAR, size * 1.25
    if angle in (90, 270):
        w, h = h, w
        x1 = x - w / 2
        y1 = {'left': y - h, 'right': y}.get(justify, y - h / 2)
        return (x1, y1, x1 + w, y1 + h)
    x1 = {'left': x, 'right': x - w}.get(justify, x - w / 2)
    return (x1, y - h / 2, x1 + w, y + h / 2)


def overlap(a, b, gap=0.0):
    return a[0] < b[2] + gap and b[0] < a[2] + gap and a[1] < b[3] + gap and b[1] < a[3] + gap


def body_box(sym, unit):
    """Extent of a symbol unit's drawing (without pins) in library coordinates: x1, y1, x2, y2 (y up)."""
    xs, ys = [], []
    for sub in find(sym, 'symbol'):
        u = int(sub[1].rsplit('_', 2)[-2])
        if u not in (0, unit):
            continue
        for item in sub[2:]:
            if not isinstance(item, list) or not item:
                continue
            tag = str(item[0])
            if tag == 'rectangle':
                for k in ('start', 'end'):
                    xs.append(float(first(item, k)[1])); ys.append(float(first(item, k)[2]))
            elif tag in ('polyline', 'bezier'):
                for xy in find(first(item, 'pts'), 'xy'):
                    xs.append(float(xy[1])); ys.append(float(xy[2]))
            elif tag == 'circle':
                c, r = first(item, 'center'), float(first(item, 'radius')[1])
                xs += [float(c[1]) - r, float(c[1]) + r]; ys += [float(c[2]) - r, float(c[2]) + r]
            elif tag == 'arc':
                for k in ('start', 'mid', 'end'):
                    xs.append(float(first(item, k)[1])); ys.append(float(first(item, k)[2]))
    if not xs:
        return (-1.0, -1.0, 1.0, 1.0)
    return (min(xs), min(ys), max(xs), max(ys))


def _hidden(node):
    h = first(node, 'hide') if node else None
    return bool(h) and (len(h) < 2 or str(h[1]) == 'yes')


def pin_text_boxes(sym, unit):
    """Where KiCad writes the pin names and numbers of a unit, in library coordinates (y up):
    [(pin number, kind, (x1, y1, x2, y2))]. Names inside the body when the symbol has a name offset,
    above the pin otherwise; numbers along the pin."""
    pn, pnum = first(sym, 'pin_names'), first(sym, 'pin_numbers')
    offset = float(first(pn, 'offset')[1]) if pn and first(pn, 'offset') else 0.508
    names_hidden = _hidden(pn) if pn else False
    numbers_hidden = _hidden(pnum) if pnum else False
    out = []
    for sub in find(sym, 'symbol'):
        u = int(sub[1].rsplit('_', 2)[-2])
        if u not in (0, unit):
            continue
        for p in find(sub, 'pin'):
            if _hidden(p):
                continue
            at = first(p, 'at')
            x, y, ang = float(at[1]), float(at[2]), float(at[3]) if len(at) > 3 else 0.0
            ln = float(first(p, 'length')[1]) if first(p, 'length') else 0.0
            dx, dy = round(math.cos(math.radians(ang))), round(math.sin(math.radians(ang)))
            name, num = first(p, 'name'), first(p, 'number')
            nsize = float(first(first(first(name, 'effects'), 'font'), 'size')[1]) if first(name, 'effects') else 1.27
            msize = float(first(first(first(num, 'effects'), 'font'), 'size')[1]) if first(num, 'effects') else 1.27
            text, number = str(name[1]), str(num[1])
            ex, ey = x + dx * ln, y + dy * ln                    # inner end of the pin
            mx, my = x + dx * ln / 2, y + dy * ln / 2            # middle of the pin
            horizontal = dy == 0

            def box(cx, cy, along, across):
                return ((cx - along / 2, cy - across / 2, cx + along / 2, cy + across / 2) if horizontal
                        else (cx - across / 2, cy - along / 2, cx + across / 2, cy + along / 2))
            if text not in ('', '~') and not names_hidden:
                w = len(text) * nsize * CHAR
                if offset > 0:
                    c = (ex + dx * (offset + w / 2), ey + dy * (offset + w / 2))
                    out.append((str(number), 'name', box(c[0], c[1], w, nsize * 1.1)))
                else:
                    nx, ny = (0, 1) if horizontal else (-1, 0)
                    c = (mx + nx * (nsize * 0.6 + 0.25), my + ny * (nsize * 0.6 + 0.25))
                    out.append((str(number), 'name', box(c[0], c[1], w, nsize * 1.1)))
            if not numbers_hidden:
                w = len(number) * msize * CHAR
                nx, ny = (0, 1) if horizontal else (-1, 0)
                side = 1 if offset > 0 or text in ('', '~') or names_hidden else -1
                c = (mx + side * nx * (msize * 0.6 + 0.25), my + side * ny * (msize * 0.6 + 0.25))
                out.append((str(number), 'number', box(c[0], c[1], w, msize * 1.1)))
    return out


def is_box(sym, unit):
    """Does the unit's drawing consist of a rectangle (a box symbol, with room for text inside)?"""
    for sub in find(sym, 'symbol'):
        u = int(sub[1].rsplit('_', 2)[-2])
        if u in (0, unit) and find(sub, 'rectangle'):
            return True
    return False


class Unit:
    """One placed symbol unit: its pins on the sheet and the box its drawing takes."""

    def __init__(self, part, unit, x, y, angle, sym, mirror=False):
        """mirror: flipped left to right (KiCad's "mirror y"), then turned by angle."""
        self.part, self.unit, self.x, self.y, self.angle, self.mirror = part, unit, x, y, angle, mirror
        self.pins = {}
        self.pin_lines = []                        # the drawn pin lines: (x1, y1, x2, y2)
        m = -1 if mirror else 1
        for num, name, px, py, pang, plen, u in libs.symbol_pins(sym):
            if u not in (0, unit) and len({p[6] for p in libs.symbol_pins(sym)}) > 1:
                continue
            ex, ey = px + plen * round(math.cos(math.radians(pang))), py + plen * round(math.sin(math.radians(pang)))
            if mirror:
                pang = 180 - pang
            side = SIDE[int(round(pang + angle)) % 360]
            self.pins[num] = tf(x, y, angle, m * px, py) + (side, name)
            self.pin_lines.append(tf(x, y, angle, m * px, py) + tf(x, y, angle, m * ex, ey))
        self.pin_text = []
        for num, kind, (tx1, ty1, tx2, ty2) in pin_text_boxes(sym, unit):
            corners = [tf(x, y, angle, m * cx, cy) for cx in (tx1, tx2) for cy in (ty1, ty2)]
            self.pin_text.append((num, kind, (min(c[0] for c in corners), min(c[1] for c in corners),
                                              max(c[0] for c in corners), max(c[1] for c in corners))))
        self.boxed = is_box(sym, unit)
        bx1, by1, bx2, by2 = body_box(sym, unit)
        if mirror:
            bx1, bx2 = -bx2, -bx1
        corners = [tf(x, y, angle, bx, by) for bx in (bx1, bx2) for by in (by1, by2)]
        self.body = (min(c[0] for c in corners), min(c[1] for c in corners),
                     max(c[0] for c in corners), max(c[1] for c in corners))
        self.fields = {}                           # name -> (x, y, angle, justify)
        jp = first(sym, 'jumper_pin_groups')
        self.jumpers = [tuple(str(n) for n in g) for g in jp[1:]] if jp else []

    def pin(self, num):
        return self.pins[str(num)][:2]


class Canvas:
    """The drawing of one sheet: symbols, wires, labels and texts, kept as plain data until write()."""

    def __init__(self, key_, page, scope, net_pins):
        self.key, self.page = key_, page
        self.scope = scope                         # net -> 'power' | 'hier' | 'local'
        self.net_pins = net_pins                   # net -> number of pins on the whole schematic
        self.units = {}                            # (ref, unit) -> Unit
        self.wires = []                            # (x1, y1, x2, y2)
        self.anchors = []                          # (x, y, net, kind): labels and power symbols
        self.ncs = []
        self.texts = []                            # (string, x, y, size, bold, justify)
        self.frames = []                           # (x1, y1, x2, y2)
        self.powers = []                           # (net, x, y, angle)
        self.labels = []                           # (net, x, y, side, kind)
        self.lib = {}
        self.parts = {}
        self.block = None                          # the functional block being drawn: its frame encloses
        self.blocks = []                           # everything added while it is current
        self.owner = {'wire': [], 'label': [], 'power': []}
        self.flags = []                            # PWR_FLAG symbols: (net, x, y)
        self.owned_texts = []                      # notes inside a block: (text item, block)

    def begin(self, title):
        self.block = title
        self.blocks.append(title)

    # ---- symbols
    def use(self, libid):
        if libid not in self.lib:
            s = libs.symbol(libid)
            s[1] = libid
            self.lib[libid] = s
        return self.lib[libid]

    def put(self, part, x, y, angle=0, unit=1, fields=None, mirror=False, note=False):
        """Place a part (unit) with its origin at x, y. fields: where ref and value go ('r', 'l', 'a',
        'b', 'in') or {'Reference': (x, y), 'Value': (x, y)} relative to the origin. note: show the
        part's description as a last line (for example the pin a capacitor decouples)."""
        sym = self.use(part.sym)
        u = Unit(part, unit, snap(x), snap(y), angle, sym, mirror)
        u.block = self.block
        u.note = note
        self.units[(part.ref, unit)] = u
        self.parts[part.ref] = part
        self._fields(u, fields)
        return u

    def put_at(self, part, pin, x, y, angle=0, unit=1, fields=None, mirror=False):
        """Place a part so that the given pin lands on x, y."""
        probe = Unit(part, unit, 0, 0, angle, self.use(part.sym), mirror)
        px, py = probe.pin(pin)
        return self.put(part, x - px, y - py, angle, unit, fields, mirror)

    def _fields(self, u, where):
        """Reference, value and (where it matters) rating as a block of lines beside or above the part."""
        lines = [('Reference', u.part.ref), ('Value', u.part.value)]
        if u.part.show_rating:
            lines.append(('Rating', u.part.extra['Rating']))
        if getattr(u, 'note', False) and u.part.desc:
            lines.append(('Description', u.part.desc))
        x1, y1, x2, y2 = u.body
        sides = {s for *_, s, _n in u.pins.values()}
        two = len(u.pins) == 2
        fa = u.angle if u.angle in (90, 270) else 0  # KiCad turns a field with its symbol; this reads level
        if isinstance(where, dict):
            for k, (dx, dy) in where.items():
                u.fields[k] = (u.x + dx, u.y + dy, fa, 'center')
            where = 'r' if len(where) < len(lines) else None
            lines = [ln for ln in lines if ln[0] not in u.fields]
            if not lines:
                return
        if where is None:
            if two and sides <= {'U', 'D'}:
                where = 'r'
            elif two:
                where = 'a'
            elif 'U' not in sides:
                where = 'a'
            elif 'D' not in sides:
                where = 'b'
            else:
                where = 'in'
        step = 1.7
        n = len(lines)
        cx = (x1 + x2) / 2
        for i, (name, s) in enumerate(lines):
            w = len(s) * 1.27 * CHAR
            if where == 'r':
                pos = (x2 + 0.8 + w / 2, u.y + (i - (n - 1) / 2) * step)
            elif where == 'l':
                pos = (x1 - 0.8 - w / 2, u.y + (i - (n - 1) / 2) * step)
            elif where == 'a':
                pos = (cx, y1 - 1.2 - (n - 1 - i) * step)
            elif where == 'tp':
                pos = (x2 + 0.9 + w / 2, u.y - 3.4 + i * step)
            elif where == 'b':
                pos = (cx, y2 + 1.2 + i * step + (1.0 if two and sides == {'L', 'R'} else 0))
            else:                                  # inside a large box, under its top edge
                pos = (cx, y1 + 3.0 + i * step)
            u.fields.setdefault(name, (pos[0], pos[1], fa, 'center'))

    # ---- drawing
    def at(self, spec):
        """'R101.1' -> the pin's point; a tuple stays as it is."""
        if isinstance(spec, str):
            ref, num = spec.split('.', 1)
            unit = next(u for (r, _), u in self.units.items() if r == ref and num in u.pins)
            return unit.pin(num)
        return (snap(spec[0]), snap(spec[1]))

    def wire(self, *pts):
        pts = [self.at(p) for p in pts]
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            if (x1, y1) != (x2, y2):
                assert x1 == x2 or y1 == y2, ('wire not straight', (x1, y1), (x2, y2))
                self.wires.append((x1, y1, x2, y2))
                self.owner['wire'].append(self.block)

    def link(self, a, b, first='h'):
        """An L-shaped wire from a to b: horizontal first ('h') or vertical first ('v')."""
        (x1, y1), (x2, y2) = self.at(a), self.at(b)
        corner = (x2, y1) if first == 'h' else (x1, y2)
        self.wire((x1, y1), corner, (x2, y2))

    def power(self, net, x, y, angle=None):
        """A power symbol with its pin at x, y: supplies point up, ground down, unless angle says otherwise."""
        if angle is None:
            angle = 0
        self.powers.append((net, snap(x), snap(y), angle))
        self.owner['power'].append(self.block)
        self.anchors.append((snap(x), snap(y), net, 'power'))

    def label(self, net, x, y, side):
        """A net label at x, y whose text runs towards side ('L', 'R', 'U', 'D')."""
        kind = 'hier' if self.scope.get(net) == 'hier' else 'local'
        self.labels.append((net, snap(x), snap(y), side, kind))
        self.owner['label'].append(self.block)
        self.anchors.append((snap(x), snap(y), net, kind))

    def out(self, spec, net=None, length=P, side=None):
        """A wire from a pin straight out, and a label (or power symbol) at its end."""
        x, y = self.at(spec)
        if side is None:
            side = self._pin_side(spec)
        net = net or self._pin_net(spec)
        dx, dy = DIR[side]
        ex, ey = snap(x + dx * length), snap(y + dy * length)
        self.wire((x, y), (ex, ey))
        if net in POWER:
            self.power(net, ex, ey)
        else:
            self.label(net, ex, ey, side)
        return ex, ey

    def flag(self, net, x, y):
        """A PWR_FLAG at x, y on a short wire down to a power symbol of the net."""
        x, y = snap(x), snap(y)
        self.flags.append((net, x, y))
        self.wire((x, y), (x, y + 2 * P))
        self.power(net, x, y + 2 * P, 0 if net == 'GND' else 180)

    def text(self, s, x, y, size=1.27, bold=False, justify='left', own=True):
        item = (s, snap(x) if size < 3 else x, y, size, bold, justify)
        self.texts.append(item)
        if own and self.block:
            self.owned_texts.append((item, self.block))

    def frame(self, title, x1, y1, x2, y2):
        self.frames.append((x1, y1, x2, y2))
        self.text(title, x1 + 1.5, y1 + 3.4, 2.0, bold=True, own=False)

    def _pin_side(self, spec):
        ref, num = spec.split('.', 1)
        unit = next(u for (r, _), u in self.units.items() if r == ref and num in u.pins)
        return unit.pins[num][2]

    def _pin_net(self, spec):
        ref, num = spec.split('.', 1)
        return self.parts[ref].nets[num]

    # ---- the usual shapes
    def hang(self, part, x, rail_y, gap=P, fields=None, angle=0, note=False):
        """A two-pin part standing below a horizontal wire at rail_y: pin 1 up, joined to the wire."""
        u = self.put(part, x, rail_y + gap + 3.81, angle, fields=fields, note=note)
        top = min(u.pins.values(), key=lambda p: p[1])
        if gap:
            self.wire((x, rail_y), top[:2])
        return u

    def stand(self, part, x, rail_y, gap=P, fields=None, note=False):
        """A two-pin part standing above a horizontal wire at rail_y: pin 2 down, joined to the wire."""
        u = self.put(part, x, rail_y - gap - 3.81, 0, fields=fields, note=note)
        if gap:
            self.wire((x, rail_y), u.pin('2'))
        return u

    def inline(self, part, x, y, reverse=False, fields=None):
        """A two-pin part lying in a horizontal wire: pin 1 on the left (reverse: on the right)."""
        return self.put(part, x, y, 270 if reverse else 90, fields=fields)

    def diode(self, part, x, y, fields=None):
        """A diode lying in a horizontal wire, anode left: current flows to the right."""
        return self.put(part, x, y, 180, fields=fields)

    def tvs(self, part, x, rail_y, gap=P, fields=None):
        """A diode standing below a rail with its cathode up (TVS, clamp)."""
        u = self.put(part, x, rail_y + gap + 3.81, 270, fields=fields)
        if gap:
            self.wire((x, rail_y), u.pin('1'))
        return u

    def rail(self, net, parts, x, y, pitch=16.51, note=False, end=None, first=7.62):
        """A horizontal supply wire: a power symbol (or a label) for net at x, the parts hanging below it
        one pitch apart. end: a pin or point the wire continues to. Returns the x after the last part."""
        if net in POWER:
            self.power(net, x, y)
        elif net:
            self.label(net, x, y, 'L')
        cx = x + first
        for p in parts:
            self.hang(p, cx, y, note=note)
            cx += pitch
        self.wire((x, y), self.at(end) if end else (cx - pitch, y))
        return cx

    def tp(self, part, x, y, net_side='L', length=7.62):
        """A test point standing at the end of a short wire that starts with a label."""
        net = part.nets['1']
        if net in POWER:
            self.power(net, x, y)
        else:
            self.label(net, x, y, net_side)
        self.wire((x, y), (x + length, y))
        return self.put(part, x + length, y, fields='tp')
