"""Fabrication drawing of the Touch P4 board: outline with dimensions, holes and cut-outs, stack-up,
drill table, smallest features and the fabrication notes. Read from the board file, so it follows
every change; written by export_fab.py into fab/jlcpcb/ (one A3 page).

Usage: fab_drawing.py <board.kicad_pcb> <out.pdf>     (KiCad's Python: it reads the board with pcbnew)
"""
import math
import os
import sys

import pcbnew

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'bootstrap'))
import geometry as G  # noqa: E402
from pdfdoc import Document, text_width  # noqa: E402

DATE = '2026-11-25'
SCALE = 1.5
OX, OY = 30.0, 52.0                          # where the board's top left corner lands on the page
ORIGIN = [0.0, 0.0]                          # the board's top left corner in KiCad's coordinates (datum A)


def mm(v):
    return v / 1e6


def to_page(x, y):
    """A point given from datum A."""
    return OX + x * SCALE, OY + y * SCALE


def bp(p):
    """A board point (KiCad internal units) on the page."""
    return to_page(mm(p.x) - ORIGIN[0], mm(p.y) - ORIGIN[1])


def outline(page, board):
    """The Edge.Cuts drawing: the outline, the flex slot, the LED windows."""
    for d in board.GetDrawings():
        if d.GetLayer() != pcbnew.Edge_Cuts:
            continue
        _shape(page, d)
    for fp in board.GetFootprints():
        for d in fp.GraphicalItems():
            if d.GetLayer() == pcbnew.Edge_Cuts:
                _shape(page, d)
    for x, y, w, h, plated, what in holes(board):         # part holes and slots, not vias
        if what == 'via':
            continue
        cx, cy = to_page(x - ORIGIN[0], y - ORIGIN[1])
        rw, rh = w * SCALE / 2, h * SCALE / 2
        if abs(w - h) < 0.01:
            page.circle(cx, cy, rw, width=0.25, fill=None if plated else 0.85)
        else:
            page.rect(cx - rw, cy - rh, cx + rw, cy + rh, width=0.25)


def _shape(page, d):
    s = d.GetShape()
    if s == pcbnew.SHAPE_T_SEGMENT:
        page.line(*bp(d.GetStart()), *bp(d.GetEnd()), width=0.35)
    elif s == pcbnew.SHAPE_T_ARC:
        c, r = d.GetCenter(), mm(d.GetRadius())
        a0 = math.atan2(d.GetStart().y - c.y, d.GetStart().x - c.x)
        a1 = math.atan2(d.GetEnd().y - c.y, d.GetEnd().x - c.x)
        sweep = math.radians(d.GetArcAngle().AsDegrees())
        if abs((a0 + sweep) - a1) % (2 * math.pi) > 0.01 and abs(abs((a0 + sweep) - a1) % (2 * math.pi) - 2 * math.pi) > 0.01:
            sweep = -sweep
        cx, cy = mm(c.x) - ORIGIN[0], mm(c.y) - ORIGIN[1]
        pts = [to_page(cx + r * math.cos(a0 + sweep * k / 12), cy + r * math.sin(a0 + sweep * k / 12))
               for k in range(13)]
        page.poly(pts, width=0.35, close=False)
    elif s == pcbnew.SHAPE_T_CIRCLE:
        page.circle(*bp(d.GetCenter()), mm(d.GetRadius()) * SCALE, width=0.35)
    elif s == pcbnew.SHAPE_T_RECT:
        page.rect(*bp(d.GetStart()), *bp(d.GetEnd()), width=0.35)
    elif s == pcbnew.SHAPE_T_POLY:
        ps = d.GetPolyShape()
        for i in range(ps.OutlineCount()):
            o = ps.Outline(i)
            page.poly([bp(o.CPoint(k)) for k in range(o.PointCount())], width=0.35)


def holes(board):
    """[(x, y, drill w, drill h, plated, what)] of every hole: pads and vias."""
    out = []
    for fp in board.GetFootprints():
        for p in fp.Pads():
            if p.GetAttribute() in (pcbnew.PAD_ATTRIB_PTH, pcbnew.PAD_ATTRIB_NPTH) and p.GetDrillSize().x > 0:
                ds = p.GetDrillSize()
                out.append((mm(p.GetPosition().x), mm(p.GetPosition().y), mm(ds.x), mm(ds.y),
                            p.GetAttribute() == pcbnew.PAD_ATTRIB_PTH, fp.GetReference()))
    for t in board.GetTracks():
        if t.GetClass() == 'PCB_VIA':
            out.append((mm(t.GetPosition().x), mm(t.GetPosition().y), mm(t.GetDrill()), mm(t.GetDrill()), True, 'via'))
    return out


def smallest(board):
    tracks = [t for t in board.GetTracks() if t.GetClass() == 'PCB_TRACK']
    vias = [t for t in board.GetTracks() if t.GetClass() == 'PCB_VIA']
    ds = board.GetDesignSettings()
    hs = holes(board)
    pth = [h for h in hs if h[4] and h[5] != 'via']
    npth = [h for h in hs if not h[4]]
    slots = [min(h[2], h[3]) for h in hs if abs(h[2] - h[3]) > 0.01]
    return [
        ('Track width', '%.3f mm' % min(mm(t.GetWidth()) for t in tracks)),
        ('Clearance, copper to copper', '%.3f mm (design rule)' % 0.127),
        ('Clearance, copper to board edge', '%.2f mm' % mm(ds.m_CopperEdgeClearance)),
        ('Via, pad / hole', '%.2f / %.2f mm' % (min(mm(v.GetWidth(pcbnew.F_Cu)) for v in vias),
                                                min(mm(v.GetDrill()) for v in vias))),
        ('Via annular ring', '%.3f mm' % min((mm(v.GetWidth(pcbnew.F_Cu)) - mm(v.GetDrill())) / 2 for v in vias)),
        ('Plated hole (parts)', '%.2f mm' % min(min(h[2], h[3]) for h in pth)),
        ('Unplated hole', '%.2f mm' % min(min(h[2], h[3]) for h in npth) if npth else 'none'),
        ('Slot width', '%.2f mm' % min(slots) if slots else 'none'),
        ('Solder mask web', '0.10 mm (between the ESP32-P4 pins, 0.35 mm pitch)'),
        ('Silkscreen text', '1.0 mm high, 0.15 mm line'),
    ]


def drill_table(board):
    groups = {}
    for x, y, w, h, plated, what in holes(board):
        k = (round(min(w, h), 2), round(max(w, h), 2), plated)       # a slot in either direction
        g = groups.setdefault(k, [0, set()])
        g[0] += 1
        g[1].add('vias' if what == 'via' else what)
    rows = []
    for (w, h, plated), (n, kinds) in sorted(groups.items()):
        size = '%.2f' % w if abs(w - h) < 0.01 else '%.2f x %.2f slot' % (min(w, h), max(w, h))
        names = sorted(kinds, key=lambda s: (s == 'vias', s))
        used = ', '.join(names[:4]) + (', ...' if len(names) > 4 else '')
        rows.append((size, 'plated' if plated else 'unplated', str(n), used))
    return rows


def table(page, x, y, title, header, rows, widths, size=2.3):
    page.text(title, x, y, 3.0, bold=True)
    y += 5.0
    cols = [x]
    for w in widths:
        cols.append(cols[-1] + w)
    for i, h in enumerate(header):
        page.text(h, cols[i] + 1.0, y, size, bold=True)
    page.line(x, y + 1.2, cols[-1], y + 1.2, 0.2)
    y += 1.2
    for r in rows:
        y += size * 1.55
        for i, c in enumerate(r):
            page.text(c, cols[i] + 1.0, y, size)
    page.line(x, y + 1.2, cols[-1], y + 1.2, 0.2)
    return y + 6.0


def dims(page):
    """The dimensions a fab and a case designer need, from the datum (top left corner)."""
    W, H = G.BOARD_W, G.BOARD_H
    x0, y0 = to_page(0, 0)
    x1, y1 = to_page(W, H)
    page.arrow(x0, y0 - 8, x1, y0 - 8)
    page.text('%.1f' % W, (x0 + x1) / 2, y0 - 9.5, 2.8, 'c')
    page.arrow(x0 - 10, y0, x0 - 10, y1)
    page.text('%.1f' % H, x0 - 11.5, (y0 + y1) / 2, 2.8, 'c', angle=90)
    nx, ny = to_page(G.NOTCH_X, G.NOTCH_Y)
    page.arrow(x1 + 8, y0, x1 + 8, ny)
    page.text('%.1f' % G.NOTCH_Y, x1 + 10.5, (y0 + ny) / 2, 2.5, 'c', angle=90)
    page.arrow(x0, y1 + 8, nx, y1 + 8)
    page.text('%.1f' % G.NOTCH_X, (x0 + nx) / 2, y1 + 12, 2.5, 'c')
    px, py = to_page(G.POCKET_X, G.POCKET_Y)
    page.arrow(x0 - 4, y0, x0 - 4, py)
    page.text('%.1f' % G.POCKET_Y, x0 - 5.5, (y0 + py) / 2 + 12, 2.2, 'c', angle=90)
    page.text('datum A: top left corner, x right, y down', x0, y0 - 14, 2.3)


def features():
    """Cut-outs and holes, from the datum."""
    s = G.SLOT
    a = G.WIFI_NOTCH
    w, h = G.LED_WINDOW
    rows = [('Flex slot', '%.1f to %.1f' % (s[0], s[2]), '%.1f to %.1f' % (s[1], s[3]),
             '%.1f x %.1f, ends r 1.0' % (s[2] - s[0], s[3] - s[1])),
            ('Cut under the Wi-Fi module', '%.1f to %.1f' % (a[0], a[1]), '0 to %.2f' % a[2],
             'inside corners r 1.0'),
            ('Corner cut-away, right', '%.1f to %.1f' % (G.NOTCH_X, G.BOARD_W), '%.1f to %.1f' % (G.NOTCH_Y, G.BOARD_H),
             'Ethernet plug'),
            ('Corner cut-away, left', '0 to %.1f' % G.POCKET_X, '%.1f to %.1f' % (G.POCKET_Y, G.BOARD_H), 'DC plug'),
            ('LED windows (8)', ', '.join('%.1f' % v for v in G.LED_X), '%.1f, %.1f' % (G.LED_Y_TOP, G.LED_Y_BOT),
             '%.1f x %.1f centred, corner reliefs' % (w, h))]
    for i, (x, y) in enumerate(G.MOUNT_HOLES):
        rows.append(('Mounting hole %d' % (i + 1), '%.1f' % x, '%.1f' % y, '3.2 unplated'))
    rows.append(('Outer corners', '', '', 'r 2.0'))
    return rows


NOTES = [
    'Material FR-4, Tg 155 C or higher, 6 copper layers, 1.6 mm finished thickness +-10 %.',
    'Stack-up JLC06161H-3313 as tabulated: on the JLCPCB order form "Specify Stackup: Yes".',
    'Copper 1 oz (35 um) finished on the outer layers, 0.5 oz (15 um) on the inner layers.',
    'Surface finish ENIG (the 0.35 mm pitch QFN needs a flat finish). Not OSP, not HASL.',
    'Vias: epoxy filled and capped (plated over), required: four lie in capacitor pads (C208, C223, C226).',
    'Solder mask green, both sides; silkscreen white, both sides.',
    'Fabricate and inspect to IPC-6012 class 2 and IPC-A-600 class 2.',
    'Plated slots at the DC jack and the USB-C shell; all other cut-outs milled, unplated.',
    'Outline and cut-out tolerance +-0.2 mm; drill tolerance per the fab\'s standard.',
    'Impedance control +-10 %, outer layers over the first plane (L1/L2, L6/L5): USB pair 90 ohm diff., '
    '0.14 mm / 0.15 mm gap (L6); Ethernet lines 50 ohm, 0.155 mm (L1), in pairs 1.27 mm apart = 100 ohm diff. '
    'Fab may adjust widths.',
    'Electrical test: 100 % flying probe against the IPC-D-356 netlist of this package.',
    'Board marking: JLCPCB serial number in the field beside S/N on the component side, if ordered.',
]


def draw(pcb_path, out):
    board = pcbnew.LoadBoard(pcb_path)
    box = board.GetBoardEdgesBoundingBox()
    ORIGIN[:] = [mm(box.GetLeft()), mm(box.GetTop())]
    doc = Document('Attractap Touch P4 fabrication drawing')
    page = doc.page(420, 297)
    page.rect(8, 8, 412, 289, 0.4)
    page.text('Attractap Touch P4, revision A: fabrication drawing', 14, 20, 5.0, bold=True)
    page.text('All dimensions in mm. Board seen from the component side (KiCad front). Scale %.1f : 1.' % SCALE,
              14, 27, 2.6)
    outline(page, board)
    dims(page)
    x = 190.0
    y = table(page, x, 40, 'Holes and cut-outs (from datum A)', ('Feature', 'x', 'y', 'Size / note'),
              features(), (36, 22, 20, 32), size=2.1)
    _name, dielectrics = G.STACKUP[G.COPPER_LAYERS]
    copper = ['F.Cu (top)'] + ['In%d.Cu' % k for k in range(1, G.COPPER_LAYERS - 1)] + ['B.Cu (bottom)']
    rows, total = [], 0.0
    for k, name in enumerate(copper):
        t = G.COPPER_OUTER if k in (0, len(copper) - 1) else G.COPPER_INNER
        rows.append((name, 'copper', '%.4f' % t, ''))
        total += t
        if k < len(dielectrics):
            kind, t, material, er = dielectrics[k]
            rows.append(('', '%s %s' % (kind, material), '%.4f' % t, '%.2f' % er))
            total += t
    rows.append(('Total, without mask', '', '%.3f' % total, ''))
    y = table(page, x, y, 'Stack-up %s' % G.STACKUP[G.COPPER_LAYERS][0],
              ('Layer', 'Material', 'Thickness mm', 'er'), rows, (30, 34, 26, 16), size=2.1)
    y = table(page, x, y, 'Drill table (finished hole sizes, mm)', ('Hole', 'Plating', 'Count', 'Used for'),
              drill_table(board), (34, 20, 14, 42), size=2.1)
    xr = 305.0
    yr = table(page, xr, 40, 'Smallest features', ('Feature', 'Value'), smallest(board), (44, 61), size=2.0)
    page.text('Notes', xr, yr, 3.0, bold=True)
    yr += 2.0
    for n, note in enumerate(NOTES, 1):
        words, line = note.split(), ''
        lines = []
        for w in words:
            if text_width(line + ' ' + w, 2.2) > 98:
                lines.append(line)
                line = w
            else:
                line = (line + ' ' + w).strip()
        lines.append(line)
        for i, ln in enumerate(lines):
            yr += 3.4
            page.text(('%d. ' % n if i == 0 else '    ') + ln, xr, yr, 2.2)
    page.rect(305, 262, 412, 289, 0.3)
    page.text('Attractap Touch P4  rev A', 308, 270, 3.2, bold=True)
    page.text('Fabrication drawing, sheet 1 of 1', 308, 276, 2.4)
    page.text('Date %s   Generated by scripts/fab_drawing.py' % DATE, 308, 281.5, 2.2)
    page.text('github.com/Attraccess/Attraccess', 308, 286.5, 2.2)
    doc.save(out)


if __name__ == '__main__':
    draw(sys.argv[1], sys.argv[2])
