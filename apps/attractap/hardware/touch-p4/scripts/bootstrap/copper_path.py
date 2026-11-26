"""The track a signal runs along between two pads of its net, without the stubs that branch off it (a pull-up,
a test point). Used by scripts/layout_report.py and sim/si.py on the board as sim/dump_board.py writes it:
tracks with x1, y1, x2, y2, layer; vias with x, y; pads with x, y, sx, sy, rot, layers."""
import heapq
import math


def _key(layer, x, y):
    return layer, round(x, 3), round(y, 3)


def _on(pad, x, y):
    w, h = pad['sx'], pad['sy']
    if round(pad.get('rot') or 0) % 180 == 90:
        w, h = h, w
    return abs(x - pad['x']) <= w / 2 + 1e-6 and abs(y - pad['y']) <= h / 2 + 1e-6


def path(tracks, vias, pad_a, pad_b):
    """{layer: millimetres} of the shortest way along the tracks from pad_a to pad_b (vias join the layers),
    or None when they are not joined."""
    graph = {}
    for t in tracks:
        a, b = _key(t['layer'], t['x1'], t['y1']), _key(t['layer'], t['x2'], t['y2'])
        d = math.hypot(t['x2'] - t['x1'], t['y2'] - t['y1'])
        graph.setdefault(a, []).append((b, d, t['layer']))
        graph.setdefault(b, []).append((a, d, t['layer']))
    layers = {k[0] for k in graph}
    for v in vias:
        here = [_key(l, v['x'], v['y']) for l in layers if _key(l, v['x'], v['y']) in graph]
        for a in here:
            for b in here:
                if a != b:
                    graph[a].append((b, 0.0, None))
    on_layer = lambda pad, layer: layer in pad['layers'] or '*.Cu' in pad['layers']
    starts = [k for k in graph if on_layer(pad_a, k[0]) and _on(pad_a, k[1], k[2])]
    ends = {k for k in graph if on_layer(pad_b, k[0]) and _on(pad_b, k[1], k[2])}
    best = {k: 0.0 for k in starts}
    came = {}
    heap = [(0.0, k) for k in starts]
    while heap:
        d, k = heapq.heappop(heap)
        if d > best.get(k, 1e9):
            continue
        if k in ends:
            out = {}
            while k in came:
                k, step, layer = came[k]
                if layer:
                    out[layer] = out.get(layer, 0.0) + step
            return out
        for n, step, layer in graph[k]:
            if d + step < best.get(n, 1e9):
                best[n] = d + step
                came[n] = (k, step, layer)
                heapq.heappush(heap, (d + step, n))
    return None
