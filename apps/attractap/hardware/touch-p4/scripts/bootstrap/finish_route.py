"""Grid router that closes the connections the autorouter leaves open.

Usage: python3 finish_route.py [board.kicad_pcb] [--only NET] [--dry]
       python3 finish_route.py [board.kicad_pcb] --pours        (after the zones are filled)

It works on a 0.05 mm grid over the three routing layers (F.Cu, In2.Cu, B.Cu), one connection at a
time, shortest path first. Every other net's copper is an obstacle, enlarged by the clearance and
half the new track's width. If a connection is boxed in, it takes the cheapest way across unlocked
tracks of other nets. Only the track pieces and vias it actually collides with are removed; the
nets they belong to are repaired right away, which keeps the rest of their route where it was.

Ground and 3.3 V are connected through copper pours, which this script cannot see on its own. They
are left out of the normal run. With --pours the script asks KiCad what is still unconnected (the
board must be saved with filled zones): pads cut off from the pours, and anything of the other nets
that KiCad judges differently from the first run. It links those.

The --pours run ends with a clean-up: vias that join nothing (a fixed fan-out via the routers did not
use) are removed, and tracks with a loose end are cut back to their last junction.
"""

import math
import sys

import numpy as np
import pcbnew

import board as BD
from route_grid import (
    CELL,
    GRAVE,
    JOIN,
    MARGIN,
    POUR_NETS,
    ZONES,
    board_items,
    build_raster,
    class_of,
    clusters,
    connect,
    group_box,
    kicad_clusters,
    search,
    short,
)


MAX_RIPS = 14                       # how often one net may take part in a rip-up


def route_pours(board, pads, tracks, vias):
    """Link what KiCad reports as unconnected: pads cut off from the ground and 3.3 V pours, and pads
    of any other net that this script's own check took for connected."""
    done, failed = 0, []
    names = sorted({p['net'] for p in pads if p['net'] and not p['net'].startswith('unconnected-')},
                   key=lambda n: (short(n) not in POUR_NETS, n))
    for net in names:
        groups = kicad_clusters(board, net, pads, tracks, vias)
        if len(groups) < 2:
            continue
        print('%s: %d groups' % (short(net), len(groups)), flush=True)
        netinfo = board.FindNet(net)
        clearance, width = class_of(net)
        while len(groups) > 1:
            g = min(range(len(groups)), key=lambda k: len(groups[k]))
            cells = None
            # the last two steps look across the whole board: a pour island far from the rest of its net
            for w, margin, limit in ((width, 4, 1500000), (0.15, 6, 1500000), (0.15, 16, 1500000),
                                     (0.2, 45, 8000000), (0.2, 150, 30000000)):
                R = build_raster(board, net, w, clearance, pads, tracks, vias, groups)
                cells, hit, _ = search(R, groups, g, margin, limit=limit)
                if cells:
                    break
            if not cells:
                it = groups[g][0][1]
                failed.append('%s at %s.%s' % (short(net), it.get('ref'), it.get('num')))
                print('  %-10s FAILED at %s.%s' % (short(net), it.get('ref'), it.get('num')), flush=True)
                groups.pop(g)
                continue
            nt, nv = connect(board, netinfo, R, groups, g, hit, cells, w)
            tracks += nt; vias += nv
            merged = groups[g] + groups[hit - 1] + [('t', t) for t in nt] + [('v', v) for v in nv]
            keep = [grp for k, grp in enumerate(groups) if k not in (g, hit - 1)]
            groups = keep + [merged]
            done += 1
            it = merged[0][1]
            print('  %-10s %s.%s  %d vias  %.1f mm' % (short(net), it.get('ref'), it.get('num'), len(nv), len(cells) * CELL), flush=True)
    return done, failed


def conflicts(cells, width, clearance, net, tracks, vias):
    """Unlocked tracks and vias of other nets that a new track of this width along the cell path
    would come too close to. Same distances as build_raster uses."""
    half = width / 2 + MARGIN
    pts = [np.array([(j * CELL, i * CELL) for l, i, j in cells if l == k], dtype=float).reshape(-1, 2) for k in range(3)]
    every = np.array([(j * CELL, i * CELL) for _l, i, j in cells], dtype=float)

    def hit(P, x1, y1, x2, y2, r):
        if not len(P):
            return False
        if (min(x1, x2) - r > P[:, 0].max() or max(x1, x2) + r < P[:, 0].min() or
                min(y1, y2) - r > P[:, 1].max() or max(y1, y2) + r < P[:, 1].min()):
            return False
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        u = np.zeros(len(P)) if L2 == 0 else np.clip(((P[:, 0] - x1) * dx + (P[:, 1] - y1) * dy) / L2, 0, 1)
        return bool((((P[:, 0] - x1 - u * dx) ** 2 + (P[:, 1] - y1 - u * dy) ** 2) <= r * r).any())

    out = []
    for t in tracks:
        if t['net'] != net and not t['locked'] and short(t['net']) not in POUR_NETS:
            r = t['w'] / 2 + max(clearance, class_of(t['net'])[0]) + half + 0.03
            if hit(pts[t['layer']], t['x1'], t['y1'], t['x2'], t['y2'], r):
                out.append(('t', t))
    for v in vias:
        if v['net'] != net and not v['locked'] and short(v['net']) not in POUR_NETS:
            r = v['d'] / 2 + max(clearance, class_of(v['net'])[0]) + half + 0.03
            if hit(every, v['x'], v['y'], v['x'], v['y'], r):
                out.append(('v', v))
    return out


def take_out(board, items, tracks, vias):
    for kind, it in items:
        board.Remove(it['obj'])
        GRAVE.append(it['obj'])
        (tracks if kind == 't' else vias).remove(it)


def drop_orphans(board, net, pads, tracks, vias):
    """Remove pieces of a net that hold no pad and nothing locked (left between two cuts)."""
    n = 0
    for grp in clusters(net, pads, tracks, vias):
        if not any(kind == 'p' or it['locked'] for kind, it in grp):
            take_out(board, grp, tracks, vias)
            n += len(grp)
    return n


def tidy(board, pads, tracks, vias, only=None, fixed=False):
    """Remove vias that join nothing and cut tracks with a loose end back to their last junction.
    ``only``: look at this net alone. ``fixed``: also treat the locked routes this way (a fan-out via
    the routers did not need); that is for the very end. Nets with a pour are left alone: there a via
    or a track end may connect to the pour. Returns the number of items changed."""
    poured = {z[0] for z in ZONES if z[0]}
    changed = 0
    skip = lambda it: (it['net'] in poured or not it['net'] or (only and it['net'] != only) or
                       (it['locked'] and not fixed))

    def dist(x, y, t):
        dx, dy = t['x2'] - t['x1'], t['y2'] - t['y1']
        L2 = dx * dx + dy * dy
        u = 0 if L2 == 0 else max(0, min(1, ((x - t['x1']) * dx + (y - t['y1']) * dy) / L2))
        return math.hypot(x - t['x1'] - u * dx, y - t['y1'] - u * dy), u

    gone = set()

    def drop(it, lst):
        board.Remove(it['obj'])
        GRAVE.append(it['obj'])
        gone.add(id(it))
        lst[:] = [o for o in lst if o is not it]

    while True:
        before = changed
        by_net = {}
        for t in tracks:
            by_net.setdefault(t['net'], []).append(t)
        for v in list(vias):
            if skip(v):
                continue
            # as KiCad connects them: a track end inside the via's pad, or the via's centre on the track
            touching = [t for t in by_net.get(v['net'], [])
                        if dist(v['x'], v['y'], t)[0] <= max(JOIN, t['w'] / 2) or
                        min(math.hypot(t['x1'] - v['x'], t['y1'] - v['y']),
                            math.hypot(t['x2'] - v['x'], t['y2'] - v['y'])) <= v['d'] / 2]
            layers = {t['layer'] for t in touching}
            for q in pads:
                if q['net'] == v['net'] and q['x1'] <= v['x'] <= q['x2'] and q['y1'] <= v['y'] <= q['y2']:
                    layers |= set(range(3)) if q['hole'] else set(q['layers'])
            if len(layers) < 2:
                # a via that tracks of one layer end in joins them only through its pad: join them at its
                # centre on that layer instead, then the via goes
                for t in touching:
                    ends = ((t['x1'], t['y1']), (t['x2'], t['y2']))
                    ex, ey = min(ends, key=lambda e: math.hypot(e[0] - v['x'], e[1] - v['y']))
                    if len(touching) > 1 and 0.002 <= math.hypot(ex - v['x'], ey - v['y']) <= v['d'] / 2:
                        obj = pcbnew.PCB_TRACK(board)
                        obj.SetStart(BD.V(ex, ey)); obj.SetEnd(BD.V(v['x'], v['y'])); obj.SetWidth(t['obj'].GetWidth())
                        obj.SetLayer(t['obj'].GetLayer()); obj.SetNet(t['obj'].GetNet()); obj.SetLocked(t['locked'])
                        board.Add(obj)
                        new = dict(net=t['net'], layer=t['layer'], w=t['w'], x1=ex, y1=ey, x2=v['x'], y2=v['y'],
                                   locked=t['locked'], obj=obj)
                        tracks.append(new)
                        by_net[t['net']].append(new)      # the track pass below must see it already
                drop(v, vias)
                changed += 1
        for t in list(tracks):
            if skip(t) or id(t) in gone:
                continue
            others = [o for o in by_net[t['net']] if o is not t and o['layer'] == t['layer'] and id(o) not in gone]
            length = math.hypot(t['x2'] - t['x1'], t['y2'] - t['y1'])
            # nothing, or a stub so short that both its ends lie on one and the same track
            if length < 0.002 or (length < 0.1 and any(dist(t['x1'], t['y1'], o)[0] <= JOIN and
                                                       dist(t['x2'], t['y2'], o)[0] <= JOIN for o in others)):
                drop(t, tracks)
                changed += 1
                continue
            for end, (x, y) in enumerate(((t['x1'], t['y1']), (t['x2'], t['y2']))):
                held = any(q['net'] == t['net'] and t['layer'] in (range(3) if q['hole'] else q['layers']) and
                           q['x1'] - 0.01 <= x <= q['x2'] + 0.01 and q['y1'] - 0.01 <= y <= q['y2'] + 0.01 for q in pads)
                held = held or any(v['net'] == t['net'] and math.hypot(x - v['x'], y - v['y']) <= v['d'] / 2 for v in vias)
                held = held or any(dist(x, y, o)[0] <= max(JOIN, o['w'] / 2) for o in others)
                if held:
                    continue
                # junctions along this track: ends of other tracks and vias on its centre line
                taps = [dist(px, py, t) for o in others for px, py in ((o['x1'], o['y1']), (o['x2'], o['y2']))]
                taps += [dist(v['x'], v['y'], t) for v in vias if v['net'] == t['net']]
                taps = [u if end else 1 - u for d, u in taps if d <= JOIN]                  # 1 = at the loose end
                if not taps:
                    drop(t, tracks)
                else:
                    # the new end stays on this track's own line, so its clearances do not change
                    u = max(taps) if end else 1 - max(taps)
                    px, py = t['x1'] + u * (t['x2'] - t['x1']), t['y1'] + u * (t['y2'] - t['y1'])
                    if end:
                        t['x2'], t['y2'] = px, py
                        t['obj'].SetEnd(BD.V(px, py))
                    else:
                        t['x1'], t['y1'] = px, py
                        t['obj'].SetStart(BD.V(px, py))
                changed += 1
                break
        if changed == before:
            return changed


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = args[0] if args else BD.PCB
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    dry = '--dry' in sys.argv
    board = pcbnew.LoadBoard(path)
    pads, tracks, vias = board_items(board)
    if '--pours' in sys.argv:
        done, failed = route_pours(board, pads, tracks, vias)
        print('tidied %d unused vias and loose track ends' % tidy(board, pads, tracks, vias, fixed=True))
        pcbnew.SaveBoard(path, board)
        print('linked %d connections, failed: %s' % (done, ', '.join(failed) or 'none'))
        return
    nets = sorted({p['net'] for p in pads if p['net'] and not p['net'].startswith('unconnected-')})
    todo = []
    for net in nets:
        if short(net) in POUR_NETS or (only and short(net) != only):
            continue
        groups = clusters(net, pads, tracks, vias)
        if len(groups) > 1:
            boxes = [group_box(g) for g in groups]
            span = (max(b[2] for b in boxes) - min(b[0] for b in boxes)) + (max(b[3] for b in boxes) - min(b[1] for b in boxes))
            todo.append((net, len(groups), span))
    todo.sort(key=lambda t: t[2])                       # short, local connections first
    print('%d nets with open connections: %s' % (len(todo), ' '.join('%s(%d)' % (short(n), c - 1) for n, c, _ in todo)))
    if dry:
        return
    done = 0
    failed = []
    queue = [n for n, _, _ in todo]
    ripped = {}                                           # net -> how often it was involved in a rip-up
    while queue:
        net = queue.pop(0)
        clearance, width = class_of(net)
        netinfo = board.FindNet(net)
        drop_orphans(board, net, pads, tracks, vias)
        last = None
        while True:
            groups = clusters(net, pads, tracks, vias)
            if len(groups) < 2:
                tidy(board, pads, tracks, vias, only=net)         # stubs left at a cut
                break
            if last is not None and len(groups) >= last:
                print('  %-22s no progress, giving up' % short(net), flush=True)
                failed.append(net)
                break
            last = len(groups)
            order = sorted(range(len(groups)), key=lambda g: len(groups[g]))
            ok = False
            cells = None
            tries = ((width, 4), (width, 14), (0.15, 14), (0.15, 40)) if width > 0.15 else ((width, 4), (width, 14), (width, 40))
            for w, margin in tries:
                R = build_raster(board, net, w, clearance, pads, tracks, vias, groups)
                for g in order[:2]:
                    cells, hit, _ = search(R, groups, g, margin)
                    if cells:
                        ok = True
                        break
                if ok:
                    break
            if not ok and ripped.get(net, 0) < MAX_RIPS:
                # boxed in: cross movable tracks where that costs least and take out only what is in the way
                names = {}
                w = min(width, 0.2)
                R = build_raster(board, net, w, clearance, pads, tracks, vias, groups, soft_nets=names)
                weight = np.zeros(len(names) + 1, dtype=np.uint8)
                for n, i in names.items():
                    weight[i + 1] = min(40, 1 + 3 * ripped.get(n, 0))
                R.weight = weight
                for g in order[:2]:
                    cells, hit, _ = search(R, groups, g, 14, limit=4000000)
                    if cells:
                        break
                if cells:
                    items = conflicts(cells, w, clearance, net, tracks, vias)
                    victims = []
                    for _kind, it in items:
                        if it['net'] not in victims:
                            victims.append(it['net'])
                    take_out(board, items, tracks, vias)
                    for v in victims:
                        ripped[v] = ripped.get(v, 0) + 1
                    ripped[net] = ripped.get(net, 0) + 1
                    queue = victims + [q for q in queue if q not in victims]      # repair them next
                    print('  %-22s cut %d pieces of %s' % (short(net), len(items), ' '.join(short(v) for v in victims)), flush=True)
                    ok = True
            if not ok:
                if ripped.get(net, 0) >= MAX_RIPS:
                    why = 'took part in %d rip-ups already' % MAX_RIPS
                else:
                    why = 'no way through, even across movable tracks'
                print('  %-22s FAILED (%s)' % (short(net), why), flush=True)
                failed.append(net)
                break
            nt, nv = connect(board, netinfo, R, groups, g, hit, cells, w)
            tracks += nt; vias += nv
            done += 1
            print('  %-22s %2d vias  %5.1f mm  width %.2f' % (short(net), len(nv), len(cells) * CELL, w), flush=True)
            if done % 6 == 0:                             # checkpoint: a later run continues from here
                pcbnew.SaveBoard(path, board)
    print('removed %d loose track ends and vias' % tidy(board, pads, tracks, vias))
    pcbnew.SaveBoard(path, board)
    failed = [n for n in dict.fromkeys(failed) if len(clusters(n, pads, tracks, vias)) > 1]   # some were closed later
    print('routed %d connections, failed: %s' % (done, ' '.join(short(n) for n in failed) or 'none'))


if __name__ == '__main__':
    main()
