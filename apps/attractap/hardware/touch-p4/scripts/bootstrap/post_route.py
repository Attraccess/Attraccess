"""After the routing is complete: make it more robust without changing where anything runs.

Usage: python3 post_route.py [board.kicad_pcb]            widen tracks, enlarge vias, add ground vias
       python3 post_route.py [board.kicad_pcb] --fix      after the zone fill: take back what KiCad's
                                                          design rule check does not accept

Four passes, in this order:

1. Tracks. Supply tracks are widened towards the widths in WIDEN_NET and WIDEN_CLASS, as far as the copper
   around them allows, and the autorouter's neck-downs towards MIN_TRACK. A track that ends on a pad is no
   wider than the pad.
2. Vias. The small signal vias get a larger pad (ring 0.15 mm instead of 0.125 mm) where there is room.
3. Return vias. Every via of a fast signal gets a ground via close by, so the return current can change
   planes where the signal does.
4. Stitching. Ground vias tie the ground fills and planes together: at STITCH_RF pitch around the Wi-Fi
   antenna, where an unstitched piece of fill would resonate near 2.4 GHz, at STITCH pitch elsewhere.

Distances are worked out here (to the real pad outlines, which KiCad supplies) and then judged by KiCad:
the --fix run reads the design rule check and takes back every change that is part of a violation. It
also gives a pad that has lost its thermal spokes a solid connection. It ends when the check is clean.
"""

import json
import math
import os
import subprocess
import sys

import pcbnew

import board as BD
import geometry as G
from route_grid import class_of, short

mm = pcbnew.ToMM
F, B_ = pcbnew.F_Cu, pcbnew.B_Cu
REPORTS = os.path.normpath(os.path.join(BD.HERE, '..', '..', 'fab', 'reports'))
STATE = os.path.join(REPORTS, 'post_route.json')

# Target widths in mm, by net (short name) or by net class. The copper next to a track decides how much
# of it a track gets.
WIDEN_NET = {'VDD_HP': 0.6, 'VDD_HP_1': 0.6, '+3V3': 0.5, '+5V': 0.8, 'VBUS': 0.8, 'VBUS_F': 0.8,
             '+5V_USB': 0.8, '+5V_POE': 0.8, '+5V_DC': 0.8, '+3V3_WIFI': 0.6}
WIDEN_CLASS = {'Power': 0.4, 'Power5V': 0.6, 'NFC_RF': 0.3, 'DCSig': 0.25}      # (the USB pair has its 90 ohm width)
SWITCH_NODES = {'BUCK_SW', 'WIFI_BUCK_SW', 'DC_SW', 'DCDC_SW', 'BL_SW'}      # stay as they are: no extra copper on a switch node
MIN_TRACK = 0.127                                            # what the autorouter's 0.112 mm neck-downs become
VIA_SMALL, VIA_LARGER = 0.45, 0.5                            # pad of a 0.2 mm via: ring 0.125 -> 0.15 mm
MARGIN = 0.012                                               # kept on top of every clearance

FAST = ('RMII_', 'PHY_CLK50', 'PHY_RXD', 'PHY_CRS', 'SDIO_', 'USB_D', 'MDI_', 'FLASH_CK', 'LCD_PCLK')
RETURN_VIA_NEAR = 1.3            # a ground via this close to a signal via is good enough
RETURN_VIA_FIELD = 2.2           # ... and this close where signal vias stand side by side
STITCH, STITCH_RF = 5.0, 2.5     # pitch of the stitching vias
# Where the fills lie next to the Wi-Fi antenna: the strip along the top edge and the area around the module
# the Wi-Fi module and its antenna, and the SDIO bus from the module to the MCU (routes_sdio.py: ground copper
# round the clock line, ESP32-C5 HDG 1.4.9)
RF_AREAS = ((0.0, 0.0, G.BOARD_W, 9.0), (0.0, 9.0, 46.0, 22.0), (22.0, 22.0, 31.0, 49.0))
VIA_D, VIA_DRILL = 0.5, 0.2      # new ground vias: ring 0.15 mm


# ---------------------------------------------------------------------------------------------- geometry
def point_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    u = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy)


def seg_seg(a, b, c, d):
    def cross(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    d1, d2, d3, d4 = cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and d1 * d2 != 0 and d3 * d4 != 0:
        return 0.0
    return min(point_seg(a, c, d), point_seg(b, c, d), point_seg(c, a, b), point_seg(d, a, b))


# worked by hand: crossing, parallel, end to line, point beyond an end
assert seg_seg((0, 0), (2, 2), (0, 2), (2, 0)) == 0.0
assert abs(seg_seg((0, 0), (2, 0), (0, 1), (2, 1)) - 1.0) < 1e-9
assert abs(seg_seg((0, 0), (1, 0), (3, 0), (3, 5)) - 2.0) < 1e-9
assert abs(point_seg((3, 4), (0, 0), (0, 0)) - 5.0) < 1e-9


def pad_dist(a, b, poly):
    """mm from the segment a-b to a pad's copper outline, measured by KiCad (0 inside it)."""
    seg = pcbnew.SEG(BD.V(*a), BD.V(*b))
    if poly.Contains(seg.A) or poly.Contains(seg.B):
        return 0.0
    return mm(int(math.sqrt(poly.SquaredDistanceToSeg(seg))))


class Copper:
    """Everything a new piece of copper has to keep away from, in board millimetres."""

    CELL = 2.0

    def __init__(self, board):
        self.board = board
        self.items = []        # dict(kind, net, layer or None, a, b, r, poly, obj)
        self.grid = {}
        for fp in board.GetFootprints():
            for pad in fp.Pads():
                through = pad.GetAttribute() != pcbnew.PAD_ATTRIB_SMD
                if not through and not pad.IsOnLayer(F):
                    continue
                bb = pad.GetBoundingBox()
                a, b = BD.unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())), BD.unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
                self.add(dict(kind='pad', net=pad.GetNetname(), layer=None if through else F, a=a, b=b, r=0.0,
                              poly=pad.GetEffectivePolygon(F, pcbnew.ERROR_INSIDE), obj=pad, ref=fp.GetReference(),
                              num=pad.GetNumber(), npth=pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH))
        for t in board.GetTracks():
            if t.GetClass() == 'PCB_VIA':
                p = BD.unV(t.GetPosition())
                self.add(dict(kind='via', net=t.GetNetname(), layer=None, a=p, b=p, r=mm(t.GetWidth(F)) / 2, obj=t))
            else:
                self.add(dict(kind='track', net=t.GetNetname(), layer=t.GetLayer(), a=BD.unV(t.GetStart()),
                              b=BD.unV(t.GetEnd()), r=mm(t.GetWidth()) / 2, obj=t))
        # board edge and cut-outs, as segments on every layer
        outline = pcbnew.SHAPE_POLY_SET()
        board.GetBoardPolygonOutlines(outline, True)
        self.outline = outline
        chains = []
        for o in range(outline.OutlineCount()):
            chains.append(outline.Outline(o))
            chains += [outline.Hole(o, h) for h in range(outline.HoleCount(o))]
        for chain in chains:
            pts = [BD.unV(chain.CPoint(i)) for i in range(chain.PointCount())]
            for a, b in zip(pts, pts[1:] + pts[:1]):
                self.add(dict(kind='edge', net=None, layer=None, a=a, b=b, r=0.0))
        # areas: no tracks / no vias / no pours, and pours of nets that must stay whole
        self.no_track, self.no_via, self.no_pour, self.fills, self.kept = [], [], [], {}, []
        for z in board.Zones():
            if z.GetIsRuleArea():
                poly = z.Outline()
                layers = [l for l in BD.ALL_CU if z.IsOnLayer(l)]
                if z.GetDoNotAllowTracks():
                    self.no_track.append((poly, layers))
                if z.GetDoNotAllowVias():
                    self.no_via.append(poly)
                if z.GetDoNotAllowZoneFills():
                    self.no_pour.append((poly, layers))
            else:
                for l in BD.ALL_CU:
                    if z.IsOnLayer(l):
                        if short(z.GetNetname()) == 'GND':
                            self.fills.setdefault(l, []).append(z.GetFilledPolysList(l))
                        elif short(z.GetNetname()) != '+3V3':
                            self.kept.append(z.Outline())           # the core rail under the MCU

    def add(self, it):
        self.items.append(it)
        self._index(it)

    def _index(self, it):
        r = it['r'] + 0.9
        for i in range(int((min(it['a'][0], it['b'][0]) - r) // self.CELL), int((max(it['a'][0], it['b'][0]) + r) // self.CELL) + 1):
            for j in range(int((min(it['a'][1], it['b'][1]) - r) // self.CELL), int((max(it['a'][1], it['b'][1]) + r) // self.CELL) + 1):
                self.grid.setdefault((i, j), []).append(it)

    def near(self, a, b, reach):
        seen, out = set(), []
        for i in range(int((min(a[0], b[0]) - reach) // self.CELL), int((max(a[0], b[0]) + reach) // self.CELL) + 1):
            for j in range(int((min(a[1], b[1]) - reach) // self.CELL), int((max(a[1], b[1]) + reach) // self.CELL) + 1):
                for it in self.grid.get((i, j), ()):
                    if id(it) not in seen:
                        seen.add(id(it))
                        out.append(it)
        return out

    @staticmethod
    def clearance(net, it):
        """Clearance in mm between copper of ``net`` and an item."""
        if it['kind'] == 'edge':
            return 0.3
        if it['kind'] == 'pad' and (it.get('npth') or not it['net']):
            return max(class_of(net)[0], 0.2)                       # a bare hole
        c = max(class_of(net)[0], class_of(it['net'])[0])
        if 'POE_V' in it['net'] or 'POE_V' in net:
            c = max(c, 2.0)                                         # the isolation rule of the 48 V side
        return c

    def room(self, a, b, net, layer, skip=None):
        """Largest half width in mm that copper of ``net`` may have along the segment a-b on ``layer``
        (None: on every layer, as a via), by everything of other nets around it."""
        best = 9.0
        for it in self.near(a, b, 3.2):
            if it is skip or it.get('gone') or (it['net'] == net and it['kind'] != 'edge'):
                continue
            if not (layer is None or it['layer'] is None or it['layer'] == layer):
                continue
            c = self.clearance(net, it)
            # cheap bound first
            lo = max(min(a[0], b[0]) - max(it['a'][0], it['b'][0]), min(it['a'][0], it['b'][0]) - max(a[0], b[0]),
                     min(a[1], b[1]) - max(it['a'][1], it['b'][1]), min(it['a'][1], it['b'][1]) - max(a[1], b[1]))
            if lo - it['r'] - c > best:
                continue
            d = pad_dist(a, b, it['poly']) if it['kind'] == 'pad' else seg_seg(a, b, it['a'], it['b'])
            best = min(best, d - it['r'] - c)
        return best

    def inside(self, polys, p, layer=None):
        v = BD.V(*p)
        for poly in polys:
            if isinstance(poly, tuple):
                poly, layers = poly
                if layer is not None and layer not in layers:
                    continue
            if poly.Contains(v):
                return True
        return False

    def on_ground_fill(self, p, layer):
        v = BD.V(*p)
        return any(poly.Contains(v) for poly in self.fills.get(layer, ()))


# ---------------------------------------------------------------------------------------------- passes
def target_width(net):
    n = short(net)
    if n in SWITCH_NODES:
        return None
    if n in WIDEN_NET:
        return WIDEN_NET[n]
    from board_setup import NETCLASSES
    for cname, _clr, _w, _vd, _vdr, nets in NETCLASSES:
        if n in nets:
            return WIDEN_CLASS.get(cname)
    return None


def widen_tracks(C, log):
    """Pass 1. Returns {uuid: original width}."""
    changed = {}
    pads = [it for it in C.items if it['kind'] == 'pad']
    tracks = [it for it in C.items if it['kind'] == 'track']
    # widest first: the supply nets with the highest targets take their room before the neck-downs
    tracks.sort(key=lambda it: (-(target_width(it['net']) or 0), it['net'], it['a'], it['b']))
    for it in tracks:
        net, w0 = it['net'], 2 * it['r']
        want = target_width(net)
        if want is None:
            want = MIN_TRACK if w0 < MIN_TRACK - 1e-6 else None
        if want is None or want <= w0 + 1e-6:
            continue
        if C.inside(C.no_track, it['a'], it['layer']) or C.inside(C.no_track, it['b'], it['layer']):
            continue
        # a track that ends on a pad of its own net is no wider than that pad
        for p in C.near(it['a'], it['b'], 0.1):
            if p['kind'] == 'pad' and p['net'] == net and (p['layer'] is None or p['layer'] == it['layer']):
                v = [BD.V(*it['a']), BD.V(*it['b'])]
                if p['poly'].Contains(v[0]) or p['poly'].Contains(v[1]):
                    want = min(want, max(w0, min(abs(p['b'][0] - p['a'][0]), abs(p['b'][1] - p['a'][1]))))
        half = C.room(it['a'], it['b'], net, it['layer'], skip=it) - MARGIN
        w = math.floor(min(want, 2 * half) * 1000 + 1e-6) / 1000
        if w > w0 + 0.005:
            changed[it['obj'].m_Uuid.AsString()] = w0
            it['obj'].SetWidth(pcbnew.FromMM(w))
            it['r'] = w / 2
            log.setdefault(short(net), []).append((round(w0, 3), w, round(math.hypot(it['b'][0] - it['a'][0], it['b'][1] - it['a'][1]), 2)))
    return changed


def enlarge_vias(C):
    """Pass 2. Returns {uuid: original diameter}."""
    changed = {}
    for it in sorted((it for it in C.items if it['kind'] == 'via'), key=lambda it: (it['net'], it['a'])):
        if abs(2 * it['r'] - VIA_SMALL) > 1e-6 or mm(it['obj'].GetDrillValue()) > 0.21:
            continue
        # not into a pad it keeps clear of now, of any net: the ground vias between the Wi-Fi module's ground
        # pads just fill the gaps between them (routes_board.module_ground), and a larger ring would reach
        # under the solder paste
        pads = [pad_dist(it['a'], it['a'], o['poly']) for o in C.near(it['a'], it['a'], 1.0) if o['kind'] == 'pad']
        if any(VIA_SMALL / 2 - 1e-6 <= d < VIA_LARGER / 2 for d in pads):
            continue
        if C.room(it['a'], it['a'], it['net'], None, skip=it) - MARGIN >= VIA_LARGER / 2:
            changed[it['obj'].m_Uuid.AsString()] = VIA_SMALL
            it['obj'].SetWidth(F, pcbnew.FromMM(VIA_LARGER))
            it['r'] = VIA_LARGER / 2
    return changed


class Vias:
    """Places ground vias. A spot is good when the via clears all other copper on every layer, is not
    in or right beside a pad, not in a keep-out, not on silkscreen text and has ground fill around it."""

    def __init__(self, C):
        self.C = C
        self.board = C.board
        self.gnd = next(str(n) for n in C.board.GetNetsByName().keys() if short(str(n)) == 'GND')
        self.net = C.board.FindNet(self.gnd)
        self.new = []
        self.ground = [it['a'] for it in C.items if it['kind'] == 'via' and it['net'] == self.gnd]
        self.ground += [((it['a'][0] + it['b'][0]) / 2, (it['a'][1] + it['b'][1]) / 2) for it in C.items
                        if it['kind'] == 'pad' and it['net'] == self.gnd and it['layer'] is None]
        # places a via would spoil: silkscreen texts and logos, the bare ground pads for the display, fiducials
        self.avoid = []
        for d in C.board.GetDrawings():
            if d.GetLayer() in (pcbnew.F_SilkS, pcbnew.B_SilkS) and d.GetClass() in ('PCB_TEXT', 'PCB_SHAPE'):
                if d.GetClass() == 'PCB_SHAPE' and not (d.IsFilled() if hasattr(d, 'IsFilled') else False):
                    continue                                   # lines may cross a tented via
                bb = d.GetBoundingBox()
                self.avoid.append(BD.unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop())) + BD.unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom())))
        h = G.LCD_GROUND_PAD / 2 + 0.35
        self.avoid += [(x - h, y - h, x + h, y + h) for x, y in G.LCD_GROUND_PADS]
        for fp in C.board.GetFootprints():
            if fp.GetReference().startswith('FID'):
                x, y = BD.unV(fp.GetPosition())
                self.avoid.append((x - 1.6, y - 1.6, x + 1.6, y + 1.6))
        ax, ay = G.ANT_C
        self.avoid.append((ax - G.ANT_W / 2 - 1.5, ay - G.ANT_H / 2 - 1.5, ax + G.ANT_W / 2 + 1.5, ay + G.ANT_H / 2 + 1.5))
        self.avoid += [tuple(r) for r in G.POE_PRIMARY]
        xs, ys = [p[0] for p in G.POE_UNDER_MODULE], [p[1] for p in G.POE_UNDER_MODULE]
        self.avoid.append((min(xs), min(ys), max(xs), max(ys)))

    def good(self, p, d=VIA_D):
        C = self.C
        r = d / 2
        x, y = p
        if not (0.3 + r < x < G.BOARD_W - 0.3 - r and 0.3 + r < y < G.BOARD_H - 0.3 - r):
            return False
        if any(x1 - r < x < x2 + r and y1 - r < y < y2 + r for x1, y1, x2, y2 in self.avoid):
            return False
        v = BD.V(x, y)
        if not C.outline.Contains(v) or C.inside(C.no_pour, p) or C.inside(C.kept, p):
            return False
        here = pcbnew.SEG(v, v)
        if any(poly.Collide(here, pcbnew.FromMM(r + 0.05)) for poly in C.no_via):
            return False                                       # not even with its rim in a keep-out
        # ground fill on both outer layers, or the via ties nothing together
        if not (C.on_ground_fill(p, F) and C.on_ground_fill(p, B_)):
            return False
        for it in C.near(p, p, 1.2):
            if it.get('gone'):
                continue
            if it['kind'] == 'pad':
                # never in a pad; beside one, far enough for a solder mask web
                if pad_dist(p, p, it['poly']) < r + (0.25 if it['layer'] is not None or it['net'] != self.gnd else 0.0) and \
                        not (it['net'] == self.gnd and it['layer'] is None):
                    return False
            elif it['kind'] == 'via' and math.hypot(it['a'][0] - x, it['a'][1] - y) < r + it['r'] + 0.25:
                return False                                   # holes apart, also from ground vias
        return C.room(p, p, self.gnd, None) - MARGIN >= r

    def place(self, p):
        v = pcbnew.PCB_VIA(self.board)
        v.SetPosition(BD.V(round(p[0], 3), round(p[1], 3))); v.SetWidth(F, pcbnew.FromMM(VIA_D)); v.SetDrill(pcbnew.FromMM(VIA_DRILL))
        v.SetNet(self.net); v.SetLayerPair(F, B_); v.SetLocked(False)
        self.board.Add(v)
        self.C.add(dict(kind='via', net=self.gnd, layer=None, a=p, b=p, r=VIA_D / 2, obj=v))
        self.ground.append(p)
        self.new.append(v)

    def nearest_ground(self, p):
        return min((math.hypot(g[0] - p[0], g[1] - p[1]) for g in self.ground), default=99.0)

    def around(self, p, radii, step=15):
        """First good spot on rings around p."""
        for rad in radii:
            for k in range(0, 360, step):
                q = (round(p[0] + rad * math.cos(math.radians(k)), 2), round(p[1] + rad * math.sin(math.radians(k)), 2))
                if self.good(q):
                    return q
        return None

    def return_vias(self):
        """Pass 3. First a ground via within RETURN_VIA_NEAR of every signal via that has room for one.
        Then, for the vias of a dense field (the Ethernet signals above the MCU), one as near as it gets."""
        done, missing = 0, []
        signal = sorted((it for it in self.C.items if it['kind'] == 'via' and any(k in short(it['net']) for k in FAST)),
                        key=lambda it: (it['net'], it['a']))
        for radii, good_enough in (((0.75, 0.85, 0.95, 1.05, 1.15, 1.25), RETURN_VIA_NEAR),
                                   ((1.4, 1.6, 1.8, 2.0, 2.3, 2.6, 3.0), RETURN_VIA_FIELD)):
            for it in signal:
                if self.nearest_ground(it['a']) <= good_enough:
                    continue
                q = self.around(it['a'], radii)
                if q:
                    self.place(q)
                    done += 1
        for it in signal:
            d = self.nearest_ground(it['a'])
            if d > RETURN_VIA_FIELD:
                missing.append('%s (%.1f, %.1f): %.1f mm' % (short(it['net']), it['a'][0], it['a'][1], d))
        return done, missing

    def stitch(self):
        """Pass 4: a via near every node of a grid that has no ground via close by."""
        done = 0
        in_rf = lambda p: any(a[0] <= p[0] <= a[2] and a[1] <= p[1] < a[3] for a in RF_AREAS)
        areas = [(a, STITCH_RF, False) for a in RF_AREAS] + [((0.0, 0.0, G.BOARD_W, G.BOARD_H), STITCH, True)]
        for (x1, y1, x2, y2), pitch, skip_rf in areas:
            ny, nx = int((y2 - y1) / pitch), int((x2 - x1) / pitch)
            for j in range(ny + 1):
                for i in range(nx + 1):
                    p = (x1 + (i + 0.5 * (j % 2)) * pitch, y1 + j * pitch)        # staggered rows
                    if skip_rf and in_rf(p):
                        continue
                    if self.nearest_ground(p) < 0.62 * pitch:
                        continue
                    q = self.good(p) and p or self.around(p, [pitch * f for f in (0.1, 0.2, 0.3, 0.4)], step=30)
                    if q and self.nearest_ground(q) >= 0.5 * pitch:
                        self.place(q)
                        done += 1
        return done


def vias_in_pads(C):
    """Vias that sit in a pad of a two-pad part (solder runs into the hole): [(ref, pad, net, x, y)]."""
    out = []
    for it in C.items:
        if it['kind'] != 'pad' or it['layer'] is None or it['obj'].GetParentFootprint().GetPadCount() != 2:
            continue
        for v in C.near(it['a'], it['b'], 0.1):
            if v['kind'] == 'via' and not v.get('gone') and it['poly'].Contains(BD.V(*v['a'])):
                out.append((it['ref'], it['num'], short(it['net']), round(v['a'][0], 2), round(v['a'][1], 2)))
    return out


# ---------------------------------------------------------------------------------------------- driver
def run(path):
    board = pcbnew.LoadBoard(path)
    C = Copper(board)
    log = {}
    widths = widen_tracks(C, log)
    for net in sorted(log):
        steps = log[net]
        print('  %-14s %3d segments widened, %5.1f mm: %s' % (
            net, len(steps), sum(s[2] for s in steps),
            ' '.join('%.3g->%.3g' % k for k in sorted({(s[0], s[1]) for s in steps})[:6])))
    print('widened %d track segments' % len(widths))
    sizes = enlarge_vias(C)
    print('enlarged %d vias to %.2f mm' % (len(sizes), VIA_LARGER))
    V = Vias(C)
    n, missing = V.return_vias()
    print('return vias: %d placed%s' % (n, ('; nearest ground via further than %.1f mm at ' % RETURN_VIA_FIELD + ', '.join(missing)) if missing else ''))
    first = len(V.new)
    print('stitching vias: %d placed' % V.stitch())
    state = dict(widths=widths, sizes=sizes, vias=[v.m_Uuid.AsString() for v in V.new], solid=[],
                 return_vias=[v.m_Uuid.AsString() for v in V.new[:first]])
    inpad = vias_in_pads(C)
    print('vias in a pad of a two-pad part: %s' % (', '.join('%s.%s %s (%.2f, %.2f)' % v for v in inpad) or 'none'))
    os.makedirs(REPORTS, exist_ok=True)
    json.dump(state, open(STATE, 'w'))
    pcbnew.SaveBoard(path, board)


def drc(path, out):
    cli = os.environ.get('KICAD_CLI', 'kicad-cli')
    subprocess.run([cli, 'pcb', 'drc', '--severity-all', '--schematic-parity', '--refill-zones', '--save-board',
                    '--format', 'json', '-o', out, path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return json.load(open(out))


def fix(path):
    """Take back what the design rule check objects to, until it is clean (at most 8 rounds)."""
    state = json.load(open(STATE))
    report = os.path.join(REPORTS, 'post_route_drc.json')
    stubs, opens_before, keep = [], None, set()      # stubs removed in the last round, to put back if needed
    for rnd in range(8):
        rep = drc(path, report)
        opens = len(rep.get('unconnected_items', []))
        if stubs and opens > opens_before:
            # a removed stub was a link after all: back it goes, and it stays
            board = pcbnew.LoadBoard(path)
            for layer, a, b, w, code in stubs:
                t = pcbnew.PCB_TRACK(board)
                t.SetLayer(layer); t.SetStart(pcbnew.VECTOR2I(*a)); t.SetEnd(pcbnew.VECTOR2I(*b)); t.SetWidth(w)
                t.SetNetCode(code)
                board.Add(t)
                keep.add((a, b))
            pcbnew.SaveBoard(path, board)
            # no proxy of this board's items may outlive it: SWIG could hand one back for the next board
            del t, board
            stubs = []
            rep = drc(path, report)
        stubs, opens_before = [], len(rep.get('unconnected_items', []))
        problems = rep.get('violations', []) + rep.get('unconnected_items', [])
        if not problems:
            print('design rule check clean after %d corrections round(s)' % rnd)
            json.dump(state, open(STATE, 'w'))
            return 0
        board = pcbnew.LoadBoard(path)
        by_id = {t.m_Uuid.AsString(): t for t in board.GetTracks()}
        pads = {p.m_Uuid.AsString(): p for fp in board.GetFootprints() for p in fp.Pads()}
        undone, left = 0, []
        for v in problems:
            ids = [i.get('uuid') for i in v.get('items', [])]
            hit = False
            for u in ids:
                if u in state['vias'] and u in by_id:
                    board.Delete(by_id.pop(u)); state['vias'].remove(u); hit = True
                elif u in state['sizes'] and u in by_id:
                    by_id[u].SetWidth(F, pcbnew.FromMM(state['sizes'].pop(u))); hit = True
                elif u in state['widths'] and u in by_id:
                    t = by_id[u]
                    w0, w = state['widths'][u], mm(t.GetWidth())
                    w = w0 if w - w0 < 0.06 else round(max(w0, w - max(0.05, (w - w0) / 2)), 2)     # step back, then all the way
                    t.SetWidth(pcbnew.FromMM(w))
                    if w <= w0 + 1e-6:
                        del state['widths'][u]
                    hit = True
                elif v.get('type') == 'starved_thermal' and u in pads:
                    pads[u].SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL); state['solid'].append(u); hit = True
                elif (v.get('type') == 'track_dangling' and u in by_id and by_id[u].GetClass() == 'PCB_TRACK' and
                      mm(by_id[u].GetLength()) < 0.5):
                    # a router stub of a few steps (0.15 mm straight, 0.21 mm diagonal) with a loose end, one
                    # segment per round: the next round shows whether anything depended on it, and puts it back
                    s = by_id.pop(u)
                    # (plain integers: after a board is reloaded SWIG may return the start as an unwrapped
                    # pointer, without .x)
                    a, b = (s.GetStartX(), s.GetStartY()), (s.GetEndX(), s.GetEndY())
                    if (a, b) not in keep:
                        stubs.append((s.GetLayer(), a, b, s.GetWidth(), s.GetNetCode()))
                        # Delete, not Remove: a removed item belongs to Python, which cannot free it, and
                        # after that SWIG hands back unwrapped objects (KiCad 10)
                        board.Delete(s); hit = True
            undone += hit
            if not hit:
                left.append('%s: %s' % (v.get('type'), v.get('description', '')[:90]))
        pcbnew.SaveBoard(path, board)
        kinds = {}
        for v in problems:
            kinds[v.get('type', 'unconnected')] = kinds.get(v.get('type', 'unconnected'), 0) + 1
        print('round %d: %d violations (%s), %d corrected' % (
            rnd + 1, len(problems), ', '.join('%d %s' % (n, k) for k, n in sorted(kinds.items())), undone))
        if left and not undone:
            for line in left[:20]:
                print('  not from this script:', line)
            json.dump(state, open(STATE, 'w'))
            return 1
        # the proxies of removed or changed items (s, t) must not outlive this board either
        s = t = None
        del by_id, pads, board, s, t
    json.dump(state, open(STATE, 'w'))
    print('still not clean after 8 rounds')
    return 1


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    target = args[0] if args else BD.PCB
    if '--fix' in sys.argv:
        code = fix(target)
        sys.stdout.flush()
        os._exit(code)
    run(target)
    sys.stdout.flush()
    os._exit(0)
