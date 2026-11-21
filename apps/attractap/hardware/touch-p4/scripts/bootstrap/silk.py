"""Silkscreen: logo, labels, the GPIO map and notes.

The component side is what one sees with the reader off its dock, so it carries what helps there:
grouped test point labels, connector labels with their limits, the GPIO map and where the documents
are. The display side is hidden in the finished reader; it carries the assembly hints for the display
(ground pads, the jack's pins) and a note for whoever takes the display off.

Texts are at least 0.9 mm high with 0.15 mm lines, which JLCPCB prints. Everything is placed by hand on
free board area; check() names any text that lies on a pad, on another text or off the board.
"""
import os
import re

import pcbnew

import geometry as G
from board import V, mm, unV
from circuit_core import P4_GPIO

FRONT, BACK = pcbnew.F_SilkS, pcbnew.B_SilkS
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'case', 'logo')
URL = 'github.com/Attraccess/Attraccess'
LINE = 0.15
ALIGN = {'l': pcbnew.GR_TEXT_H_ALIGN_LEFT, 'c': pcbnew.GR_TEXT_H_ALIGN_CENTER, 'r': pcbnew.GR_TEXT_H_ALIGN_RIGHT}

# Test points: label and where it goes ('r': right of the pad, 'l': left of it, 'b': below it, 'a': above it).
TEST_POINTS = {
    'TP801': ('5V', 'r'), 'TP802': ('3V3', 'r'), 'TP803': ('VDD_HP', 'r'), 'TP804': ('GND', 'b'),
    'TP805': ('GND', 'b'),
    'TP806': ('EN', 'r'), 'TP807': ('BOOT', 'r'), 'TP808': ('TX0', 'r'), 'TP809': ('RX0', 'r'),
    'TP810': ('EN', 'a'), 'TP811': ('BOOT', 'b'), 'TP812': ('TX', 'a'), 'TP813': ('RX', 'b'),
    'TP814': ('INT', 'l'),
}


class Silk:
    def __init__(self, B):
        self.B, self.b = B, B.b
        self.texts = []

    def text(self, s, x, y, size=1.0, layer=FRONT, align='c', rot=0, tag=False):
        """A text centred on y. `tag`: white box with the text left open (for group names)."""
        t = pcbnew.PCB_TEXT(self.b)
        t.SetText(s)
        t.SetLayer(layer)
        t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
        t.SetTextThickness(mm(LINE))
        t.SetTextAngleDegrees(rot)
        t.SetIsKnockout(tag)
        if layer == BACK:                 # read from the other side: mirrored, and left is right there
            t.SetMirrored(True)
            align = {'l': 'r', 'r': 'l'}.get(align, align)
        t.SetHorizJustify(ALIGN[align])
        t.SetPosition(V(x, y))
        self.b.Add(t)
        self.texts.append(t)
        return t

    def line(self, pts, layer=FRONT, dash=None):
        """A polyline; dash=(on, off) draws it broken."""
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            pieces = [(0.0, length)]
            if dash:
                on, off = dash
                pieces = [(a, min(a + on, length)) for a in (k * (on + off) for k in range(int(length / (on + off)) + 1))
                          if a < length]
            for a, c in pieces:
                s = pcbnew.PCB_SHAPE(self.b)
                s.SetShape(pcbnew.SHAPE_T_SEGMENT)
                s.SetStart(V(x1 + (x2 - x1) * a / length, y1 + (y2 - y1) * a / length))
                s.SetEnd(V(x1 + (x2 - x1) * c / length, y1 + (y2 - y1) * c / length))
                s.SetLayer(layer)
                s.SetWidth(mm(LINE))
                self.b.Add(s)

    def field(self, x1, y1, x2, y2, layer=FRONT):
        """A white field to write on."""
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_RECT)
        s.SetStart(V(x1, y1))
        s.SetEnd(V(x2, y2))
        s.SetLayer(layer)
        s.SetFilled(True)
        s.SetWidth(0)
        self.b.Add(s)

    def logo(self, name, x, y, height, layer=FRONT):
        """The shapes of an SVG file of the case's logo folder as filled areas, `height` mm tall, with
        the upper left corner at x, y. Returns the width."""
        outlines, (svg_w, svg_h) = svg_outlines(name)
        k = height / svg_h
        width = svg_w * k
        place = (lambda px, py: (x + width - px * k, y + py * k)) if layer == BACK else (lambda px, py: (x + px * k, y + py * k))
        for outer, holes in nested(outlines):
            poly = pcbnew.SHAPE_POLY_SET()
            poly.NewOutline()
            for p in outer:
                poly.Append(*self._iu(place(*p)))
            for hole in holes:
                index = poly.NewHole()
                for p in hole:
                    poly.Append(*self._iu(place(*p)), -1, index)
            s = pcbnew.PCB_SHAPE(self.b)
            s.SetShape(pcbnew.SHAPE_T_POLY)
            s.SetPolyShape(poly)
            s.SetFilled(True)
            s.SetWidth(0)
            s.SetLayer(layer)
            self.b.Add(s)
        return width

    @staticmethod
    def _iu(point):
        v = V(*point)
        return v.x, v.y


def svg_outlines(name):
    """([closed outline as points], (width, height)) of an SVG file, in its own units. The logo files
    use only absolute M, L, C and Z commands and a shift per path."""
    svg = open(os.path.join(LOGO, name), encoding='utf-8').read()
    size = tuple(float(v) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg).groups())
    outlines = []
    for m in re.finditer(r'<path transform="matrix\(1 0 0 1 ([-\d.]+) ([-\d.]+)\)" d="([^"]+)"', svg):
        dx, dy = float(m.group(1)), float(m.group(2))
        command, numbers, points = None, [], []
        for token in re.findall(r'[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?', m.group(3)) + ['M']:
            if not token.isalpha():
                numbers.append(float(token))
                continue
            pairs = [(numbers[i] + dx, numbers[i + 1] + dy) for i in range(0, len(numbers) - 1, 2)]
            if command in ('M', 'L'):
                points += pairs
            elif command == 'C':
                for i in range(0, len(pairs) - 2, 3):
                    points += bezier(points[-1], *pairs[i:i + 3])
            if token in ('Z', 'M') and len(points) > 2:
                outlines.append(points)
            if token in ('Z', 'M'):
                points = []
            command, numbers = token, []
    return outlines, size


def bezier(p0, p1, p2, p3, steps=10):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def inside(point, outline):
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(outline, outline[1:] + outline[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (x2 - x1) * (y - y1) / (y2 - y1):
            hit = not hit
    return hit


def nested(outlines):
    """[(outer outline, [its holes])]: an outline that lies wholly inside another one is a hole of it.
    (Outlines that only overlap, like the two parts of the keyhole, are each drawn.)"""
    def within(a, c):
        return a is not c and all(inside(p, c) for p in a)

    outer = [o for o in outlines if not any(within(o, other) for other in outlines)]
    return [(o, [h for h in outlines if within(h, o)]) for o in outer]


def gpio(net):
    return next(n for n, name in P4_GPIO.items() if name in (net, net + '_M'))


def gpio_map(S, x, y, pitch=1.75):
    """The pins a firmware developer looks up first. The numbers come from the circuit description."""
    g = gpio
    rows = [
        ('UART0', 'TX %d' % g('UART0_TX'), 'RX %d' % g('UART0_RX'), '115200 8N1'),
        ('I2C0', 'SCL %d' % g('I2C0_SCL'), 'SDA %d' % g('I2C0_SDA'), '0x20 IO EXP'),
        ('TOUCH', 'INT %d' % g('TP_INT'), 'RST %d' % g('TP_RST'), '0x5D / 0x14'),
        ('I2C1', 'SCL %d' % g('NFC_SCL'), 'SDA %d' % g('NFC_SDA'), '0x24 PN532'),
        ('NFC', 'IRQ %d' % g('NFC_IRQ'), 'RST %d' % g('NFC_RST'), ''),
        ('LED', 'DIN %d' % g('LED_DATA'), '8x SK6812', ''),
        ('BUZZER', 'IO %d' % g('BUZZER'), '2.7 KHZ', ''),
        ('BACKLIGHT', '', 'PWM %d' % g('BL_PWM'), ''),
        ('C6', 'EN %d' % g('C6_EN'), 'SDIO %d-%d' % (g('SDIO_D0'), g('SDIO_CMD')), ''),
    ]
    for i, row in enumerate(rows):
        for dx, cell in zip((0.0, 8.0, 15.2, 23.2), row):
            if cell:
                S.text(cell, x + dx, y + i * pitch, align='l')
    return y + len(rows) * pitch


def component_side(S):
    B = S.B
    # ---- test points, in groups
    for ref, (label, where) in TEST_POINTS.items():
        x, y = unV(B.fp[ref].GetPosition())
        if where in 'rl':
            S.text(label, x + (1.7 if where == 'r' else -1.7), y, align='l' if where == 'r' else 'r')
        else:
            S.text(label, x, y + (1.8 if where == 'b' else -1.8), 0.9)
    S.text('C6', 10.4, 11.2, 0.9, tag=True)
    S.text('P4 UART0', 13.4, 18.55, 0.9, align='l', tag=True)
    S.text('115200 8N1', 16.3, 32.5, 0.9, align='l')
    S.text('POWER', 24.75, 22.1, 0.9, align='l', tag=True)
    # ---- buttons
    for ref, label in (('SW201', 'RST'), ('SW202', 'BOOT')):
        x, y = unV(B.fp[ref].GetPosition())
        S.text(label, x + 5.6, y)
    S.text('HOLD BOOT, TAP RST:', 1.3, 34.2, 0.9, align='l')
    S.text('DOWNLOAD MODE', 1.3, 35.8, 0.9, align='l')
    # ---- a field for a serial number or a note
    S.text('S/N', 16.0, 40.0, 0.9, align='l')
    S.field(16.0, 41.0, 28.0, 46.0)
    # ---- tamper sensors
    hx, hy = G.HALL
    S.text('DOCK', hx, hy + 2.75, 0.9)
    S.text('ACCEL', 6.0, 45.4, 0.9)
    # ---- connectors
    S.text('USB-C', 82.3, 9.2)
    S.text('SERVICE', 82.3, 10.9, 0.9)
    S.text('12-24V DC', 6.1, 90.7)
    for num, mark in (('1', '+'), ('2', '-')):
        x, y = min(B.pads_num('J103', num), key=lambda p: p[1])
        S.text(mark, x, y - 3.6)
    S.text('DISPLAY FLEX', 43.85, 74.0)
    S.text('FLEX FOLDS OVER THIS AREA', 36.75, 82.5)
    S.text('ANTENNA ZONE', 36.6, 2.2, 0.9)
    S.text('NO METAL HERE', 36.6, 3.9, 0.9)
    # ---- 48 V side: its border beside the Ethernet pair, and its name
    x48 = G.POE_PRIMARY[0][0]
    S.line([(x48, 57.4), (x48, G.JACK_REAR_CLEAR_Y + 0.4)], dash=(1.0, 0.7))
    S.text('PoE 48V', x48 + 1.4, 64.4, 0.9, rot=90)
    # ---- LED numbers as the firmware counts them
    for i, x in enumerate(G.LED_X):
        S.text(str(i), x, G.LED_Y_TOP + 3.15, 0.9)
        S.text(str(7 - i), x, G.LED_Y_BOT - 3.0, 0.9)
    # ---- the free area behind the NFC loop: name, GPIO map, where to read more
    left, mid = 28.5, G.ANT_C[0]
    S.logo('attraccess-keyhole.svg', left, 100.9, 7.0)
    S.logo('attraccess-wordmark.svg', 33.8, 101.2, 3.4)
    S.text('ATTRACTAP TOUCH P4', 33.8, 106.9, 1.2, align='l')
    S.text('REV A', 60.6, 106.9, 0.9, align='r', tag=True)
    S.line([(left, 109.3), (60.6, 109.3)])
    bottom = gpio_map(S, left, 111.2)
    S.line([(left, bottom + 0.1), (60.6, bottom + 0.1)])
    S.text('NO USER SERVICEABLE PARTS INSIDE.', mid, bottom + 2.0)
    S.text('JUST KIDDING. EVERYTHING IS.', mid, bottom + 3.7)
    S.text(URL, mid, bottom + 6.3)


def display_side(S):
    # ---- hidden behind the display: for whoever takes it off
    S.logo('attraccess-wordmark.svg', 23.0, 58.2, 5.94, BACK)
    S.text('IF YOU CAN READ THIS, THE DISPLAY IS OFF.', 43.0, 67.0, layer=BACK)
    S.text('MIND THE FLEX.', 43.0, 68.8, layer=BACK)
    # ---- assembly hints
    for x, y in G.LCD_GROUND_PADS:
        S.text('GND PAD', x, y - 3.5, 0.9, BACK)
    S.text('GND PADS: CONDUCTIVE TAPE TO THE LCD BACK', 43.0, 28.0, 0.9, BACK)
    S.text('CLIP PINS TO 1 MM', G.JACK_X - 0.8, G.JACK_Y - 9.9, 0.9, BACK)
    S.text('48V', G.JACK_X + 7.5, G.JACK_Y - 6.9, 0.9, BACK)
    # ---- JLCPCB prints its order number in place of this text (order option "Specify a location")
    S.text('JLCJLCJLCJLC', 20.0, 86.0, layer=BACK)
    # ---- LED numbers, and the tap point in the middle of the loop
    for i, x in enumerate(G.LED_X):
        S.text(str(i), x + 3.0, G.LED_Y_TOP, 0.9, BACK)
        S.text(str(7 - i), x + 3.0, G.LED_Y_BOT, 0.9, BACK)
    ax, ay = G.ANT_C
    S.logo('attraccess-keyhole.svg', ax - 2.25, ay - 7.5, 9.0, BACK)
    S.text('NFC 13.56 MHZ', ax, ay + 4.2, 0.9, BACK)


def silkscreen(B):
    S = Silk(B)
    component_side(S)
    display_side(S)
    return S


def check(S):
    """Texts that lie on a pad of their side, on another text, or off the board: [(text, reason)]."""
    def box(item, grow=0.0):
        bb = item.GetBoundingBox()
        (x1, y1), (x2, y2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
        return x1 - grow, y1 - grow, x2 + grow, y2 + grow

    def overlap(a, c):
        return a[0] < c[2] and c[0] < a[2] and a[1] < c[3] and c[1] < a[3]

    w, h = G.LED_CUTOUT
    holes = [(G.NOTCH_X, G.NOTCH_Y, G.BOARD_W, G.BOARD_H), (0, G.POCKET_Y, G.POCKET_X, G.BOARD_H), G.SLOT,
             (G.C6_NOTCH[0], 0, G.C6_NOTCH[1], G.C6_NOTCH[2])]
    holes += [(x - w / 2, y - h / 2, x + w / 2, y + h / 2) for y in (G.LED_Y_TOP, G.LED_Y_BOT) for x in G.LED_X]
    pads = {FRONT: [], BACK: []}
    for fp in S.b.GetFootprints():
        for pad in fp.Pads():
            for layer, copper in ((FRONT, pcbnew.F_Cu), (BACK, pcbnew.B_Cu)):
                if pad.IsOnLayer(copper) or pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                    pads[layer].append((fp.GetReference(), box(pad)))
    bad = []
    for i, t in enumerate(S.texts):
        me = box(t)
        if me[0] < 0.3 or me[1] < 0.3 or me[2] > G.BOARD_W - 0.3 or me[3] > G.BOARD_H - 0.3:
            bad.append((t.GetText(), 'at the board edge'))
        bad += [(t.GetText(), 'on a cut-out') for hole in holes if overlap(me, (hole[0] - 0.3, hole[1] - 0.3, hole[2] + 0.3, hole[3] + 0.3))]
        bad += [(t.GetText(), 'on a pad of ' + ref) for ref, pad in pads[t.GetLayer()] if overlap(me, pad)]
        bad += [(t.GetText(), 'on the text ' + o.GetText()) for o in S.texts[i + 1:]
                if o.GetLayer() == t.GetLayer() and overlap(me, box(o))]
    return bad
