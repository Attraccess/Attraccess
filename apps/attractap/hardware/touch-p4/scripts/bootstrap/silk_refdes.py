"""Reference designators on the component side's silkscreen, wherever one fits.

Each designator goes at the first place beside its part (above, below, left, right; upright or turned)
where it lies on no pad (0.15 mm, JLCPCB's pad-to-silkscreen distance), no other text, no footprint
silkscreen, no part body, no cut-out and not within 0.3 mm of the board edge. Texts are 1.0 mm high with
0.15 mm lines, JLCPCB's smallest. Where nothing fits (the 0.35 mm pitch MCU's surroundings, the resistor
arrays), the designator is only on the assembly drawing (fab/jlcpcb/*-assembly.pdf), which shows every one.
"""
import pcbnew

from board import unV
from silk import FRONT, check

SIZE = 1.0
GAP = 0.35            # between two designators, so that neighbours do not read as one word
# Parts whose designator the silkscreen does not carry: test points (they carry their signal's name),
# fiducials, mounting holes, the antenna loop (its own label) and the logo-like parts.
SKIP = ('TP', 'FID', 'H8', 'ANT')
# Footprint body: the fabrication layer's outline, else the courtyard less its margin, else the pads.
MARGIN = 0.25


def body(fp):
    boxes = [g.GetBoundingBox() for g in fp.GraphicalItems() if g.GetLayer() == pcbnew.F_Fab and
             g.GetClass() == 'PCB_SHAPE']
    if boxes:
        bb = boxes[0]
        for b in boxes[1:]:
            bb.Merge(b)
        (x1, y1), (x2, y2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
        return x1, y1, x2, y2
    cy = fp.GetCourtyard(pcbnew.F_CrtYd)
    if cy.OutlineCount():
        bb = cy.BBox()
        (x1, y1), (x2, y2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
        return x1 + MARGIN, y1 + MARGIN, x2 - MARGIN, y2 - MARGIN
    bb = fp.GetBoundingBox(False)
    (x1, y1), (x2, y2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
    return x1, y1, x2, y2


def text_box(t):
    bb = t.GetEffectiveTextShape().BBox()
    (x1, y1), (x2, y2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
    return x1, y1, x2, y2


def overlap(a, c, grow=0.0):
    return a[0] - grow < c[2] and c[0] < a[2] + grow and a[1] - grow < c[3] and c[1] < a[3] + grow


def outline(fp, box):
    """The body box grown over the part's own pads."""
    x1, y1, x2, y2 = box
    for pad in fp.Pads():
        bb = pad.GetBoundingBox()
        (a1, b1), (a2, b2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
        x1, y1, x2, y2 = min(x1, a1), min(y1, b1), max(x2, a2), max(y2, b2)
    return x1, y1, x2, y2


def candidates(box):
    """(x, y, align, rot) around a part (body and pads): above and below first (that is where one looks
    for them), then beside it, then turned beside it; each also shifted along the side and moved out."""
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    out = []
    for away in (0.2, 0.5, 0.9):
        h = SIZE / 2 + away
        for shift in (0.0, -0.6, 0.6, -1.2, 1.2):
            out.append((cx + shift, y1 - h, 'c', 0))
            out.append((cx + shift, y2 + h, 'c', 0))
        for shift in (0.0, -0.5, 0.5):
            out.append((x1 - away, cy + shift, 'r', 0))
            out.append((x2 + away, cy + shift, 'l', 0))
        for shift in (0.0, -0.6, 0.6, -1.2, 1.2):
            out.append((x1 - h, cy + shift, 'c', 90))
            out.append((x2 + h, cy + shift, 'c', 90))
    return out


def refdes(S):
    """Places the designators; returns (placed, [refs without room])."""
    b = S.b
    lines = [g for g in b.GetDrawings() if g.GetLayer() == FRONT and g.GetClass() == 'PCB_SHAPE']
    bodies, fps = {}, {}
    for fp in b.GetFootprints():
        if fp.GetLayer() != pcbnew.F_Cu:
            continue
        for g in fp.GraphicalItems():
            if g.GetLayer() == FRONT and g.GetClass() == 'PCB_SHAPE':
                lines.append(g)
        bodies[fp.GetReference()] = body(fp)
        fps[fp.GetReference()] = fp
    # larger parts first: they have the fewest places, and a small part next to them has more
    order = sorted(bodies, key=lambda r: -((bodies[r][2] - bodies[r][0]) * (bodies[r][3] - bodies[r][1])))
    placed, missing, mine = 0, [], []
    for ref in order:
        if ref.startswith(SKIP):
            continue
        for x, y, align, rot in candidates(outline(fps[ref], bodies[ref])):
            t = S.text(ref, x, y, size=SIZE, align=align, rot=rot)
            me = text_box(t)
            ok = (not any(overlap(me, bx, 0.05) for bx in bodies.values()) and
                  not any(overlap(me, o, GAP) for o in mine) and not check(S, only=t, lines=lines))
            if ok:
                placed += 1
                mine.append(me)
                break
            b.Remove(t)
            S.texts.remove(t)
        else:
            missing.append(ref)
    return placed, missing
