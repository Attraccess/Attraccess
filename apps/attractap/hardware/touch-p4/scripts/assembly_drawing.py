"""Assembly drawing of the Touch P4 board: every part of the component side with its outline, pads and
reference designator, pin 1 and polarity marked. One overview page and detail pages, enlarged, of the
areas where the parts stand too close to read on the overview: the MCU with its capacitors and crystal,
the Ethernet PHY, the NFC chip and the power section. Read from the board file; written by
export_fab.py into fab/jlcpcb/.

Usage: assembly_drawing.py <board.kicad_pcb> <out.pdf>     (KiCad's Python: it reads the board with pcbnew)
"""
import math
import os
import sys

import pcbnew

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'bootstrap'))
from pdfdoc import Document, text_width  # noqa: E402

DATE = '2026-11-25'
# Detail pages: (title, x1, y1, x2, y2) in board millimetres from the top left corner
DETAILS = [
    ('A', 'MCU U201: supply capacitors, crystal Y201, reset, flash U203, USB resistors', 26.0, 33.0, 58.0, 63.0),
    ('B', 'Ethernet PHY U401, its crystal and the Ethernet jack J401', 55.0, 52.0, 86.0, 82.0),
    ('C', 'NFC chip U501 and its antenna matching', 7.0, 105.0, 33.0, 134.0),
    ('D', 'Power: USB-C input and eFuse, PoE module, 3.3 V converter', 40.0, 3.0, 86.0, 41.0),
    ('E', 'Power: DC input, fuse, TVS, DC/DC converter', 0.0, 50.0, 30.0, 102.0),
]
# Pads whose number marks pin 1 or the polarity: pin 1 of ICs and connectors, the cathode of diodes, + of
# polarised capacitors
POLAR = ('U', 'J', 'D', 'Q', 'Y', 'RN', 'BZ', 'SW', 'F')


def mm(v):
    return v / 1e6


class View:
    """Board millimetres (from the board's top left corner) to page millimetres."""

    def __init__(self, page, origin, x1, y1, scale, ox, oy):
        self.page, self.origin, self.x1, self.y1, self.s, self.ox, self.oy = page, origin, x1, y1, scale, ox, oy

    def p(self, v):
        """A KiCad point (internal units) on the page."""
        return (self.ox + (mm(v.x) - self.origin[0] - self.x1) * self.s,
                self.oy + (mm(v.y) - self.origin[1] - self.y1) * self.s)

    def b(self, x, y):
        """A board point (mm from the top left corner) on the page."""
        return self.ox + (x - self.x1) * self.s, self.oy + (y - self.y1) * self.s


def shape(view, d, width, gray=0.0):
    page = view.page
    s = d.GetShape()
    if s == pcbnew.SHAPE_T_SEGMENT:
        page.line(*view.p(d.GetStart()), *view.p(d.GetEnd()), width, gray)
    elif s == pcbnew.SHAPE_T_RECT:
        (x1, y1), (x2, y2) = view.p(d.GetStart()), view.p(d.GetEnd())
        page.rect(x1, y1, x2, y2, width, gray)
    elif s == pcbnew.SHAPE_T_CIRCLE:
        page.circle(*view.p(d.GetCenter()), mm(d.GetRadius()) * view.s, width, gray)
    elif s == pcbnew.SHAPE_T_ARC:
        c, r = d.GetCenter(), mm(d.GetRadius())
        a0 = math.atan2(d.GetStart().y - c.y, d.GetStart().x - c.x)
        sweep = math.radians(d.GetArcAngle().AsDegrees())
        a1 = math.atan2(d.GetEnd().y - c.y, d.GetEnd().x - c.x)
        if abs(math.remainder(a0 + sweep - a1, 2 * math.pi)) > 0.01:
            sweep = -sweep
        cx, cy = view.p(c)
        page.poly([(cx + r * view.s * math.cos(a0 + sweep * k / 16), cy + r * view.s * math.sin(a0 + sweep * k / 16))
                   for k in range(17)], width, gray, close=False)
    elif s == pcbnew.SHAPE_T_POLY:
        ps = d.GetPolyShape()
        for i in range(ps.OutlineCount()):
            o = ps.Outline(i)
            view.page.poly([view.p(o.CPoint(k)) for k in range(o.PointCount())], width, gray)


def outline(view, board):
    for d in board.GetDrawings():
        if d.GetLayer() == pcbnew.Edge_Cuts:
            shape(view, d, 0.35)
    for fp in board.GetFootprints():
        for d in fp.GraphicalItems():
            if d.GetLayer() == pcbnew.Edge_Cuts:
                shape(view, d, 0.35)


def body_box(fp):
    boxes = [g.GetBoundingBox() for g in fp.GraphicalItems() if g.GetLayer() == pcbnew.F_Fab and g.GetClass() == 'PCB_SHAPE']
    if not boxes:
        cy = fp.GetCourtyard(pcbnew.F_CrtYd)
        boxes = [cy.BBox()] if cy.OutlineCount() else [fp.GetBoundingBox(False)]
    bb = boxes[0]
    for b in boxes[1:]:
        bb.Merge(b)
    return bb


def parts(view, board, area, size_max, with_value):
    """Pads, body outlines and designators of the component side's parts inside `area` (board mm)."""
    x1, y1, x2, y2 = area
    ox, oy = view.origin
    for fp in board.GetFootprints():
        if fp.GetLayer() != pcbnew.F_Cu:
            continue
        ref = fp.GetReference()
        c = fp.GetPosition()
        cx, cy = mm(c.x) - ox, mm(c.y) - oy
        if not (x1 <= cx <= x2 and y1 <= cy <= y2):
            continue
        polar = ref.startswith(POLAR) or (ref.startswith('C') and 'Elec' in fp.GetFPID().GetLibItemName().wx_str())
        for pad in fp.Pads():
            if not pad.IsOnLayer(pcbnew.F_Cu):
                continue
            poly = pad.GetEffectivePolygon(pcbnew.F_Cu, pcbnew.ERROR_INSIDE)
            first = polar and pad.GetNumber() == '1'
            for i in range(poly.OutlineCount()):
                o = poly.Outline(i)
                view.page.poly([view.p(o.CPoint(k)) for k in range(o.PointCount())], 0.05 if not first else 0.1,
                               0.55, fill=0.45 if first else 0.82)
        for d in fp.GraphicalItems():
            if d.GetLayer() == pcbnew.F_Fab and d.GetClass() == 'PCB_SHAPE':
                shape(view, d, 0.18)
        if ref.startswith(('TP', 'FID', 'H8')):
            continue
        bb = body_box(fp)
        w, h = mm(bb.GetWidth()) * view.s, mm(bb.GetHeight()) * view.s
        turn = h > w * 1.3
        room = (h if turn else w) * 0.9
        size = max(1.3, min(size_max, room / max(1, len(ref)) / 0.62, (w if turn else h) * 0.55))
        bx, by = view.p(bb.GetCenter())
        lines = [(ref, size, 0.0, True)]
        if with_value:
            lines.append((fp.GetValue(), size * 0.7, 0.35, False))
        total = sum(s for _, s, _, _ in lines) * 1.15
        off = -total / 2
        for text, s, gray, bold in lines:
            off += s
            if turn:
                view.page.text(text, bx + off - s * 0.15, by, s, 'c', gray, bold, angle=90)
            else:
                view.page.text(text, bx, by + off - s * 0.15, s, 'c', gray, bold)
            off += s * 0.15


def frame(page, w, h, title, sheet, sheets):
    page.rect(8, 8, w - 8, h - 8, 0.4)
    page.text('Attractap Touch P4, revision A: assembly drawing, component side', 14, 18, 4.0, bold=True)
    page.text(title, 14, 24.5, 2.8)
    page.text('Sheet %d of %d    %s    Generated by scripts/assembly_drawing.py from the board file' % (sheet, sheets, DATE),
              14, h - 11, 2.2)
    page.text('Dark pad: pin 1, cathode or +.  Grey text: value.', w - 14, h - 11, 2.2, 'r')


def draw(pcb_path, out):
    board = pcbnew.LoadBoard(pcb_path)
    box = board.GetBoardEdgesBoundingBox()
    origin = (mm(box.GetLeft()), mm(box.GetTop()))
    bw, bh = mm(box.GetWidth()), mm(box.GetHeight())
    doc = Document('Attractap Touch P4 assembly drawing')
    sheets = 1 + len(DETAILS)
    # overview: A3 portrait
    W, H = 297.0, 420.0
    s = min((W - 40) / bw, (H - 60) / bh)
    page = doc.page(W, H)
    frame(page, W, H, 'Overview, scale %.1f : 1. The framed areas are drawn larger on the sheets named.' % s, 1, sheets)
    view = View(page, origin, 0.0, 0.0, s, (W - bw * s) / 2, 32.0)
    outline(view, board)
    parts(view, board, (0, 0, bw, bh), 2.2, False)
    for key, _title, x1, y1, x2, y2 in DETAILS:
        (a, b), (c, d) = view.b(x1, y1), view.b(x2, y2)
        page.poly([(a, b), (c, b), (c, d), (a, d)], 0.3, 0.3)
        page.rect(a, b - 5.2, a + 12, b, 0, fill=1.0)
        page.text('Detail %s' % key, a + 1, b - 1.2, 2.6, bold=True)
    # details: A3 landscape
    W, H = 420.0, 297.0
    for n, (key, title, x1, y1, x2, y2) in enumerate(DETAILS, 2):
        s = min((W - 40) / (x2 - x1), (H - 60) / (y2 - y1))
        page = doc.page(W, H)
        frame(page, W, H, 'Detail %s: %s. Scale %.1f : 1, board coordinates x %.0f to %.0f, y %.0f to %.0f mm.'
              % (key, title, s, x1, x2, y1, y2), n, sheets)
        view = View(page, origin, x1, y1, s, (W - (x2 - x1) * s) / 2, 32.0)
        page.rect(*view.b(x1, y1), *view.b(x2, y2), 0.2, 0.6)
        outline(view, board)
        parts(view, board, (x1 - 1, y1 - 1, x2 + 1, y2 + 1), 3.2, True)
        # cover what lies outside the detail's frame
        fx1, fy1 = view.b(x1, y1)
        fx2, fy2 = view.b(x2, y2)
        for r in ((0, 28, W, fy1), (0, fy2, W, H - 16), (0, fy1, fx1, fy2), (fx2, fy1, W, fy2)):
            page.rect(*r, 0, fill=1.0)
        page.rect(8, 8, W - 8, H - 8, 0.4)
        page.rect(fx1, fy1, fx2, fy2, 0.3, 0.3)
    doc.save(out)
    return sheets


if __name__ == '__main__':
    print('assembly drawing: %d sheets' % draw(sys.argv[1], sys.argv[2]))
