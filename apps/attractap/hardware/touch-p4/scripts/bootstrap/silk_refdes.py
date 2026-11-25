"""Reference designators on the component side's silkscreen, wherever one fits.

Each designator goes at the first place beside its part (above, below, left, right; upright or turned)
where it lies on no pad (0.15 mm, JLCPCB's pad-to-silkscreen distance), no other text, no footprint
silkscreen, no part body, no cut-out and not within 0.3 mm of the board edge. Texts are 1.0 mm high with
0.15 mm lines, JLCPCB's smallest. Every part a technician looks for (ICs, crystals, inductors, beads,
diodes, transistors, connectors, switches, fuses, arrays, the buzzer) gets one: where it does not fit beside
the part, it stands in the nearest free place with a leader line to the part, and the build stops if one is
still missing. Passives without room (the 0.35 mm pitch MCU's surroundings) are only on the assembly
drawing (fab/jlcpcb/*-assembly.pdf), which shows every designator.
"""
import math

import pcbnew

import geometry as G
from board import V, mm, unV
from design import SILK_REQUIRED
from silk import FRONT, LINE, check, cutouts

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


# Parts a technician looks for: every one of these must carry its designator on the silkscreen, beside the
# part or, where there is no room, in the nearest free place with a leader line to the part.
REQUIRED = SILK_REQUIRED
LEADER_REACH = 16.0      # how far from the part a designator with a leader may stand, mm


def kind(ref):
    import re
    return re.match(r'[A-Z]+', ref).group(0)


def required(ref):
    return kind(ref) in REQUIRED


def _seg(b, a, c):
    s = pcbnew.PCB_SHAPE(b)
    s.SetShape(pcbnew.SHAPE_T_SEGMENT)
    s.SetStart(V(*a))
    s.SetEnd(V(*c))
    s.SetLayer(FRONT)
    s.SetWidth(mm(LINE))
    return s


def _dist(px, py, a, c):
    dx, dy = c[0] - a[0], c[1] - a[1]
    L = dx * dx + dy * dy
    u = 0.0 if L == 0 else max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / L))
    return math.hypot(px - a[0] - u * dx, py - a[1] - u * dy)


def _silk_cells(segs, reach):
    """The 0.1 mm grid points (x and y times ten, rounded) within `reach` of the segments' centre lines."""
    cells = set()
    r = int(math.ceil(reach * 10)) + 1
    for a, c in segs:
        n = max(1, int(math.hypot(c[0] - a[0], c[1] - a[1]) / 0.05))
        for k in range(n + 1):
            x, y = a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n
            for i in range(-r, r + 1):
                for j in range(-r, r + 1):
                    gx, gy = round(x * 10) + i, round(y * 10) + j
                    if (gx / 10 - x) ** 2 + (gy / 10 - y) ** 2 <= reach * reach:
                        cells.add((gx, gy))
    return cells


def _near_point(box, x, y):
    return min(max(x, box[0]), box[2]), min(max(y, box[1]), box[3])


def _leader_path(text, part, blocked, cell=0.1):
    """A leader around the obstacles, on a grid of `cell`: from the edge of the text box `text` to just
    outside the part's box `part`. `blocked(x, y)` says whether a line centre may not pass there.
    Returns the corner points, or None."""
    from collections import deque
    x0 = min(text[0], part[0]) - 3.0
    y0 = min(text[1], part[1]) - 3.0
    nx = int((max(text[2], part[2]) + 3.0 - x0) / cell) + 1
    ny = int((max(text[3], part[3]) + 3.0 - y0) / cell) + 1
    pt = lambda i, j: (x0 + i * cell, y0 + j * cell)
    goal = (part[0] - 0.3, part[1] - 0.3, part[2] + 0.3, part[3] + 0.3)
    near_goal = lambda x, y: goal[0] - cell <= x <= goal[2] + cell and goal[1] - cell <= y <= goal[3] + cell
    start = []
    for i in range(nx):
        for j in range(ny):
            x, y = pt(i, j)
            inside = text[0] - 0.2 <= x <= text[2] + 0.2 and text[1] - 0.2 <= y <= text[3] + 0.2
            edge = inside and not (text[0] - 0.1 < x < text[2] + 0.1 and text[1] - 0.1 < y < text[3] + 0.1)
            if edge and not blocked(x, y):
                start.append((i, j))
    prev = {s: None for s in start}
    todo = deque(start)
    end = None
    while todo:
        i, j = todo.popleft()
        x, y = pt(i, j)
        if near_goal(x, y):
            end = (i, j)
            break
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            k = (i + di, j + dj)
            if k in prev or not (0 <= k[0] < nx and 0 <= k[1] < ny):
                continue
            kx, ky = pt(*k)
            if (goal[0] < kx < goal[2] and goal[1] < ky < goal[3]) or blocked(kx, ky):
                continue
            prev[k] = (i, j)
            todo.append(k)
    if end is None:
        return None
    cells = []
    while end is not None:
        cells.append(end)
        end = prev[end]
    cells.reverse()

    def clear(a, c):
        (ax, ay), (cx, cy) = pt(*a), pt(*c)
        n = max(1, int(math.hypot(cx - ax, cy - ay) / (cell / 2)))
        for k in range(n + 1):
            x, y = ax + (cx - ax) * k / n, ay + (cy - ay) * k / n
            if blocked(x, y) or (goal[0] < x < goal[2] and goal[1] < y < goal[3]):
                return False
        return True
    # straight lines where the way is clear: from each corner on to the furthest cell in sight
    keep, i = [cells[0]], 0
    while i < len(cells) - 1:
        j = next(j for j in range(len(cells) - 1, i, -1) if j == i + 1 or clear(cells[i], cells[j]))
        keep.append(cells[j])
        i = j
    return [pt(*c) for c in keep]


def _leader_route(S, t, ref, box, pads, mine, leader_boxes, lines):
    """A leader from the text t to the part (box: body and pads) round pads, texts, other leaders, footprint
    outlines and cut-outs, touching none of them (KiCad reports silkscreen that touches silkscreen).
    Returns (corner points, length) or None."""
    tb = text_box(t)
    texts = mine + [text_box(o) for o in S.texts if o is not t]
    grow = LINE / 2 + 0.15
    obst = [(p[0] - grow, p[1] - grow, p[2] + grow, p[3] + grow) for p in pads]
    obst += [(q[0] - LINE / 2 - 0.1, q[1] - LINE / 2 - 0.1, q[2] + LINE / 2 + 0.1, q[3] + LINE / 2 + 0.1) for q in texts]
    obst += leader_boxes
    obst += [(h[0] - LINE, h[1] - LINE, h[2] + LINE, h[3] + LINE) for h in cutouts()]
    win = (min(tb[0], box[0]) - 3, min(tb[1], box[1]) - 3, max(tb[2], box[2]) + 3, max(tb[3], box[3]) + 3)
    local = [o for o in obst if o[2] > win[0] and o[0] < win[2] and o[3] > win[1] and o[1] < win[3]]
    segs = [(unV(g.GetStart()), unV(g.GetEnd()), g.GetParentFootprint()) for g in lines
            if g.GetShape() == pcbnew.SHAPE_T_SEGMENT and g.GetParentFootprint() is not None]
    segs = [sg for sg in segs if min(sg[0][0], sg[1][0]) < win[2] and max(sg[0][0], sg[1][0]) > win[0]
            and min(sg[0][1], sg[1][1]) < win[3] and max(sg[0][1], sg[1][1]) > win[1]]
    silk = _silk_cells([(a, c) for a, c, _ in segs], LINE + 0.08)      # the grid lookup rounds by up to 0.07 mm
    # the part: its body, pads and own outline; the leader stops 0.3 mm short of it
    part = list(box)
    for a, c, f in segs:
        if f.GetReference() == ref:
            part = [min(part[0], a[0], c[0]), min(part[1], a[1], c[1]), max(part[2], a[0], c[0]), max(part[3], a[1], c[1])]
    W, H = G.BOARD_W, G.BOARD_H
    blocked = lambda qx, qy: (not (0.4 < qx < W - 0.4 and 0.4 < qy < H - 0.4) or (round(qx * 10), round(qy * 10)) in silk
                              or any(o[0] < qx < o[2] and o[1] < qy < o[3] for o in local))
    path = _leader_path(tb, part, blocked)
    if not path or len(path) > 7:
        return None
    length = sum(math.hypot(c[0] - a[0], c[1] - a[1]) for a, c in zip(path, path[1:]))
    return (path, length) if length < 24 else None


def refdes(S):
    """Places the designators; returns (placed, [refs without room], number of leader lines). When a part
    that must have its designator finds no place, the whole placement runs again with that part first."""
    first = []
    for _round in range(4):
        before = len(S.texts)
        drawn = {d.m_Uuid.AsString() for d in S.b.GetDrawings()}
        placed, missing, leaders = _refdes(S, first)
        lost = [r for r in missing if required(r)]
        if not lost:
            return placed, missing, leaders
        # take this round back and try again with the parts that were left out at the front
        for d in [d for d in S.b.GetDrawings() if d.m_Uuid.AsString() not in drawn]:
            S.b.Remove(d)
        del S.texts[before:]
        first = lost + [r for r in first if r not in lost]
    return _refdes(S, first)


def _refdes(S, first):
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
    pads = []
    for fp in b.GetFootprints():
        for pad in fp.Pads():
            if pad.IsOnLayer(pcbnew.F_Cu) or pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                bb = pad.GetBoundingBox()
                (a1, b1), (a2, b2) = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
                pads.append((a1, b1, a2, b2))
    # the parts a technician looks for first, larger ones first within each group: they have the fewest
    # places, and a small part next to them has more
    area = lambda r: (bodies[r][2] - bodies[r][0]) * (bodies[r][3] - bodies[r][1])
    order = sorted(bodies, key=lambda r: (r not in first, first.index(r) if r in first else 0, not required(r), -area(r)))
    placed, missing, mine, leaders = 0, [], [], 0
    leader_boxes = []

    def fits(t):
        me = text_box(t)
        return (not any(overlap(me, bx, 0.05) for bx in bodies.values()) and
                not any(overlap(me, o, GAP) for o in mine) and not check(S, only=t, lines=lines))

    for ref in order:
        if ref.startswith(SKIP):
            continue
        box = outline(fps[ref], bodies[ref])
        done = False
        for x, y, align, rot in candidates(box):
            t = S.text(ref, x, y, size=SIZE, align=align, rot=rot)
            if fits(t):
                done = True
                break
            b.Remove(t)
            S.texts.remove(t)
        if not done and required(ref):
            # nearest free place within reach, joined to the part by a leader line
            cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            spots = []
            for k in range(2, int(LEADER_REACH / 0.5) + 1):
                r = k * 0.5
                for j in range(24):
                    a = math.radians(j * 15)
                    spots += [(r, cx + r * math.cos(a), cy + r * math.sin(a), rot) for rot in (0, 90)]
            # the shortest leader among the first free places; one nearly straight is taken at once
            best, tried = None, 0
            for _r, x, y, rot in spots:
                t = S.text(ref, x, y, size=SIZE, align='c', rot=rot)
                route = None
                if fits(t):
                    tb = text_box(t)
                    tx, ty = _near_point(tb, cx, cy)
                    grown = (box[0] - 0.3, box[1] - 0.3, box[2] + 0.3, box[3] + 0.3)
                    px, py = _near_point(grown, tx, ty)
                    straight = math.hypot(px - tx, py - ty)
                    if straight > 0.3:
                        route = _leader_route(S, t, ref, box, pads, mine, leader_boxes, lines)
                        tried += 1
                b.Remove(t)
                S.texts.remove(t)
                if route and (best is None or route[1] < best[1][1]):
                    best = ((x, y, rot), route, straight)
                if best and (best[1][1] < 1.3 * best[2] + 1.0 or tried >= 30):
                    break
            if best:
                (x, y, rot), (path, _length), _straight = best
                S.text(ref, x, y, size=SIZE, align='c', rot=rot)
                for a, c in zip(path, path[1:]):
                    s = _seg(b, a, c)
                    b.Add(s)
                    lines.append(s)
                    leader_boxes.append((min(a[0], c[0]) - 0.2, min(a[1], c[1]) - 0.2,
                                         max(a[0], c[0]) + 0.2, max(a[1], c[1]) + 0.2))
                leaders += 1
                done = True
        if done:
            placed += 1
            mine.append(text_box(S.texts[-1]))
        else:
            missing.append(ref)
    return placed, missing, leaders
