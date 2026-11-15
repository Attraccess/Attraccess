"""Engine of the grid router (see finish_route.py): the obstacle raster, the connectivity of a net,
the A* search and the conversion of a cell path into tracks and vias."""

import heapq
import math

import numpy as np
import pcbnew
from PIL import Image, ImageDraw

import board as BD
import geometry as G
from board_setup import NETCLASSES


CELL = 0.05
MARGIN = 0.006                      # raster safety margin on top of the clearance (a 0.05 mm step past a
LAYERS = [pcbnew.F_Cu, pcbnew.In2_Cu, pcbnew.B_Cu]
ALL_CU = [pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.B_Cu]
VIA_D, VIA_DRILL = 0.45, 0.2
VIA_COST = 40                       # in grid steps
SOFT_COST = 400                     # crossing a track that could be ripped up (per cell, times the net's weight)
JOIN = 0.04                         # a track end this close to another track's centre line is joined to it
LAYER_COST = [1.0, 1.3, 1.0]        # the 3.3 V layer is a little more expensive
OX, OY = G.ORIGIN
NX, NY = int(round(G.BOARD_W / CELL)) + 1, int(round(G.BOARD_H / CELL)) + 1
mm = pcbnew.ToMM


def short(name):
    return name.split('/')[-1]


_CLASS = {}


def class_of(name):
    """(clearance, track width used for finishing) of a net."""
    n = short(name)
    if n not in _CLASS:
        _CLASS[n] = (0.127, 0.15)
        for cname, clr, w, _vd, _vdr, nets in NETCLASSES:
            if n in nets:
                _CLASS[n] = (clr, 0.2 if cname in ('Power', 'NFC_RF') else w)
                break
    return _CLASS[n]


class Raster:
    """Obstacle masks for one net: True = blocked."""

    def __init__(self, board, net, width, clearance):
        self.block = np.zeros((3, NY, NX), dtype=bool)
        self.soft = np.zeros((3, NY, NX), dtype=np.int16)    # index + 1 of a net whose unlocked track is here
        self.weight = np.zeros(1, dtype=np.uint8)            # by soft index: nets moved before cost more to move
        self.own = np.zeros((3, NY, NX), dtype=np.int32)     # cluster id + 1 of own copper
        self.viablock = None
        self.net, self.w, self.c = net, width, clearance
        self.board = board

    @staticmethod
    def ij(x, y):
        return int(round(y / CELL)), int(round(x / CELL))

    def rect(self, layer, x1, y1, x2, y2, r, target=None, value=True):
        a = self.block[layer] if target is None else target[layer]
        i1, j1 = max(0, int(math.ceil((y1 - r) / CELL))), max(0, int(math.ceil((x1 - r) / CELL)))
        i2, j2 = min(NY - 1, int(math.floor((y2 + r) / CELL))), min(NX - 1, int(math.floor((x2 + r) / CELL)))
        if i2 >= i1 and j2 >= j1:
            a[i1:i2 + 1, j1:j2 + 1] = value

    def seg(self, layer, x1, y1, x2, y2, r, target=None, value=True):
        a = self.block[layer] if target is None else target[layer]
        i1, j1 = max(0, int(math.floor((min(y1, y2) - r) / CELL))), max(0, int(math.floor((min(x1, x2) - r) / CELL)))
        i2, j2 = min(NY - 1, int(math.ceil((max(y1, y2) + r) / CELL))), min(NX - 1, int(math.ceil((max(x1, x2) + r) / CELL)))
        if i2 < i1 or j2 < j1:
            return
        ys = np.arange(i1, i2 + 1)[:, None] * CELL
        xs = np.arange(j1, j2 + 1)[None, :] * CELL
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        t = np.zeros_like(xs + ys) if L2 == 0 else np.clip(((xs - x1) * dx + (ys - y1) * dy) / L2, 0, 1)
        d2 = (xs - x1 - t * dx) ** 2 + (ys - y1 - t * dy) ** 2
        a[i1:i2 + 1, j1:j2 + 1][d2 <= r * r] = value

    def poly(self, layer, pts, target=None):
        a = self.block[layer] if target is None else target[layer]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        j1, i1 = max(0, int(min(xs) / CELL) - 1), max(0, int(min(ys) / CELL) - 1)
        j2, i2 = min(NX - 1, int(max(xs) / CELL) + 1), min(NY - 1, int(max(ys) / CELL) + 1)
        img = Image.new('1', (j2 - j1 + 1, i2 - i1 + 1), 0)
        ImageDraw.Draw(img).polygon([(x / CELL - j1, y / CELL - i1) for x, y in pts], fill=1, outline=1)
        a[i1:i2 + 1, j1:j2 + 1] |= np.array(img, dtype=bool)


ZONES = []                          # (net or None for a keep-out, layer indices, outline points)
GRAVE = []                          # removed board items, kept alive so the bindings do not free them


def board_items(board):
    """Copper items in board millimetres."""
    pads, tracks, vias = [], [], []
    for z in board.Zones():
        o = z.Outline()
        pts = [(mm(o.CVertex(i).x) - OX, mm(o.CVertex(i).y) - OY) for i in range(o.TotalVertices())]
        layers = [k for k, l in enumerate(LAYERS) if z.IsOnLayer(l)]
        if z.GetIsRuleArea():
            if z.GetDoNotAllowTracks():
                ZONES.append((None, layers, pts))
        else:
            ZONES.append((z.GetNetname(), layers, pts))
    for fp in board.GetFootprints():
        for p in fp.Pads():
            bb = p.GetBoundingBox()
            layers = [k for k, l in enumerate(LAYERS) if p.IsOnLayer(l)]
            pads.append(dict(net=p.GetNetname(), x1=mm(bb.GetLeft()) - OX, y1=mm(bb.GetTop()) - OY,
                             x2=mm(bb.GetRight()) - OX, y2=mm(bb.GetBottom()) - OY, layers=layers,
                             cx=mm(p.GetPosition().x) - OX, cy=mm(p.GetPosition().y) - OY,
                             hole=p.GetAttribute() != pcbnew.PAD_ATTRIB_SMD, ref=fp.GetReference(), num=p.GetNumber(),
                             obj=p))
    for t in board.GetTracks():
        if t.GetClass() == 'PCB_VIA':
            vias.append(dict(net=t.GetNetname(), x=mm(t.GetPosition().x) - OX, y=mm(t.GetPosition().y) - OY,
                             d=mm(t.GetWidth(pcbnew.F_Cu)), locked=t.IsLocked(), obj=t))
        elif t.GetLayer() in LAYERS:
            tracks.append(dict(net=t.GetNetname(), layer=LAYERS.index(t.GetLayer()), w=mm(t.GetWidth()),
                               x1=mm(t.GetStart().x) - OX, y1=mm(t.GetStart().y) - OY,
                               x2=mm(t.GetEnd().x) - OX, y2=mm(t.GetEnd().y) - OY, locked=t.IsLocked(), obj=t))
    return pads, tracks, vias


def clusters(net, pads, tracks, vias, plane_all_vias=False):
    """Connected groups of one net's copper (zones are not looked at). Returns lists of items."""
    items = ([('p', p) for p in pads if p['net'] == net] + [('t', t) for t in tracks if t['net'] == net] +
             [('v', v) for v in vias if v['net'] == net])
    parent = list(range(len(items)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        parent[find(a)] = find(b)

    def touches(pt, layer, kind, it):
        x, y = pt
        if kind == 'p':
            return layer in it['layers'] and it['x1'] - 0.01 <= x <= it['x2'] + 0.01 and it['y1'] - 0.01 <= y <= it['y2'] + 0.01
        if kind == 'v':
            return math.hypot(x - it['x'], y - it['y']) <= it['d'] / 2 + 0.01
        if it['layer'] != layer:
            return False
        dx, dy = it['x2'] - it['x1'], it['y2'] - it['y1']
        L2 = dx * dx + dy * dy
        t = 0 if L2 == 0 else max(0, min(1, ((x - it['x1']) * dx + (y - it['y1']) * dy) / L2))
        return math.hypot(x - it['x1'] - t * dx, y - it['y1'] - t * dy) <= JOIN

    first_via = None
    for a, (ka, ia) in enumerate(items):
        if ka == 'v' and plane_all_vias:
            if first_via is None:
                first_via = a
            union(a, first_via)
        for b, (kb, ib) in enumerate(items):
            if b <= a:
                continue
            hit = False
            if ka == 't':
                hit = any(touches(pt, ia['layer'], kb, ib) for pt in ((ia['x1'], ia['y1']), (ia['x2'], ia['y2'])))
            if not hit and kb == 't':
                hit = any(touches(pt, ib['layer'], ka, ia) for pt in ((ib['x1'], ib['y1']), (ib['x2'], ib['y2'])))
            if not hit and ka == 'v':                    # a via also joins a track it sits on
                hit = any(touches((ia['x'], ia['y']), l, kb, ib) for l in range(3))
            if not hit and kb == 'v':
                hit = any(touches((ib['x'], ib['y']), l, ka, ia) for l in range(3))
            if hit:
                union(a, b)
    groups = {}
    for a, it in enumerate(items):
        groups.setdefault(find(a), []).append(it)
    return list(groups.values())


POUR_NETS = ('GND', '+3V3')


def kicad_clusters(board, net, pads, tracks, vias):
    """Groups of one net's pads, tracks and vias as KiCad sees them, filled pours included."""
    conn = board.GetConnectivity()
    uid = lambda o: o.m_Uuid.AsString()
    known = {uid(it['obj']): (kind, it) for kind, lst in (('t', tracks), ('v', vias)) for it in lst if it['net'] == net}
    seen, groups = set(), []
    for p in pads:
        if p['net'] != net or uid(p['obj']) in seen:
            continue
        seen.add(uid(p['obj']))
        grp = [('p', p)]
        own_pads = {uid(q['obj']): q for q in pads if q['net'] == net}
        for it in conn.GetConnectedItems(p['obj'], 0):
            u = uid(it)
            if u in seen:
                continue
            if u in known:
                seen.add(u); grp.append(known[u])
            elif u in own_pads:
                seen.add(u); grp.append(('p', own_pads[u]))
        groups.append(grp)
    return groups


def build_raster(board, net, width, clearance, pads, tracks, vias, groups, soft_nets=None):
    """soft_nets: {net name: index}. Unlocked tracks and vias of every other net then do not block;
    they are marked in R.soft so the search can cross them at a high cost and name the nets."""
    R = Raster(board, net, width, clearance)
    half = width / 2 + MARGIN
    clr = lambda other: max(clearance, class_of(other)[0]) + half
    for p in pads:
        if p['net'] == net:
            continue
        for l in (range(3) if p['hole'] else p['layers']):
            R.rect(l, p['x1'], p['y1'], p['x2'], p['y2'], clr(p['net']))
    for t in tracks:
        if t['net'] != net:
            if soft_nets is not None and not t['locked'] and short(t['net']) not in POUR_NETS:
                R.seg(t['layer'], t['x1'], t['y1'], t['x2'], t['y2'], t['w'] / 2 + clr(t['net']), target=R.soft,
                      value=soft_nets.setdefault(t['net'], len(soft_nets)) + 1)
            else:
                R.seg(t['layer'], t['x1'], t['y1'], t['x2'], t['y2'], t['w'] / 2 + clr(t['net']))
    for v in vias:
        if v['net'] != net:
            for l in range(3):
                if soft_nets is not None and not v['locked'] and short(v['net']) not in POUR_NETS:
                    R.seg(l, v['x'], v['y'], v['x'], v['y'], v['d'] / 2 + clr(v['net']), target=R.soft,
                          value=soft_nets.setdefault(v['net'], len(soft_nets)) + 1)
                else:
                    R.seg(l, v['x'], v['y'], v['x'], v['y'], v['d'] / 2 + clr(v['net']))
    # board edge, cut-outs, keep-outs
    e = 0.3 + half
    for l in range(3):
        R.block[l][:, :int(e / CELL) + 1] = True
        R.block[l][:, NX - int(e / CELL) - 1:] = True
        R.block[l][:int(e / CELL) + 1, :] = True
        R.block[l][NY - int(e / CELL) - 1:, :] = True
        R.rect(l, G.NOTCH_X, G.NOTCH_Y, G.BOARD_W, G.BOARD_H, e)
        R.rect(l, 0, G.POCKET_Y, G.POCKET_X, G.BOARD_H, e)
        R.rect(l, *G.SLOT, e)
        w, h = G.LED_WINDOW
        for y in (G.LED_Y_TOP, G.LED_Y_BOT):
            for x in G.LED_X:
                R.rect(l, x - w / 2, y - h / 2, x + w / 2, y + h / 2, e)
        for x1, y1, x2, y2 in G.POE_ROUTER_KEEPOUT:
            R.rect(l, x1, y1, x2, y2, half)
        for hx, hy in G.MOUNT_HOLES:
            R.seg(l, hx, hy, hx, hy, (G.MOUNT_KEEPOUT_R if l != 1 else 1.6 + 0.25) + half)
        # the NFC loop is copper drawn in a footprint, which board_items() does not see; its outer turn
        # lies outside the keep-out zone
        ax, ay = G.ANT_C
        R.rect(l, ax - G.ANT_W / 2, ay - G.ANT_H / 2, ax + G.ANT_W / 2, ay + G.ANT_H / 2, 0.5 + half)
    for znet, layers, pts in ZONES:
        if znet is None or (znet != net and short(znet) not in ('GND', '+3V3')):
            for k in layers:                            # keep-out, or a pour of another net that must stay whole
                R.poly(k, pts)
                for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1]):
                    R.seg(k, xa, ya, xb, yb, half + (0.2 if znet else 0))
    # where a via may go: clear of everything on all layers, by the via's larger radius
    grow = int(math.ceil((VIA_D / 2 - width / 2) / CELL)) + 1
    anyb = R.block[0] | R.block[1] | R.block[2] | (R.soft[0] > 0) | (R.soft[1] > 0) | (R.soft[2] > 0)
    vb = anyb.copy()
    for d in range(1, grow + 1):
        vb[d:, :] |= anyb[:-d, :]; vb[:-d, :] |= anyb[d:, :]
        vb[:, d:] |= anyb[:, :-d]; vb[:, :-d] |= anyb[:, d:]
        vb[d:, d:] |= anyb[:-d, :-d]; vb[:-d, :-d] |= anyb[d:, d:]
        vb[d:, :-d] |= anyb[:-d, d:]; vb[:-d, d:] |= anyb[d:, :-d]
    for p in pads:                                      # no via in a pad, own net included
        if not p['hole']:
            j1, i1 = max(0, int((p['x1'] - VIA_D / 2) / CELL)), max(0, int((p['y1'] - VIA_D / 2) / CELL))
            j2, i2 = min(NX - 1, int((p['x2'] + VIA_D / 2) / CELL) + 1), min(NY - 1, int((p['y2'] + VIA_D / 2) / CELL) + 1)
            vb[i1:i2 + 1, j1:j2 + 1] = True
    R.viablock = vb
    # own copper, by cluster
    for gi, grp in enumerate(groups):
        for kind, it in grp:
            if kind == 'p':
                for l in it['layers']:
                    R.rect(l, it['x1'] + 0.05, it['y1'] + 0.05, it['x2'] - 0.05, it['y2'] - 0.05, 0, target=R.own, value=gi + 1)
                    i, j = R.ij(it['cx'], it['cy'])
                    R.own[l][i, j] = gi + 1
            elif kind == 'v':
                i, j = R.ij(it['x'], it['y'])
                for l in range(3):
                    R.own[l][i, j] = gi + 1
            else:
                R.seg(it['layer'], it['x1'], it['y1'], it['x2'], it['y2'], CELL * 0.6, target=R.own, value=gi + 1)
    return R


STEPS = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0), (-1, -1, 1.4142), (-1, 1, 1.4142), (1, -1, 1.4142), (1, 1, 1.4142)]


def group_box(grp):
    xs, ys = [], []
    for kind, it in grp:
        if kind == 'p':
            xs += [it['x1'], it['x2']]; ys += [it['y1'], it['y2']]
        elif kind == 'v':
            xs.append(it['x']); ys.append(it['y'])
        else:
            xs += [it['x1'], it['x2']]; ys += [it['y1'], it['y2']]
    return min(xs), min(ys), max(xs), max(ys)


def search(R, groups, g, margin, limit=2500000):
    """A* from every cell of group g to the first cell of another group, inside a window around
    group g and the nearest other group. Returns (path of (layer, i, j), group hit, indices of the
    soft nets crossed) or (None, 0, set())."""
    src = g + 1
    sb = group_box(groups[g])
    others = [(max(0, b[0] - sb[2], sb[0] - b[2]) + max(0, b[1] - sb[3], sb[1] - b[3]), b)
              for k, b in ((k, group_box(grp)) for k, grp in enumerate(groups)) if k != g]
    tb = min(others)[1]
    j1 = max(0, int((min(sb[0], tb[0]) - margin) / CELL)); j2 = min(NX - 1, int((max(sb[2], tb[2]) + margin) / CELL))
    i1 = max(0, int((min(sb[1], tb[1]) - margin) / CELL)); i2 = min(NY - 1, int((max(sb[3], tb[3]) + margin) / CELL))
    H, W = i2 - i1 + 1, j2 - j1 + 1
    HW = H * W
    own = R.own[:, i1:i2 + 1, j1:j2 + 1]
    free = (~R.block[:, i1:i2 + 1, j1:j2 + 1]) | (own > 0)
    Fb = [free[l].astype(np.uint8).tobytes() for l in range(3)]
    Tb = [((own[l] > 0) & (own[l] != src)).astype(np.uint8).tobytes() for l in range(3)]
    Vb = (~R.viablock[i1:i2 + 1, j1:j2 + 1]).astype(np.uint8).tobytes()
    soft = R.soft[:, i1:i2 + 1, j1:j2 + 1]
    Sb = [R.weight[soft[l]].tobytes() for l in range(3)]         # 0 = no track, else the weight of its net
    ti1, ti2 = int(tb[1] / CELL) - i1, int(tb[3] / CELL) - i1
    tj1, tj2 = int(tb[0] / CELL) - j1, int(tb[2] / CELL) - j1
    INF = 1e18
    dist = [INF] * (3 * HW)
    prev = [-1] * (3 * HW)
    heap = []
    for l in range(3):
        for r in np.flatnonzero(own[l] == src).tolist():
            dist[l * HW + r] = 0.0
            heap.append((0.0, 0.0, l * HW + r))
    heapq.heapify(heap)
    pop, push = heapq.heappop, heapq.heappush
    n = 0
    while heap:
        _f, d, node = pop(heap)
        if d > dist[node]:
            continue
        l, r = divmod(node, HW)
        if Tb[l][r]:
            path = []
            while node >= 0:
                ll, rr = divmod(node, HW)
                path.append((ll, rr // W + i1, rr % W + j1))
                node = prev[node]
            hit = int(R.own[path[0][0]][path[0][1], path[0][2]])
            crossed = {int(R.soft[a][b, c]) for a, b, c in path} - {0}
            return path[::-1], hit, crossed
        n += 1
        if n > limit:
            break
        i, j = divmod(r, W)
        F = Fb[l]
        S = Sb[l]
        lc = LAYER_COST[l]
        base = l * HW
        for di, dj, c in STEPS:
            a, b = i + di, j + dj
            if a < 0 or b < 0 or a >= H or b >= W:
                continue
            r2 = a * W + b
            if not F[r2]:
                continue
            if di and dj and not (F[i * W + b] and F[a * W + j]):
                continue
            nd = d + c * lc + SOFT_COST * S[r2]
            n2 = base + r2
            if nd < dist[n2]:
                dist[n2] = nd; prev[n2] = node
                dx = tj1 - b if b < tj1 else (b - tj2 if b > tj2 else 0)
                dy = ti1 - a if a < ti1 else (a - ti2 if a > ti2 else 0)
                push(heap, (nd + (dx + 0.4142 * dy if dx > dy else dy + 0.4142 * dx), nd, n2))
        if Vb[r]:
            for l2 in range(3):
                if l2 != l and Fb[l2][r]:
                    nd = d + VIA_COST
                    n2 = l2 * HW + r
                    if nd < dist[n2]:
                        dist[n2] = nd; prev[n2] = node
                        dx = tj1 - j if j < tj1 else (j - tj2 if j > tj2 else 0)
                        dy = ti1 - i if i < ti1 else (i - ti2 if i > ti2 else 0)
                        push(heap, (nd + (dx + 0.4142 * dy if dx > dy else dy + 0.4142 * dx), nd, n2))
    return None, 0, set()


def add_path(board, netinfo, path, width):
    """Turn a cell path into tracks and vias. Returns the new items as dictionaries."""
    new_t, new_v = [], []

    def track(l, a, b):
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(BD.V(a[1] * CELL, a[0] * CELL)); t.SetEnd(BD.V(b[1] * CELL, b[0] * CELL))
        t.SetWidth(pcbnew.FromMM(width)); t.SetLayer(LAYERS[l]); t.SetNet(netinfo)
        board.Add(t)
        new_t.append(dict(net=netinfo.GetNetname(), layer=l, w=width, x1=a[1] * CELL, y1=a[0] * CELL, x2=b[1] * CELL,
                          y2=b[0] * CELL, locked=False, obj=t))

    start = path[0]
    last_dir = None
    for k in range(1, len(path)):
        p, q = path[k - 1], path[k]
        if q[0] != p[0]:                                  # layer change
            if (p[1], p[2]) != (start[1], start[2]):
                track(p[0], (start[1], start[2]), (p[1], p[2]))
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(BD.V(p[2] * CELL, p[1] * CELL)); v.SetWidth(pcbnew.F_Cu, pcbnew.FromMM(VIA_D))
            v.SetDrill(pcbnew.FromMM(VIA_DRILL)); v.SetNet(netinfo); v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            board.Add(v)
            new_v.append(dict(net=netinfo.GetNetname(), x=p[2] * CELL, y=p[1] * CELL, d=VIA_D, locked=False, obj=v))
            start, last_dir = q, None
            continue
        d = (q[1] - p[1], q[2] - p[2])
        if last_dir is not None and d != last_dir:
            track(p[0], (start[1], start[2]), (p[1], p[2]))
            start = p
        last_dir = d
    end = path[-1]
    if (end[1], end[2]) != (start[1], start[2]):
        track(end[0], (start[1], start[2]), (end[1], end[2]))
    return new_t, new_v


def connect(board, netinfo, R, groups, g, hit, cells, width):
    """Lay a found path as tracks and vias and join both ends exactly to the copper they start and end on.
    Returns the new tracks and vias as dictionaries.

    A path ends on a cell of the other group. On a pad or via the end is joined to its centre. On a
    track, the end is joined to the nearest point of that track's centre line; if the track runs where
    the new width has no room (it was necked down there), the last step is made as narrow as that track."""
    name = netinfo.GetNetname()
    new_t, new_v = [], []

    def track(l, a, b, w):
        if math.hypot(a[0] - b[0], a[1] - b[1]) < 0.002:
            return
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(BD.V(*a)); t.SetEnd(BD.V(*b)); t.SetWidth(pcbnew.FromMM(w)); t.SetLayer(LAYERS[l]); t.SetNet(netinfo)
        board.Add(t)
        new_t.append(dict(net=name, layer=l, w=w, x1=a[0], y1=a[1], x2=b[0], y2=b[1], locked=False, obj=t))

    def landing(grp, cell):
        """(point to join to, width there or None for a pad or via)"""
        l, x, y = cell[0], cell[2] * CELL, cell[1] * CELL
        best = None
        for kind, it in grp:
            if kind == 'p' and l in it['layers'] and it['x1'] <= x <= it['x2'] and it['y1'] <= y <= it['y2']:
                return (it['cx'], it['cy']), None
            if kind == 'v' and math.hypot(x - it['x'], y - it['y']) < 0.08:
                return (it['x'], it['y']), None
            if kind == 't' and it['layer'] == l:
                dx, dy = it['x2'] - it['x1'], it['y2'] - it['y1']
                L2 = dx * dx + dy * dy
                u = 0 if L2 == 0 else max(0, min(1, ((x - it['x1']) * dx + (y - it['y1']) * dy) / L2))
                q = (it['x1'] + u * dx, it['y1'] + u * dy)
                d = math.hypot(x - q[0], y - q[1])
                if best is None or d < best[0]:
                    best = (d, q, it['w'])
        return (best[1], best[2]) if best and best[0] <= 2 * CELL else (None, None)

    body = list(cells)
    joins = []                                           # (layer, grid point, landing point, width)
    for grp, last in ((groups[g], False), (groups[hit - 1], True)):
        cell = body[-1] if last else body[0]
        point, w_there = landing(grp, cell)
        if point is None:
            continue
        w_join = width if w_there is None else min(width, w_there)
        inner = (body[-2] if last else body[1]) if len(body) > 1 else None
        if (w_there is not None and w_join < width and R.block[cell[0]][cell[1], cell[2]] and inner is not None and
                inner[0] == cell[0]):
            body = body[:-1] if last else body[1:]       # no room for the full width on this cell
            cell = inner
        joins.append((cell[0], (cell[2] * CELL, cell[1] * CELL), point, w_join))
    if len(body) > 1:
        nt, nv = add_path(board, netinfo, body, width)
        new_t += nt; new_v += nv
    for l, a, b, w in joins:
        track(l, a, b, w)
    return new_t, new_v
