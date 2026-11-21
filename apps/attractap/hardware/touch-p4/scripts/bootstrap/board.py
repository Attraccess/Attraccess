"""Shared pieces of the board builder: file paths, coordinate helpers and the Board wrapper around pcbnew.

Coordinates in all builder modules are board millimetres (see geometry.py); V() converts to KiCad units."""

import math
import os
import subprocess
import tempfile

import pcbnew

import design
import geometry as G
import libs


HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', '..', 'kicad'))
NAME = 'attractap-touch-p4'
PCB = os.path.join(PROJECT, NAME + '.kicad_pcb')
mm = pcbnew.FromMM
OX, OY = G.ORIGIN
F, B_, IN1, IN2 = pcbnew.F_Cu, pcbnew.B_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu


def V(x, y):
    return pcbnew.VECTOR2I(mm(x + OX), mm(y + OY))


def unV(v):
    return pcbnew.ToMM(v.x) - OX, pcbnew.ToMM(v.y) - OY


def schematic_net_names(d):
    """Net names as KiCad derives them from the schematic (sheet path included), keyed by design net.

    The board must carry exactly these names, otherwise 'Update PCB from schematic' in KiCad would
    rename every net.
    """
    from sexpr import find, first, loads
    cli = os.environ.get('KICAD_CLI') or (
        os.path.join(os.environ['KICAD'], 'bin', 'kicad-cli') if os.environ.get('KICAD') else 'kicad-cli')
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'sch.net')
        subprocess.run([cli, 'sch', 'export', 'netlist', '--format', 'kicadsexpr', '-o', out,
                        os.path.join(PROJECT, NAME + '.kicad_sch')], check=True, stdout=subprocess.DEVNULL)
        tree = loads(open(out, encoding='utf-8').read())
    pin_net = {}
    for net in find(first(tree, 'nets'), 'net'):
        for node in find(net, 'node'):
            pin_net[(first(node, 'ref')[1], first(node, 'pin')[1])] = first(net, 'name')[1]
    names = {}
    for p in d.parts.values():
        for pin, n in p.nets.items():
            k = pin_net.get((p.ref, pin))
            if k is None:
                raise SystemExit('pin %s.%s is missing in the schematic netlist' % (p.ref, pin))
            if names.setdefault(n, k) != k:
                raise SystemExit('net %s is split in the schematic: %s / %s' % (n, names[n], k))
    return names, pin_net


class Board:
    def __init__(self, board, d, names, pin_net=None):
        self.b = board
        self.pin_net = pin_net or {}
        self.locked = True              # False: tracks are handed to the autorouter as a starting point
        self.d = d
        self.fp = {}
        self.nets = {}
        self.names = names

    # ---- nets
    def net(self, name):
        name = self.names.get(name, name)
        if name not in self.nets:
            n = pcbnew.NETINFO_ITEM(self.b, name)
            self.b.Add(n)
            self.nets[name] = n
        return self.nets[name]

    # ---- footprints
    def put(self, ref, x, y, rot=0):
        part = self.d.parts[ref]
        libdir, name = libs.fp_path(part.fp)
        fp = pcbnew.FootprintLoad(libdir, name)
        if fp is None:
            raise SystemExit('footprint not found: ' + part.fp)
        fp.SetFPID(pcbnew.LIB_ID(part.fp.split(':')[0], name))
        fp.SetReference(ref)
        fp.SetValue(part.value)
        fp.SetPosition(V(x, y))
        fp.SetOrientationDegrees(rot)
        for key, val in [('LCSC', part.lcsc), ('MPN', part.mpn), ('Variant', part.variant),
                         ('Description', part.desc)] + sorted(part.extra.items()):
            if val or key == 'Description':
                fp.SetField(key, val)
                fld = fp.GetField(key)
                if fld:
                    fld.SetVisible(False)
        not_fitted = part.dnp or ref.startswith(design.NOT_FITTED)
        fp.SetDNP(bool(part.dnp))
        fp.SetExcludedFromBOM(bool(not_fitted))
        fp.SetExcludedFromPosFiles(bool(not_fitted))
        # Reference designators are on the assembly drawing layer only. The board is too dense for them:
        # on the silkscreen they would overlap each other and the test point labels.
        fp.Reference().SetLayer(pcbnew.F_Fab)
        fp.Reference().SetVisible(not ref.startswith(('H', 'FID')))
        self.b.Add(fp)
        for pad in fp.Pads():
            n = part.nets.get(pad.GetNumber())
            if not n:                                 # unused pin: KiCad gives it a net of its own
                n = self.pin_net.get((ref, pad.GetNumber()), '')
                n = n if n.startswith('unconnected-') else None
            if n:
                pad.SetNet(self.net(n))
        self.fp[ref] = fp
        return fp

    def row(self, refs, x, y, rot, dx, dy):
        for i, ref in enumerate(refs.split()):
            self.put(ref, x + i * dx, y + i * dy, rot)

    def pad(self, ref, num):
        for pad in self.fp[ref].Pads():
            if pad.GetNumber() == str(num):
                return unV(pad.GetPosition())
        raise KeyError((ref, num))

    def pads_num(self, ref, num):
        """Positions of all pads of a footprint that carry this number."""
        return [unV(pad.GetPosition()) for pad in self.fp[ref].Pads() if pad.GetNumber() == str(num)]

    def pads(self, ref):
        return [(p.GetNumber(), unV(p.GetPosition()), p) for p in self.fp[ref].Pads()]

    # ---- drawing primitives
    def edge(self, pts, closed=True, layer=pcbnew.Edge_Cuts, width=0.1):
        n = len(pts)
        for i in range(n if closed else n - 1):
            a, c = pts[i], pts[(i + 1) % n]
            s = pcbnew.PCB_SHAPE(self.b)
            s.SetShape(pcbnew.SHAPE_T_SEGMENT)
            s.SetStart(V(*a))
            s.SetEnd(V(*c))
            s.SetLayer(layer)
            s.SetWidth(mm(width))
            self.b.Add(s)

    def rounded_rect(self, x1, y1, x2, y2, r, layer=pcbnew.Edge_Cuts, width=0.1):
        """Closed rounded rectangle made of lines and arcs."""
        def seg(a, c):
            s = pcbnew.PCB_SHAPE(self.b)
            s.SetShape(pcbnew.SHAPE_T_SEGMENT)
            s.SetStart(V(*a)); s.SetEnd(V(*c)); s.SetLayer(layer); s.SetWidth(mm(width)); self.b.Add(s)

        def arc(c, start, mid, end):
            s = pcbnew.PCB_SHAPE(self.b)
            s.SetShape(pcbnew.SHAPE_T_ARC)
            s.SetArcGeometry(V(*start), V(*mid), V(*end))
            s.SetLayer(layer); s.SetWidth(mm(width)); self.b.Add(s)
        k = r * (1 - math.sqrt(0.5))
        seg((x1 + r, y1), (x2 - r, y1)); seg((x2, y1 + r), (x2, y2 - r))
        seg((x2 - r, y2), (x1 + r, y2)); seg((x1, y2 - r), (x1, y1 + r))
        arc(None, (x2 - r, y1), (x2 - k, y1 + k), (x2, y1 + r))
        arc(None, (x2, y2 - r), (x2 - k, y2 - k), (x2 - r, y2))
        arc(None, (x1 + r, y2), (x1 + k, y2 - k), (x1, y2 - r))
        arc(None, (x1, y1 + r), (x1 + k, y1 + k), (x1 + r, y1))

    def text(self, s, x, y, size=1.0, layer=pcbnew.F_SilkS, rot=0, thick=0.15):
        t = pcbnew.PCB_TEXT(self.b)
        t.SetText(s)
        t.SetPosition(V(x, y))
        t.SetLayer(layer)
        t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
        t.SetTextThickness(mm(thick))
        t.SetTextAngleDegrees(rot)
        if layer in (pcbnew.B_SilkS, pcbnew.B_Fab, pcbnew.B_Cu):
            t.SetMirrored(True)
        self.b.Add(t)
        return t

    def track(self, pts, net, width, layer=F, lock=None):
        pts = [(round(x, 3), round(y, 3)) for x, y in pts]
        for a, c in zip(pts, pts[1:]):
            if a == c:
                continue
            t = pcbnew.PCB_TRACK(self.b)
            t.SetStart(V(*a)); t.SetEnd(V(*c)); t.SetWidth(mm(width)); t.SetLayer(layer)
            t.SetNet(self.net(net)); t.SetLocked(self.locked if lock is None else lock)
            self.b.Add(t)

    def via(self, x, y, net, size=0.45, drill=0.2, lock=None):
        x, y = round(x, 3), round(y, 3)
        v = pcbnew.PCB_VIA(self.b)
        v.SetPosition(V(x, y)); v.SetWidth(pcbnew.F_Cu, mm(size)) if hasattr(v, 'SetWidth') else None
        v.SetDrill(mm(drill)); v.SetNet(self.net(net)); v.SetLocked(self.locked if lock is None else lock)
        v.SetLayerPair(F, B_)
        self.b.Add(v)
        return v

    def zone(self, net, layer, pts, priority=0, clearance=0.2, min_width=0.2, thermal=True, name=''):
        z = pcbnew.ZONE(self.b)
        z.SetLayer(layer)
        if net:
            z.SetNet(self.net(net))
        o = z.Outline()
        o.NewOutline()
        for x, y in pts:
            o.Append(mm(x + OX), mm(y + OY))
        z.SetAssignedPriority(priority)
        z.SetLocalClearance(mm(clearance))
        z.SetMinThickness(mm(min_width))
        # None: solid for SMD pads and vias, thermal relief only for through-hole pins
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THT_THERMAL if thermal is None else
                           pcbnew.ZONE_CONNECTION_THERMAL if thermal else pcbnew.ZONE_CONNECTION_FULL)
        z.SetThermalReliefGap(mm(0.2))
        z.SetThermalReliefSpokeWidth(mm(0.3))
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
        if name:
            z.SetZoneName(name)
        self.b.Add(z)
        return z

    def keepout(self, pts, layers, name, tracks=False, vias=False, pours=True, pads=False):
        z = pcbnew.ZONE(self.b)
        ls = pcbnew.LSET()
        for l in layers:
            ls.AddLayer(l)
        z.SetLayerSet(ls)
        z.SetIsRuleArea(True)
        z.SetDoNotAllowZoneFills(pours)
        z.SetDoNotAllowTracks(tracks)
        z.SetDoNotAllowVias(vias)
        z.SetDoNotAllowPads(pads)
        z.SetDoNotAllowFootprints(False)
        o = z.Outline()
        o.NewOutline()
        for x, y in pts:
            o.Append(mm(x + OX), mm(y + OY))
        z.SetZoneName(name)
        self.b.Add(z)
        return z


def rect(x1, y1, x2, y2):
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def dog(a, b, first='s'):
    """Path from a to b: one horizontal or vertical segment and one 45 degree segment.

    first='s' starts with the straight segment, first='d' with the diagonal. The autorouter only copes
    with fixed routes that use these two directions and end exactly on a pad or via centre.
    """
    a = (round(a[0], 3), round(a[1], 3))
    b = (round(b[0], 3), round(b[1], 3))
    dx, dy = b[0] - a[0], b[1] - a[1]
    m = min(abs(dx), abs(dy))
    sx, sy = math.copysign(m, dx), math.copysign(m, dy)
    mid = (b[0] - sx, b[1] - sy) if first == 's' else (a[0] + sx, a[1] + sy)
    return [a, mid, b]
