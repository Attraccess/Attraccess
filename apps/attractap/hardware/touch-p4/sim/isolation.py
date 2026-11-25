"""Distance between the 48 V side of the PoE input and everything else, from the copper of the routed board.

The design rule check holds 2 mm between 48 V copper and other copper on one layer. It does not look from
layer to layer, and it does not look at the pads of the parts that bridge the barrier. Here the copper of
every layer is drawn into a raster of 0.05 mm, and the shortest way from 48 V copper to any other copper
is measured: along each layer, and through the board from each layer to every other."""
import math

import numpy as np

from board import OX, OY, inside, short

PRIMARY = ('POE_VP', 'POE_VN', 'POE_VPF', 'POE_VNF')
CELL = 0.05
REACH = 5.0                             # mm around the 48 V copper that is looked at (the rule asks 3)
# The port has to stand 1500 V RMS (IEEE 802.3), 2121 V at the peak. Clearance in air for a voltage peak,
# conductors of any shape, up to 2000 m: IEC 60664-1 table F.2 (kV, mm).
TEST_PEAK = 1500 * math.sqrt(2)
CLEARANCE = ((1.5, 0.5), (2.0, 1.0), (2.5, 1.5), (3.0, 2.0), (4.0, 3.0))
# Parts that stand on both sides by design: the barrier is inside them (transformer of the module,
# dielectric of the capacitor, body of the jack), so their own pads are not held against each other.
BRIDGES = ('U102', 'C102', 'J401')


def region(board):
    """x1, y1, x2, y2 in board coordinates: the 48 V copper with REACH around it."""
    xs, ys = [], []
    for t in board.tracks:
        if short(t['net']) in PRIMARY:
            xs += [t['x1'], t['x2']]; ys += [t['y1'], t['y2']]
    for p in board.pads + board.vias:
        if short(p['net']) in PRIMARY:
            xs.append(p['x']); ys.append(p['y'])
    return min(xs) - OX - REACH - 1, min(ys) - OY - REACH - 1, max(xs) - OX + REACH + 1, max(ys) - OY + REACH + 1


def _grid(reg):
    x1, y1, x2, y2 = reg
    nx, ny = int((x2 - x1) / CELL), int((y2 - y1) / CELL)
    xs = OX + x1 + (np.arange(nx) + 0.5) * CELL
    ys = OY + y1 + (np.arange(ny) + 0.5) * CELL
    return xs, ys


def withstand(mm):
    """Voltage peak that a clearance in air stands, by the table."""
    kv, d = zip(*CLEARANCE)
    return float(np.interp(mm, d, kv)) * 1e3


def _draw(mask, xs, ys, kind, g):
    """Sets the cells of one copper shape. g: track (x1, y1, x2, y2, w), circle (x, y, d) or pad dict."""
    if kind == 'track':
        x1, y1, x2, y2, w = g
        bx = (xs >= min(x1, x2) - w) & (xs <= max(x1, x2) + w)
        by = (ys >= min(y1, y2) - w) & (ys <= max(y1, y2) + w)
        if not bx.any() or not by.any():
            return
        X, Y = np.meshgrid(xs[bx], ys[by])
        length2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        u = np.clip(((X - x1) * (x2 - x1) + (Y - y1) * (y2 - y1)) / length2, 0, 1) if length2 else 0.0
        hit = np.hypot(X - x1 - u * (x2 - x1), Y - y1 - u * (y2 - y1)) <= w / 2
    elif kind == 'circle':
        x, y, d = g
        bx, by = np.abs(xs - x) <= d / 2, np.abs(ys - y) <= d / 2
        if not bx.any() or not by.any():
            return
        X, Y = np.meshgrid(xs[bx], ys[by])
        hit = np.hypot(X - x, Y - y) <= d / 2
    else:
        a = math.radians(g['rot'])
        r = math.hypot(g['sx'], g['sy']) / 2
        bx, by = np.abs(xs - g['x']) <= r, np.abs(ys - g['y']) <= r
        if not bx.any() or not by.any():
            return
        X, Y = np.meshgrid(xs[bx], ys[by])
        dx, dy = X - g['x'], Y - g['y']
        lx, ly = np.abs(dx * math.cos(a) - dy * math.sin(a)), np.abs(dx * math.sin(a) + dy * math.cos(a))
        if g['shape'] in ('circle', 'oval'):        # a circle, or two half circles joined by a rectangle
            small = min(g['sx'], g['sy']) / 2
            hit = np.hypot(np.maximum(lx - (g['sx'] / 2 - small), 0), np.maximum(ly - (g['sy'] / 2 - small), 0)) <= small
        else:
            hit = (lx <= g['sx'] / 2) & (ly <= g['sy'] / 2)
    sub = mask[np.ix_(by, bx)]
    sub |= hit
    mask[np.ix_(by, bx)] = sub


def rasters(board, reg):
    """({layer: mask of 48 V copper}, {layer: mask of all other copper}), bridging parts' pads left out of
    the second."""
    xs, ys = _grid(reg)
    layers = list(board.copper)
    prim = {l: np.zeros((len(ys), len(xs)), dtype=bool) for l in layers}
    sec = {l: np.zeros((len(ys), len(xs)), dtype=bool) for l in layers}
    for t in board.tracks:
        side = prim if short(t['net']) in PRIMARY else sec
        _draw(side[t['layer']], xs, ys, 'track', (t['x1'], t['y1'], t['x2'], t['y2'], t['w']))
    for v in board.vias:
        side = prim if short(v['net']) in PRIMARY else sec
        for l in layers:
            _draw(side[l], xs, ys, 'circle', (v['x'], v['y'], v['dia']))
    for p in board.pads:
        if short(p['net']) in PRIMARY:
            side = prim
        elif p['ref'] in BRIDGES:
            continue
        else:
            side = sec
        for l in p['layers']:
            if l in side:
                _draw(side[l], xs, ys, 'pad', p)
    X, Y = np.meshgrid(xs, ys)
    pts = np.column_stack([X.ravel(), Y.ravel()])
    for z in board.zones:
        for poly in z['polys']:
            o = np.asarray(poly['outline'])
            if o[:, 0].max() < xs[0] or o[:, 0].min() > xs[-1] or o[:, 1].max() < ys[0] or o[:, 1].min() > ys[-1]:
                continue
            hit = inside(poly['outline'], pts)
            for hole in poly['holes']:
                h = np.asarray(hole)
                if len(hole) >= 3 and h[:, 0].max() > xs[0] and h[:, 0].min() < xs[-1] and h[:, 1].max() > ys[0] and h[:, 1].min() < ys[-1]:
                    hit &= ~inside(hole, pts)
            (prim if short(z['net']) in PRIMARY else sec)[z['layer']] |= hit.reshape(X.shape)
    return prim, sec


def _edge(mask):
    """The cells of a mask that have a neighbour outside it."""
    inner = mask.copy()
    inner[1:, :] &= mask[:-1, :]; inner[:-1, :] &= mask[1:, :]
    inner[:, 1:] &= mask[:, :-1]; inner[:, :-1] &= mask[:, 1:]
    return mask & ~inner


def nearest(a, b, reg, limit=REACH):
    """Shortest distance in mm between the set cells of two masks, and where: (distance, (x, y) on the board).
    None if they are further apart than `limit`."""
    if not a.any() or not b.any():
        return None
    if (a & b).any():
        iy, ix = np.argwhere(a & b)[0]
        return 0.0, (reg[0] + (ix + 0.5) * CELL, reg[1] + (iy + 0.5) * CELL)
    pa = np.argwhere(_edge(a)).astype(np.int32)
    # only the other copper within reach of the 48 V copper's bounding box counts
    reach = int(limit / CELL)
    (y1, x1), (y2, x2) = pa.min(axis=0) - reach, pa.max(axis=0) + reach
    pb = np.argwhere(_edge(b)).astype(np.int32)
    pb = pb[(pb[:, 0] >= y1) & (pb[:, 0] <= y2) & (pb[:, 1] >= x1) & (pb[:, 1] <= x2)]
    if not len(pb):
        return None
    best = None
    for k in range(0, len(pa), 200):
        chunk = pa[k:k + 200]
        d2 = (chunk[:, None, 0] - pb[None, :, 0]) ** 2 + (chunk[:, None, 1] - pb[None, :, 1]) ** 2
        i = np.argmin(d2.min(axis=1))
        if best is None or d2[i].min() < best[0]:
            best = (int(d2[i].min()), chunk[i])
    dist = math.sqrt(best[0]) * CELL
    iy, ix = best[1]
    return (dist, (reg[0] + (ix + 0.5) * CELL, reg[1] + (iy + 0.5) * CELL)) if dist <= limit else None


def distances(board):
    """(shortest way along a layer, shortest way through the board), each as (mm, layer or layers, (x, y)).
    Through the board is the straight line from 48 V copper on one layer to other copper on another."""
    reg = region(board)
    prim, sec = rasters(board, reg)
    along, through = [], []
    for l in board.copper:
        if not prim[l].any():
            continue
        for m in board.copper:
            hit = nearest(prim[l], sec[m], reg)
            if not hit:
                continue
            if m == l:
                along.append((hit[0], l, hit[1]))
            else:
                through.append((math.hypot(hit[0], board.depth[l] - board.depth[m]), l + ' to ' + m, hit[1]))
    # no other copper on another layer within REACH of the 48 V copper: nothing to measure
    return (min(along) if along else (float('inf'), '', None)), (min(through) if through else (float('inf'), '', None))
