"""Check, and where needed find, where a 3D model sits on its footprint: its pin tips in the holes and the
bottoms of its terminals on the pads. Used by collect_models.py.

easyeda2kicad places the model of most parts right, but not of every part whose body is off the pads'
centre (the DC jack, the USB-C receptacle, the FPC connector of this board). The fit compares the model
with the footprint itself, so it does not depend on the converter.
"""
import gzip
import math
import re

from sexpr import find, first, loads

PIN_DEPTH = 0.8         # a vertex this far below the board surface belongs to a pin in a hole
BOTTOM = 0.12           # a vertex within this of the board surface is the bottom of a terminal or body
MISPLACED = 0.6         # below this share of pins in holes and pads under terminals a model is moved
GOOD = 0.8              # the share a model must reach (a QFN's terminals do not reach every pad's end)


def step_vertices(path):
    """the vertices of a STEP body (mm); path may be gzip-compressed (.stpz)"""
    opener = gzip.open if path.endswith('.stpz') else open
    with opener(path, 'rt', errors='ignore') as f:
        t = re.sub(r'\s+', ' ', f.read())
    ent = dict(re.findall(r"#(\d+)\s*=\s*([A-Z_0-9]+\s*\(.*?\))\s*;", t))
    out = []
    for e in ent.values():
        if e.startswith('VERTEX_POINT'):
            p = ent[re.search(r'#(\d+)', e).group(1)]
            m = re.search(r"\(\s*([-\d.Ee+]+)\s*,\s*([-\d.Ee+]+)\s*,\s*([-\d.Ee+]+)\s*\)", p)
            out.append(tuple(float(v) for v in m.groups()))
    return out


def pad_rects(footprint_text):
    """[(kind, x, y, w, h)] of the footprint's pads and holes, kind 'smd', 'tht' or 'npth'"""
    out = []
    for pad in find(loads(footprint_text), 'pad'):
        at, size = first(pad, 'at'), first(pad, 'size')
        x, y, w, h = float(at[1]), float(at[2]), float(size[1]), float(size[2])
        if len(at) > 3 and float(at[3]) % 180 == 90:
            w, h = h, w
        kind = {'smd': 'smd', 'thru_hole': 'tht', 'np_thru_hole': 'npth'}.get(str(pad[2]))
        if kind:
            out.append((kind, x, y, w, h))
    return out


def placed(verts, off, rot):
    """model vertices in footprint coordinates (y down), as KiCad places them with offset and rotation"""
    a = math.radians(rot[2])
    c, s = math.cos(a), math.sin(a)
    return [(x * c - y * s + off[0], -(x * s + y * c + off[1]), z + off[2]) for x, y, z in verts]


def _inside(x, y, r, margin):
    return abs(x - r[1]) <= r[3] / 2 + margin and abs(y - r[2]) <= r[4] / 2 + margin


def score(pins, bottoms, rects, dx=0.0, dy=0.0):
    """share of pin vertices in a hole and of SMD pads with a terminal bottom on them, after a shift"""
    parts = []
    holes = [r for r in rects if r[0] != 'smd']
    if pins and holes:
        parts.append(sum(any(_inside(x + dx, y + dy, r, 0.1) for r in holes) for x, y in pins) / len(pins))
    smd = [r for r in rects if r[0] == 'smd']
    if smd and bottoms:
        parts.append(sum(any(_inside(x + dx, y + dy, r, 0.05) for x, y in bottoms) for r in smd) / len(smd))
    return min(parts) if parts else 1.0


def _clusters(points, gap=0.6):
    out = []
    for p in points:
        for c in out:
            if abs(c[0][0] - p[0]) < gap and abs(c[0][1] - p[1]) < gap:
                c.append(p)
                break
        else:
            out.append([p])
    return [(sum(q[0] for q in c) / len(c), sum(q[1] for q in c) / len(c)) for c in out]


def fit(verts, off, rot, rects):
    """(offset, score, shift): the model's offset after moving it onto its footprint where its pins or
    terminals miss, the fit reached, and the shift made in footprint coordinates"""
    pv = placed(verts, off, rot)
    pins = [(x, y) for x, y, z in pv if z < -PIN_DEPTH]
    bottoms = [(x, y) for x, y, z in pv if abs(z) < BOTTOM]
    s0 = score(pins, bottoms, rects)
    if s0 >= MISPLACED:
        return off, s0, (0.0, 0.0)
    # candidate shifts: the pin tips (or terminal bottoms) moved onto the holes (or pads), as a whole
    # and cluster by cluster
    if pins and any(r[0] != 'smd' for r in rects):
        src, dst = _clusters(pins), [r for r in rects if r[0] != 'smd']
    else:
        src, dst = _clusters(bottoms), [r for r in rects if r[0] == 'smd']
    cands = [(sum(r[1] for r in dst) / len(dst) - sum(c[0] for c in src) / len(src),
              sum(r[2] for r in dst) / len(dst) - sum(c[1] for c in src) / len(src))]
    cands += [(r[1] - cx, r[2] - cy) for cx, cy in src for r in dst]
    ranked = sorted(((score(pins, bottoms, rects, dx, dy), dx, dy) for dx, dy in cands), reverse=True)
    best = ranked[0]
    for _s, bx, by in ranked[:3]:                       # refine: 0.1 mm steps over 1 mm, then 0.02 mm
        for step, n in ((0.1, 10), (0.02, 5)):
            cx, cy = (bx, by) if step == 0.1 else best[1:]
            for i in range(-n, n + 1):
                for j in range(-n, n + 1):
                    s = score(pins, bottoms, rects, cx + i * step, cy + j * step)
                    if s > best[0] + 1e-9:
                        best = (s, cx + i * step, cy + j * step)
    # every shift around it that fits as well: pins in slots and terminals on pads have play, so take the
    # middle of that region rather than its edge
    s, bx, by = best
    same = [(bx + i * 0.1, by + j * 0.1) for i in range(-15, 16) for j in range(-15, 16)
            if score(pins, bottoms, rects, bx + i * 0.1, by + j * 0.1) >= s - 1e-9]
    dx, dy = sum(q[0] for q in same) / len(same), sum(q[1] for q in same) / len(same)
    s = score(pins, bottoms, rects, dx, dy)
    return (round(off[0] + dx, 3), round(off[1] - dy, 3), off[2]), s, (round(dx, 3), round(dy, 3))
