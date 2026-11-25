"""The smallest features of the routed board, for the margins against the fab's limits (the table in
docs/design-notes.md, "Margins to JLCPCB's limits").

Usage: fab_margins.py <board.kicad_pcb>     (KiCad's Python: it reads the board with pcbnew)
"""
import math
import sys
from collections import Counter, defaultdict

import pcbnew


def mm(v):
    return pcbnew.ToMM(v)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def box(p, layer):
    bb = p.GetBoundingBox(layer)
    return mm(bb.GetLeft()), mm(bb.GetTop()), mm(bb.GetRight()), mm(bb.GetBottom())


def gap(a, c):
    gx, gy = max(a[0] - c[2], c[0] - a[2]), max(a[1] - c[3], c[1] - a[3])
    return math.hypot(gx, gy) if gx > 0 and gy > 0 else max(gx, gy)


def main(path):
    b = pcbnew.LoadBoard(path)
    out = []
    tracks = [t for t in b.GetTracks() if t.GetClass() == 'PCB_TRACK']
    vias = [t for t in b.GetTracks() if t.GetClass() == 'PCB_VIA']
    t0 = min(tracks, key=lambda t: t.GetWidth())
    out.append(('Track width', mm(t0.GetWidth()), '%d tracks below 0.12 mm' % sum(mm(t.GetWidth()) < 0.12 for t in tracks)))
    out.append(('Via hole', min(mm(v.GetDrillValue()) for v in vias), ''))
    out.append(('Via diameter', min(mm(v.GetWidth(pcbnew.F_Cu)) for v in vias), ''))
    rings = Counter(round((mm(v.GetWidth(pcbnew.F_Cu)) - mm(v.GetDrillValue())) / 2, 3) for v in vias)
    out.append(('Via annular ring', min(rings), ', '.join('%d of %g' % (n, r) for r, n in sorted(rings.items()))))
    # holes: (x, y, radius, kind, name, net code)
    holes, pth_ring, conn_ring = [], (9.0, ''), (9.0, '')
    for fp in b.GetFootprints():
        for p in fp.Pads():
            ds = p.GetDrillSize()
            if ds.x <= 0:
                continue
            if p.GetAttribute() == pcbnew.PAD_ATTRIB_PTH:
                sz = p.GetSize(pcbnew.F_Cu)
                r = min(mm(sz.x) - mm(ds.x), mm(sz.y) - mm(ds.y)) / 2
                if r < pth_ring[0]:
                    pth_ring = (r, '%s pad %s' % (fp.GetReference(), p.GetNumber()))
                if mm(min(ds.x, ds.y)) > 0.35 and r < conn_ring[0]:
                    conn_ring = (r, '%s pad %s' % (fp.GetReference(), p.GetNumber()))
            c = p.GetPosition()
            holes.append((mm(c.x), mm(c.y), mm(min(ds.x, ds.y)) / 2, 'pad', '%s.%s' % (fp.GetReference(), p.GetNumber()),
                          p.GetNetCode()))
    out.append(('Plated hole annular ring (parts)', pth_ring[0], pth_ring[1]))
    out.append(('  the same, holes over 0.35 mm', conn_ring[0], conn_ring[1]))
    for v in vias:
        c = v.GetPosition()
        holes.append((mm(c.x), mm(c.y), mm(v.GetDrillValue()) / 2, 'via', v.GetNetname(), v.GetNetCode()))
    grid = defaultdict(list)
    for i, h in enumerate(holes):
        grid[(int(h[0] // 2), int(h[1] // 2))].append(i)
    best = {'via': (9.0, ''), 'pad': (9.0, '')}
    for i, h in enumerate(holes):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid[(int(h[0] // 2) + dx, int(h[1] // 2) + dy)]:
                    k = holes[j]
                    if j <= i or (abs(h[0] - k[0]) < 1e-6 and abs(h[1] - k[1]) < 1e-6):
                        continue
                    d = math.hypot(h[0] - k[0], h[1] - k[1]) - h[2] - k[2]
                    kind = 'via' if h[3] == k[3] == 'via' else 'pad'
                    if d < best[kind][0]:
                        best[kind] = (d, '%s %s / %s %s' % (h[3], h[4], k[3], k[4]))
    out.append(('Hole to hole, vias', ) + best['via'])
    out.append(('Hole to hole, with a part hole', ) + best['pad'])
    tgrid = defaultdict(list)
    for t in tracks:
        s, e = t.GetStart(), t.GetEnd()
        for x in range(int(min(mm(s.x), mm(e.x)) // 2) - 1, int(max(mm(s.x), mm(e.x)) // 2) + 2):
            for y in range(int(min(mm(s.y), mm(e.y)) // 2) - 1, int(max(mm(s.y), mm(e.y)) // 2) + 2):
                tgrid[(x, y)].append(t)
    hb = {'via': (9.0, ''), 'pad': (9.0, ''), 'big': (9.0, '')}
    for x, y, r, kind, name, net in holes:
        for t in tgrid[(int(x // 2), int(y // 2))]:
            if t.GetNetCode() == net:
                continue
            s, e = t.GetStart(), t.GetEnd()
            d = seg_dist(x, y, mm(s.x), mm(s.y), mm(e.x), mm(e.y)) - r - mm(t.GetWidth()) / 2
            if d < hb[kind][0]:
                hb[kind] = (d, '%s %s / track %s on %s' % (kind, name, t.GetNetname(), t.GetLayerName()))
            if kind == 'pad' and r > 0.175 and d < hb['big'][0]:
                hb['big'] = (d, '%s %s / track %s on %s' % (kind, name, t.GetNetname(), t.GetLayerName()))
    out.append(('Via hole to track', ) + hb['via'])
    out.append(('Part hole to track', ) + hb['pad'])
    out.append(('  the same, holes over 0.35 mm', ) + hb['big'])
    # copper to board edge (the outline and the cut-outs)
    poly = pcbnew.SHAPE_POLY_SET()
    b.GetBoardPolygonOutlines(poly, False)
    edges = []
    for i in range(poly.OutlineCount()):
        for ch in [poly.Outline(i)] + [poly.Hole(i, k) for k in range(poly.HoleCount(i))]:
            pts = [(mm(ch.CPoint(k).x), mm(ch.CPoint(k).y)) for k in range(ch.PointCount())]
            edges += list(zip(pts, pts[1:] + pts[:1]))

    def edge_d(x, y):
        return min(seg_dist(x, y, a[0], a[1], c[0], c[1]) for a, c in edges)
    ce = (9.0, '')
    for t in b.GetTracks():
        if t.GetClass() == 'PCB_TRACK':
            s, e = t.GetStart(), t.GetEnd()
            n = max(1, int(math.hypot(mm(e.x - s.x), mm(e.y - s.y)) / 0.1))
            pts = [(mm(s.x) + (mm(e.x) - mm(s.x)) * k / n, mm(s.y) + (mm(e.y) - mm(s.y)) * k / n) for k in range(n + 1)]
            half = mm(t.GetWidth()) / 2
        else:
            pts, half = [(mm(t.GetPosition().x), mm(t.GetPosition().y))], mm(t.GetWidth(pcbnew.F_Cu)) / 2
        for x, y in pts:
            d = edge_d(x, y) - half
            if d < ce[0]:
                ce = (d, '%s %s' % ('track' if t.GetClass() == 'PCB_TRACK' else 'via', t.GetNetname()))
    for fp in b.GetFootprints():
        for p in fp.Pads():
            if p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                continue
            for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
                if not p.IsOnLayer(layer):
                    continue
                x1, y1, x2, y2 = box(p, layer)
                for x, y in ((x1, y1), (x2, y1), (x1, y2), (x2, y2), ((x1 + x2) / 2, y1), ((x1 + x2) / 2, y2),
                             (x1, (y1 + y2) / 2), (x2, (y1 + y2) / 2)):
                    d = edge_d(x, y)
                    if d < ce[0]:
                        ce = (d, 'pad %s.%s' % (fp.GetReference(), p.GetNumber()))
    out.append(('Copper to board edge', ) + ce)
    # pads of one part: copper gap between pads of different nets, and the solder mask web between any two
    pp, web = (9.0, ''), (9.0, '')
    for fp in b.GetFootprints():
        for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
            pads = [p for p in fp.Pads() if p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD and p.IsOnLayer(layer)]
            boxes = [box(p, layer) for p in pads]
            for i in range(len(pads)):
                for j in range(i + 1, len(pads)):
                    d = gap(boxes[i], boxes[j])
                    if d <= 0:
                        continue
                    a, c = pads[i], pads[j]
                    if a.GetNetCode() != c.GetNetCode() and d < pp[0]:
                        pp = (d, '%s pads %s and %s' % (fp.GetReference(), a.GetNumber(), c.GetNumber()))
                    m = d - mm(a.GetSolderMaskExpansion(layer)) - mm(c.GetSolderMaskExpansion(layer))
                    if m < web[0]:
                        web = (m, '%s pads %s and %s' % (fp.GetReference(), a.GetNumber(), c.GetNumber()))
    out.append(('SMD pad to pad, two nets', ) + pp)
    out.append(('Solder mask web', ) + web)
    # silkscreen
    lw, th = (9.0, ''), (9.0, '')
    items = list(b.GetDrawings()) + [g for fp in b.GetFootprints() for g in fp.GraphicalItems()]
    items += [f for fp in b.GetFootprints() for f in fp.GetFields() if f.IsVisible()]
    for d in items:
        if d.GetLayer() not in (pcbnew.F_SilkS, pcbnew.B_SilkS):
            continue
        if d.GetClass() == 'PCB_SHAPE':
            filled = getattr(d, 'IsSolidFill', None) or getattr(d, 'IsFilled', None)
            if filled and filled():
                continue
            if 0 < mm(d.GetWidth()) < lw[0]:
                lw = (mm(d.GetWidth()), 'line')
        else:
            if mm(d.GetTextHeight()) < th[0]:
                th = (mm(d.GetTextHeight()), d.GetShownText(False)[:24])
            if mm(d.GetTextThickness()) < lw[0]:
                lw = (mm(d.GetTextThickness()), 'text "%s"' % d.GetShownText(False)[:24])
    out.append(('Silkscreen line', ) + lw)
    out.append(('Silkscreen text height', ) + th)
    ds = b.GetDesignSettings()
    out.append(('Rule: clearance', mm(ds.m_MinClearance), 'board minimum'))
    out.append(('Rule: silkscreen to pad', mm(ds.m_SilkClearance), 'KiCad check; the generator keeps 0.15'))
    for name, val, where in out:
        print('%-34s %7.3f  %s' % (name, val, where))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'kicad/attractap-touch-p4.kicad_pcb')
