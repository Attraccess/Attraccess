"""DC voltage drop and current density on the supply nets that are routed as tracks.

A net becomes a network of resistors: track segments (rho L / (w t)) and via barrels. Tracks that meet,
end on another track, end in a via or lie on a pad are joined. Current enters at the source pad and
leaves at the load pads; the network is solved for its voltages."""
import collections
import math

import numpy as np

from board import RHO_CU

RHO = RHO_CU * (1 + 0.0039 * 40)        # copper at 60 degC
PLATING = 18e-6                         # copper in a via barrel


def network(board, net):
    tracks, vias, pads = board.net_tracks(net), board.net_vias(net), board.net_pads(net)
    layers = list(board.copper)
    points = collections.defaultdict(list)
    for t in tracks:
        points[t['layer']] += [(t['x1'], t['y1']), (t['x2'], t['y2'])]
    for layer in layers:
        points[layer] += [(v['x'], v['y']) for v in vias] + [(p['x'], p['y']) for p in pads if layer in p['layers']]
    # cut every track where another track's end, a via or a pad centre lies on it
    segments = []
    for t in tracks:
        (x1, y1), (x2, y2) = (t['x1'], t['y1']), (t['x2'], t['y2'])
        length = math.hypot(x2 - x1, y2 - y1)
        cuts = {0.0, 1.0}
        if length > 1e-6:
            for px, py in points[t['layer']]:
                u = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / length ** 2
                if 0.001 < u < 0.999 and math.hypot(x1 + u * (x2 - x1) - px, y1 + u * (y2 - y1) - py) < t['w'] / 2 + 0.01:
                    cuts.add(round(u, 5))
        cuts = sorted(cuts)
        for a, c in zip(cuts, cuts[1:]):
            segments.append((t['layer'], x1 + a * (x2 - x1), y1 + a * (y2 - y1), x1 + c * (x2 - x1), y1 + c * (y2 - y1), t['w']))
    nodes, parent = {}, []

    def node(layer, x, y):
        key = (layer, round(x, 2), round(y, 2))
        if key not in nodes:
            nodes[key] = len(parent)
            parent.append(len(parent))
        return nodes[key]

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def join(ids):
        for i in ids[1:]:
            parent[find(i)] = find(ids[0])

    resistors = []          # (node, node, ohm, 'track' or 'via', width or hole in mm, layer, length in mm)
    for layer, x1, y1, x2, y2, w in segments:
        length = math.hypot(x2 - x1, y2 - y1)
        if length > 1e-6:
            r = RHO * length * 1e-3 / (w * 1e-3 * board.copper[layer])
            resistors.append((node(layer, x1, y1), node(layer, x2, y2), r, 'track', w, layer, length))
    for v in vias:
        reach = v['dia'] / 2 + 0.02
        on = sorted({k[0] for k in nodes if math.hypot(k[1] - v['x'], k[2] - v['y']) < reach}, key=board.depth.get)
        for a, c in zip(on, on[1:]):
            r = RHO * (board.depth[c] - board.depth[a]) * 1e-3 / (math.pi * v['drill'] * 1e-3 * PLATING)
            resistors.append((node(a, v['x'], v['y']), node(c, v['x'], v['y']), r, 'via', v['drill'], a, 0.0))
        for layer in on:
            join([i for k, i in nodes.items() if k[0] == layer and math.hypot(k[1] - v['x'], k[2] - v['y']) < reach])
    pad_node = {}
    for p in pads:
        a = math.radians(p['rot'])
        ids = []
        for k, i in nodes.items():
            dx, dy = k[1] - p['x'], k[2] - p['y']
            lx, ly = dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)
            if k[0] in p['layers'] and abs(lx) <= p['sx'] / 2 + 0.02 and abs(ly) <= p['sy'] / 2 + 0.02:
                ids.append(i)
        if ids:
            join(ids)
            pad_node[p['ref'] + '.' + p['num']] = ids[0]
    return resistors, pad_node, find, len(parent)


def solve(board, net, source, loads):
    """source: 'U105.6'; loads: {pad: amperes}. Returns ({pad: volts lost}, [busy conductors])."""
    resistors, pad_node, find, n = network(board, net)
    missing = [p for p in [source] + list(loads) if p not in pad_node]
    if missing:
        raise ValueError('%s: no track reaches %s' % (net, missing))
    roots = sorted({find(i) for i in range(n)})
    ix = {r: k for k, r in enumerate(roots)}
    g = np.zeros((len(roots), len(roots)))
    for a, c, r, *_ in resistors:
        i, j = ix[find(a)], ix[find(c)]
        if i != j:
            y = 1 / max(r, 1e-7)
            g[i, i] += y; g[j, j] += y; g[i, j] -= y; g[j, i] -= y
    current = np.zeros(len(roots))
    for pad, amp in loads.items():
        current[ix[find(pad_node[pad])]] -= amp
    s = ix[find(pad_node[source])]
    keep = [k for k in range(len(roots)) if k != s]
    v = np.zeros(len(roots))
    v[keep] = np.linalg.lstsq(g[np.ix_(keep, keep)], current[keep], rcond=None)[0]
    drops = {pad: -v[ix[find(pad_node[pad])]] for pad in loads}
    busy = [(abs(v[ix[find(a)]] - v[ix[find(c)]]) / max(r, 1e-7), kind, w, layer, length)
            for a, c, r, kind, w, layer, length in resistors if find(a) != find(c)]
    return drops, busy


def ipc2221(board, w_mm, layer, rise=20.0):
    """Amperes for a temperature rise by IPC-2221 (outer layers k = 0.048, inner 0.024). The inner figure
    is for a track with no plane beside it, so it is far on the safe side here."""
    area = (w_mm / 0.0254) * (board.copper[layer] / 25.4e-6)
    return (0.048 if layer in ('F.Cu', 'B.Cu') else 0.024) * rise ** 0.44 * area ** 0.725


# Every 5 V load at its supply-sizing figure at once (design notes, "Power budget"): 1.65 A on the
# 5 V rail with the LED ring at its switch's highest current limit (0.31 A), more than the firmware ever draws.
LED_SWITCH_MAX = 0.31
RAIL_5V = {'U103.4': 1.00, 'L601.1': 0.13, 'FB501.1': 0.12, 'R702.1': 0.09, 'U705.1': LED_SWITCH_MAX}
LED_RING = {'D%d.3' % (701 + k if k < 8 else 702 + k): LED_SWITCH_MAX / 16 for k in range(16)}
CASES = [
    ('+5V', 'U105.6', RAIL_5V, 'from USB (eFuse)'), ('+5V', 'Q102.3', RAIL_5V, 'from the DC converter'),
    ('+5V', 'Q101.3', RAIL_5V, 'from PoE'),
    ('+5V_LED', 'U705.6', LED_RING, 'switch to the LED ring'),
    ('VBUS', 'J101.A4B9', {'F101.1': 1.65}, 'USB connector to fuse'),
    ('+5V_USB', 'FB101.2', {'U105.5': 1.65}, 'ferrite to eFuse'),
    ('VDC_IN', 'J103.1', {'F102.1': 0.77}, 'terminal to fuse, 12 V supply'),
    ('VDC', 'L103.2', {'U104.3': 0.77}, 'filter to converter'),
    ('+5V_DC', 'L102.2', {'Q102.2': 1.65}, 'converter to ideal diode'),
    ('+5V_POE', 'U102.1', {'Q101.2': 1.65}, 'PoE module to ideal diode'),
    ('NFC_VBAT', 'FB501.2', {'U501.40': 0.15}, 'PN532 supply'),
]
