"""Layout measurements: the decoupling path of every ESP32-P4 supply pin, the crystal tracks, and length and
vias of the fast nets (USB, RMII, SDIO, Ethernet pairs).

Usage: python3 scripts/layout_report.py fab/reports/board.json
(board.json is written by `pcb.sh simulate`, sim/dump_board.py.)

The decoupling path runs along the copper: track from the pin, down the via to the plane, through the plane
straight to the capacitor's via, up and along its track to the capacitor's pad. Vias count with the depth
from the outer layer to the plane. A 0 ohm resistor counts as copper.
"""
import heapq
import json
import math
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'bootstrap'))
import copper_path  # noqa: E402  (the track between two pads, without stubs)

MCU = 'U201'
SUPPLY = re.compile(r'^(\+3V3|VDD|VDDO)')
FAST = [('USB', re.compile(r'^USB_D[NP]')), ('RMII', re.compile(r'^(RMII_|PHY_CLK50)')),
        ('SDIO', re.compile(r'^SDIO_')), ('Ethernet pairs', re.compile(r'^MDI_'))]


def short(net):
    return net.split('/')[-1]


def layer_z(stackup):
    """depth of each copper layer below the top surface, mm"""
    z, out = 0.0, {}
    for s in stackup:
        if s['type'] == 'copper':
            out[s['name']] = z + s['thickness'] / 2
        z += s['thickness'] or 0
    return out


def inside_poly(pt, poly):
    x, y = pt
    n, hit = len(poly), False
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def in_zone(pt, zone):
    return any(inside_poly(pt, p['outline']) and not any(inside_poly(pt, h) for h in p.get('holes', []))
               for p in zone['polys'])


def pad_box(p):
    w, h = p['sx'], p['sy']
    if round(p.get('rot', 0)) % 180 == 90:
        w, h = h, w
    return p['x'] - w / 2, p['y'] - h / 2, p['x'] + w / 2, p['y'] + h / 2


class Copper:
    """the copper of a board as a graph: pads, track ends and via layers are nodes, lengths in mm"""

    def __init__(self, board, zero_ohm=()):
        self.b = board
        self.z = layer_z(board['stackup'])
        self.edges = defaultdict(list)
        self.pads = {(p['ref'], p['num']): p for p in board['pads']}
        by_layer = defaultdict(list)
        for i, t in enumerate(board['tracks']):
            a, b = self._pt(t['layer'], t['x1'], t['y1']), self._pt(t['layer'], t['x2'], t['y2'])
            self._edge(a, b, math.hypot(t['x2'] - t['x1'], t['y2'] - t['y1']))
            by_layer[(t['layer'], t['net'])].append(t)
        coppers = [n for n in self.z]
        for i, v in enumerate(board['vias']):
            ls = sorted(coppers, key=lambda n: self.z[n])
            for a, b in zip(ls, ls[1:]):
                self._edge(('via', i, a), ('via', i, b), self.z[b] - self.z[a])
        # a track end on another track of its net (a T-junction, as KiCad connects it)
        for (layer, net), ts in by_layer.items():
            for t in ts:
                for x, y in ((t['x1'], t['y1']), (t['x2'], t['y2'])):
                    for o in ts:
                        if o is t:
                            continue
                        dx, dy = o['x2'] - o['x1'], o['y2'] - o['y1']
                        L2 = dx * dx + dy * dy
                        if L2 == 0:
                            continue
                        u = ((x - o['x1']) * dx + (y - o['y1']) * dy) / L2
                        if 0 < u < 1 and math.hypot(x - o['x1'] - u * dx, y - o['y1'] - u * dy) <= o['w'] / 2:
                            node = self._pt(layer, x, y)
                            L = math.sqrt(L2)
                            self._edge(node, self._pt(layer, o['x1'], o['y1']), u * L)
                            self._edge(node, self._pt(layer, o['x2'], o['y2']), (1 - u) * L)
        # track ends on pads and vias
        for (layer, net), ts in by_layer.items():
            for t in ts:
                for x, y in ((t['x1'], t['y1']), (t['x2'], t['y2'])):
                    node = self._pt(layer, x, y)
                    for p in board['pads']:
                        if p['net'] == net and layer in p['layers']:
                            x1, y1, x2, y2 = pad_box(p)
                            if x1 - 1e-3 <= x <= x2 + 1e-3 and y1 - 1e-3 <= y <= y2 + 1e-3:
                                self._edge(node, ('pad', p['ref'], p['num']), math.hypot(x - p['x'], y - p['y']))
                    for i, v in enumerate(board['vias']):
                        if v['net'] == net and math.hypot(x - v['x'], y - v['y']) <= v['dia'] / 2 + 1e-3:
                            self._edge(node, ('via', i, layer), 0.0)
        # planes: the vias of a net inside its zone, joined straight through the copper
        for zone in board['zones']:
            if zone['net'] == 'GND':
                continue
            vias = [(i, v) for i, v in enumerate(board['vias']) if v['net'] == zone['net']
                    and in_zone((v['x'], v['y']), zone)]
            for k, (i, a) in enumerate(vias):
                for j, b in vias[k + 1:]:
                    self._edge(('via', i, zone['layer']), ('via', j, zone['layer']),
                               math.hypot(a['x'] - b['x'], a['y'] - b['y']))
            # pads on the plane's own layer
            for p in board['pads']:
                if p['net'] == zone['net'] and zone['layer'] in p['layers'] and in_zone((p['x'], p['y']), zone):
                    for i, v in vias:
                        self._edge(('pad', p['ref'], p['num']), ('via', i, zone['layer']),
                                   math.hypot(p['x'] - v['x'], p['y'] - v['y']))
        for ref in zero_ohm:
            a, b = self.pads.get((ref, '1')), self.pads.get((ref, '2'))
            if a and b:
                self._edge(('pad', ref, '1'), ('pad', ref, '2'), math.hypot(a['x'] - b['x'], a['y'] - b['y']))

    @staticmethod
    def _pt(layer, x, y):
        return ('pt', layer, round(x, 3), round(y, 3))

    def _edge(self, a, b, w):
        self.edges[a].append((b, w))
        self.edges[b].append((a, w))

    def distances(self, start, limit=60.0):
        dist, todo = {start: 0.0}, [(0.0, start)]
        while todo:
            d, n = heapq.heappop(todo)
            if d > dist.get(n, 1e9) or d > limit:
                continue
            for m, w in self.edges[n]:
                if d + w < dist.get(m, 1e9):
                    dist[m] = d + w
                    heapq.heappush(todo, (d + w, m))
        return dist


def decoupling(board, cu):
    caps = defaultdict(list)               # net -> [(ref, pad number)] of capacitors to GND
    by_ref = defaultdict(dict)
    for p in board['pads']:
        by_ref[p['ref']][p['num']] = p
    for ref, ps in by_ref.items():
        if ref.startswith('C') and len(ps) == 2:
            nets = {short(p['net']) for p in ps.values()}
            if 'GND' in nets and len(nets) == 2:
                for num, p in ps.items():
                    if short(p['net']) != 'GND':
                        caps[p['net']].append((ref, num))
    rows = []
    for p in sorted((p for p in board['pads'] if p['ref'] == MCU), key=lambda p: int(p['num']) if p['num'].isdigit() else 999):
        net = short(p['net'])
        if not SUPPLY.match(net):
            continue
        dist = cu.distances(('pad', MCU, p['num']))
        best = sorted((dist[('pad', r, n)], r) for r, n in caps[p['net']] if ('pad', r, n) in dist)
        straight = min((math.hypot(cu.pads[(r, n)]['x'] - p['x'], cu.pads[(r, n)]['y'] - p['y']), r)
                       for r, n in caps[p['net']]) if caps[p['net']] else (float('nan'), '-')
        bulk = [(d, r) for d, r in best if r in BULK]
        rows.append((p['num'], net, best[0] if best else (float('nan'), '-'), straight,
                     bulk[0] if bulk else None))
    return rows


BULK = set()          # filled from the board: capacitors of 4.7 uF and more


# Switching converters: the loop that carries the switched current, from the start pad (the IC's supply pin
# for a buck, the diode's cathode for the boost) to the capacitor there, through it to ground and back to
# the IC's ground pin. (IC, title, start pad, IC ground pin, switch-node net)
SWITCHERS = [
    ('U104', 'AP63205, DC input to 5 V', ('U104', '3'), '4', 'DC_SW'),
    ('U103', 'TLV62569, 5 V to 3.3 V', ('U103', '4'), '2', 'BUCK_SW'),
    ('U302', 'TLV62569, 5 V to 3.3 V for the Wi-Fi module', ('U302', '4'), '2', 'WIFI_BUCK_SW'),
    ('U202', 'TLV62569, 3.3 V to 1.1 V core', ('U202', '4'), '2', 'DCDC_SW'),
    ('U601', 'AP3032, backlight boost', ('D601', '1'), '2', 'BL_SW'),
]


def switchers(board, cu):
    """Per converter: the nearest capacitor on the hot loop's supply side and its copper path, the ground
    side through the fill (straight), the loop's area, ground vias at both ends, the switch node's copper."""
    rows = []
    by = defaultdict(dict)
    for p in board['pads']:
        by[p['ref']][p['num']] = p
    for ic, title, start, gnd_pin, sw in SWITCHERS:
        if ic not in by:
            continue
        a = by[start[0]][start[1]]
        dist = cu.distances(('pad',) + start)
        caps = []
        for ref, ps in by.items():
            if ref.startswith('C') and len(ps) == 2:
                nets = {short(p['net']): n for n, p in ps.items()}
                if set(nets) == {short(a['net']), 'GND'} and ('pad', ref, nets[short(a['net'])]) in dist:
                    caps.append((dist[('pad', ref, nets[short(a['net'])])], ref, ps[nets[short(a['net'])]], ps[nets['GND']]))
        d, cref, cv, cg = min(caps, key=lambda c: c[0])
        g = by[ic][gnd_pin]
        back = math.hypot(cg['x'] - g['x'], cg['y'] - g['y'])
        poly = [(a['x'], a['y']), (cv['x'], cv['y']), (cg['x'], cg['y']), (g['x'], g['y'])]
        area = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]))) / 2
        vias = lambda q: sum(1 for v in board['vias'] if short(v['net']) == 'GND' and math.hypot(v['x'] - q['x'], v['y'] - q['y']) < 1.0)
        node = sum(math.hypot(t['x2'] - t['x1'], t['y2'] - t['y1']) * t['w'] for t in board['tracks']
                   if short(t['net']) == sw and t['layer'] in ('F.Cu', 'B.Cu'))
        node += sum(p['sx'] * p['sy'] for p in board['pads'] if short(p['net']) == sw)
        rows.append((ic, title, cref, d, back, area, vias(g), vias(cg), node))
    return rows


def path_length(cu, a, b):
    d = cu.distances(a)
    return d.get(b, float('nan'))


def main(path):
    board = json.load(open(path))
    values = {f['ref']: f['value'] for f in board['footprints']}
    zero = [r for r, v in values.items() if r.startswith('R') and v in ('0R', '0')]
    for r, v in values.items():
        m = re.match(r'([\d.]+)u', v)
        if r.startswith('C') and m and float(m.group(1)) >= 4.7:
            BULK.add(r)
    cu = Copper(board, zero_ohm=zero)
    print('Decoupling of the ESP32-P4 supply pins: copper path from the pin to the nearest capacitor (mm)')
    print('  %-4s %-11s %-14s %-14s %s' % ('pin', 'net', 'path, cap', 'straight', 'nearest >= 4.7 uF'))
    worst = 0.0
    for num, net, (d, ref), (s, sref), bulk in decoupling(board, cu):
        worst = max(worst, d)
        print('  %-4s %-11s %5.1f %-8s %5.1f %-8s %s' % (num, net, d, ref, s, sref,
                                                         '%5.1f %s' % bulk if bulk else '-'))
    print('  longest path: %.1f mm' % worst)
    print()
    print('Crystal Y201: copper path from the MCU pin to the crystal pad (mm)')
    for p in board['pads']:
        if p['ref'] == MCU and short(p['net']).startswith('XTAL'):
            dist = cu.distances(('pad', MCU, p['num']))
            ends = [(dist[('pad', 'Y201', n)], n) for n in ('1', '3') if ('pad', 'Y201', n) in dist]
            if ends:
                print('  pin %-4s %-8s %.1f mm to Y201 pad %s' % (p['num'], short(p['net']), *min(ends)))
    print()
    print('Switching converters: hot loop (capacitor, supply path, ground path through the fill, loop area,')
    print('ground vias within 1 mm of the IC ground pin and of the capacitor, switch-node copper)')
    for ic, title, cref, d, back, area, vg, vc, node in switchers(board, cu):
        print('  %-5s %-32s %-5s %4.1f mm  %4.1f mm  %5.1f mm2  vias %d + %d  node %5.1f mm2'
              % (ic, title, cref, d, back, area, vg, vc, node))
    print()
    print('Fast nets: track length and vias')
    length, vias, widths = defaultdict(float), defaultdict(int), defaultdict(set)
    for t in board['tracks']:
        length[short(t['net'])] += math.hypot(t['x2'] - t['x1'], t['y2'] - t['y1'])
        widths[short(t['net'])].add((t['layer'], round(t['w'], 3)))
    for v in board['vias']:
        vias[short(v['net'])] += 1
    for title, pat in FAST:
        nets = sorted(n for n in length if pat.match(n))
        print('  %s' % title)
        for n in nets:
            print('    %-14s %6.1f mm  %d vias  widths %s' % (n, length[n], vias[n],
                  ', '.join('%s %.3f' % w for w in sorted(widths[n]))))
    # ESP32-C5 HDG 1.4.9: CMD and D0 to D3 within 50 mil (1.27 mm) of CLK, at most 2000 mil (50.8 mm) in all,
    # no change of layer (the clock counts from the MCU's pad, through its series resistor). The bus runs on
    # the back layer (routes_sdio.py): two vias in every line, one at each end, is what it is built for
    def pad_to_pad(net, a, c):
        """the line from pad to pad, without the stub to its pull-up"""
        pads = [p for p in board['pads'] if short(p['net']) == net]
        got = copper_path.path([t for t in board['tracks'] if short(t['net']) == net],
                               [v for v in board['vias'] if short(v['net']) == net],
                               next(p for p in pads if p['ref'] == a), next(p for p in pads if p['ref'] == c))
        return sum(got.values()) if got else float('nan')
    clk = pad_to_pad('SDIO_CLK_M', MCU, 'R304') + pad_to_pad('SDIO_CLK', 'R304', 'U301')
    rest = {n: pad_to_pad(n, MCU, 'U301') for n in ('SDIO_CMD', 'SDIO_D0', 'SDIO_D1', 'SDIO_D2', 'SDIO_D3')}
    worst = max(rest, key=lambda n: abs(rest[n] - clk))
    print('  SDIO against the ESP32-C5 HDG 1.4.9: CLK %.1f mm; %s differs most, by %.1f mm (rule 1.27); longest %.1f mm '
          '(rule 50.8); vias %d to %d per line (rule 0; built for 2)'
          % (clk, worst, rest[worst] - clk, max(list(rest.values()) + [clk]),
             min(vias[n] for n in list(rest) + ['SDIO_CLK']), max(vias[n] for n in list(rest) + ['SDIO_CLK', 'SDIO_CLK_M'])))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'fab', 'reports', 'board.json'))
