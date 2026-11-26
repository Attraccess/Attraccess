"""Build the Attractap Touch P4 board file with KiCad's pcbnew Python API.

Usage (see README for the environment):
    python3 build_pcb.py place     # outline, parts, nets, zones, fixed routes -> kicad/attractap-touch-p4.kicad_pcb
    python3 build_pcb.py dsn       # export Specctra DSN for the autorouter
    python3 build_pcb.py ses       # import the autorouter result (dsn / autorouter / ses can be repeated)
    python3 build_pcb.py finish    # after the last round: fill the zones
"""

import math
import os
import sys
import tempfile

import pcbnew

import design
import geometry as G
import libs
import placement
from board import ALL_CU, B_, Board, F, NAME, PCB, PROJECT, V, mm, rect, schematic_net_names, unV
from board_setup import (
    check_display_ground_pads,
    display_ground_pads,
    documentation,
    outline,
    relieve_small_parts,
    setup,
    write_project,
    write_stackup,
    zones,
)
from route_grid import class_of, short
from routes_board import (
    buzzer_routes,
    dc_route,
    ep_vias,
    led_link,
    led_power,
    mdi_routes, shield_route, buck_routes, usb_power_routes,
    module_ground,
    nfc_feeds,
    phy_fanout,
    plane_fanout,
    poe_routes,
    small_links,
    tamper_routes,
    proximity_routes,
)
from routes_mcu import (
    flash_routes,
    lcd_fanout,
    mcu_escape,
    mcu_left,
    core_rail_feed,
    mcu_power_vias,
    mcu_top,
    nfc_host,
    psram_ring,
    uart_escape,
)
from routes_sdio import sdio_bus
from routes_wifi import wifi_buck_routes
from routes_signal import usb_connector, usb_pair
from silk import check as check_silk, silkscreen


def build():
    d = libs.resolve(design.build())
    for stale in (PCB, PCB[:-4] + '_prl', os.path.join(PROJECT, NAME + '.kicad_prl')):
        if os.path.exists(stale):
            os.remove(stale)
    names, pin_net = schematic_net_names(d)
    board = pcbnew.NewBoard(PCB)
    setup(board)
    B = Board(board, d, names, pin_net)
    outline(B)
    placement.place(B)
    missing = [r for r in d.parts if r not in B.fp]
    if missing:
        raise SystemExit('not placed: ' + ' '.join(missing))
    tall = placement.check_flex_area(board)
    if tall:
        raise SystemExit('under the folded display flex: ' + ', '.join('%s (%s)' % r for r in tall))
    documentation(B)
    S = silkscreen(B)
    bad = check_silk(S)
    if bad:
        raise SystemExit('silkscreen: ' + '; '.join('"%s" %s' % item for item in bad))
    placed, missing, leaders = S.refdes
    print('reference designators on the silkscreen: %d (%d with a leader line), on the assembly drawing only: %d'
          % (placed, leaders, len(missing)))
    from silk_refdes import required
    lost = [r for r in missing if required(r)]
    if lost:
        raise SystemExit('silkscreen: no room for the designators of ' + ' '.join(sorted(lost)))
    display_ground_pads(board)
    zones(B)
    relieve_small_parts(B)
    mcu_power_vias(B)
    core_rail_feed(B)
    module_ground(B)
    psram_ring(board)
    ep_vias(board)
    poe_routes(B)
    mdi_routes(B)
    shield_route(B)
    nfc_feeds(B)
    led_link(B)
    dc_route(B)
    small_links(B)
    tamper_routes(B)
    proximity_routes(B)
    buzzer_routes(B)
    phy_fanout(B)
    mcu_escape(B)
    led_power(B)
    flash_routes(B)
    nfc_host(B)
    uart_escape(B)
    lcd_fanout(B)
    mcu_top(B)
    mcu_left(B)
    print('SDIO bus: %s' % ', '.join('%s %.2f mm' % kv for kv in sorted(sdio_bus(B).items())))
    buck_routes(B)
    wifi_buck_routes(B)
    usb_power_routes(B)
    print('USB pair: %s' % ', '.join('%s %.2f mm' % kv for kv in sorted(usb_pair(B).items())))
    usb_connector(B)
    plane_fanout(B)                 # last: its vias go where the fixed routes leave room
    pcbnew.SaveBoard(PCB, board)
    write_stackup(PCB)
    write_project(names)
    print('wrote', PCB, len(B.fp), 'footprints', len(B.nets), 'nets')


# The committed autorouter result (the .ses file) is older than some changes to the circuit and the
# placement. Its tracks for the nets below are not taken over: they have fixed routes now, or
# finish_route.py routes them. Of its other tracks, those that come too close to a pad of one of the
# parts below are removed and routed again. Empty both when a new autorouter result is committed.
STALE_NETS = {'USB_DP', 'USB_DN', 'BUZ_P', 'BUZ_N', 'ETH_CT_RX', 'ETH_CT_TX', 'ETH_SHIELD', '+5V_POE', '+5V_USB', '+5V_DC', 'BUCK_SW', 'BUCK_EN',
              'DC_EN', 'BUCK_BST', 'BL_PWM', 'VDC_F', 'VDC_IN', 'VDC_R', 'VDDO_3', 'VDDO_4', 'UART0_RX',
              'XTAL_P', 'XTAL_N',
              # the ESP32-C5 module: its SDIO pins lie on another side than the C6's
              'SDIO_CMD', 'SDIO_CLK', 'SDIO_D0', 'SDIO_D1', 'SDIO_D2', 'SDIO_D3'}
STALE_PARTS = {'R104', 'R105', 'R705', 'L103', 'C117', 'D106', 'D103', 'FB102', 'FB103', 'C408', 'C409',
               'U702', 'U703', 'C711', 'C712', 'C713', 'R706', 'TP814',
               'U704', 'C714', 'C715', 'R707', 'TP815',
               'D701', 'D702', 'D703', 'D704', 'D705', 'D706', 'D707', 'D708',
               # review stage 3: the power path, the 3.3 V converter, supervisor, test points, fiducials
               'U105', 'R107', 'R108', 'R109', 'R110', 'C118', 'U106', 'Q101', 'C119', 'U107', 'Q102', 'C121',
               'R113', 'C120', 'U103', 'R111', 'R112', 'C108', 'L101', 'U204', 'C241', 'FID804', 'FID805',
               'D107', 'C109', 'C301', 'R116', 'R117', 'R118', 'R119',
               # review stage 3, second part: decoupling at the MCU's upper left corner, the DC input's TVS
               'C208', 'C209', 'F102', 'D101',
               # review stage 3, third part: the 2.0 x 1.6 mm crystal and its load capacitors
               'Y201', 'C238', 'C239',
               # review stage 4: ESD protection of the touch lines
               'U603', 'U604',
               # the ESP32-C5-MINI-1 in place of the C6-MINI-1U, its own converter, its parts and test points
               'U301', 'U302', 'L301', 'FID801',
               # the SDIO bus laid out by hand (routes_sdio.py): its pull-ups and the 5 V test point moved
               'TP801'}
STALE_PARTS |= {'TP%d' % n for n in range(816, 833)} | {'C%d' % n for n in range(301, 307)} | \
    {'R%d' % n for n in range(301, 313)}


def routes_of_session(path):
    """A copy of the session file without its placement section. The session also records where every
    part was when the autorouter ran, and KiCad moves the parts back there on import. Parts moved
    since then must stay where placement.py puts them."""
    text = open(path, encoding='utf-8').read()
    start, end = text.index('  (placement'), text.index('  (was_is')
    with tempfile.NamedTemporaryFile('w', suffix='.ses', delete=False, encoding='utf-8') as tmp:
        tmp.write(text[:start] + text[end:])
    return tmp.name


def drop_stale(board):
    """Remove the autorouter's tracks and vias for STALE_NETS and those in the way of STALE_PARTS: of
    their pads, and of the fixed vias beside their pads (a new part's supply vias from plane_fanout go
    through every layer, also where the autorouter laid a track on an inner layer)."""
    pads = []                                     # (net, x1, y1, x2, y2, on every layer, radius)
    for fp in board.GetFootprints():
        if fp.GetReference() not in STALE_PARTS:
            continue
        for pad in fp.Pads():
            bb = pad.GetBoundingBox()
            x1, y1 = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            pads.append((pad.GetNetname(), x1, y1, x2, y2, pad.GetAttribute() != pcbnew.PAD_ATTRIB_SMD, 0.0))
    for t in board.GetTracks():
        if not (t.IsLocked() and t.GetClass() == 'PCB_VIA'):
            continue
        x, y = unV(t.GetPosition())
        if any(pnet == t.GetNetname() and math.hypot(max(x1 - x, 0, x - x2), max(y1 - y, 0, y - y2)) < 1.5
               for pnet, x1, y1, x2, y2, _through, radius in pads if not radius):
            pads.append((t.GetNetname(), x, y, x, y, True, pcbnew.ToMM(t.GetWidth(F)) / 2))
    gone = []
    kx1, ky1, kx2, ky2 = G.POE_BARRIER_DIP          # keep-out added after the autorouter ran
    for t in board.GetTracks():
        if t.IsLocked():
            continue
        net = t.GetNetname()
        if short(net) in STALE_NETS:
            gone.append(t)
            continue
        ends = [unV(t.GetPosition())] if t.GetClass() == 'PCB_VIA' else [unV(t.GetStart()), unV(t.GetEnd())]
        if any(kx1 - 0.5 <= x <= kx2 + 0.5 and ky1 - 0.5 <= y <= ky2 + 0.5 for x, y in ends):
            gone.append(t)
            continue
        via = t.GetClass() == 'PCB_VIA'
        (xa, ya), (xb, yb) = (unV(t.GetPosition()),) * 2 if via else (unV(t.GetStart()), unV(t.GetEnd()))
        half = pcbnew.ToMM(t.GetWidth(F) if via else t.GetWidth()) / 2
        n = int(math.hypot(xb - xa, yb - ya) / 0.02) + 1
        for pnet, x1, y1, x2, y2, through, radius in pads:
            if pnet == net or not (via or through or t.GetLayer() == F):
                continue
            need = max(class_of(net)[0], class_of(pnet)[0]) + half + radius - 1e-3
            if (min(xa, xb) - need > x2 or max(xa, xb) + need < x1 or min(ya, yb) - need > y2 or
                    max(ya, yb) + need < y1):
                continue
            if any(math.hypot(max(x1 - x, 0, x - x2), max(y1 - y, 0, y - y2)) < need
                   for x, y in ((xa + (xb - xa) * k / n, ya + (yb - ya) * k / n) for k in range(n + 1))):
                gone.append(t)
                break
    ids = {t.m_Uuid.AsString() for t in gone}
    gone += [t for t in same_net_in_stale_pads(board) if t.m_Uuid.AsString() not in ids]
    for t in gone:
        board.Remove(t)
    _KEEP.extend(gone)
    return len(gone)


def same_net_in_stale_pads(board):
    """The autorouter's vias that stand in a pad of their own net on one of the STALE_PARTS, and the
    session's tracks of that net hanging on each, up to the next pad, fixed item or junction. They were
    laid out for the part that stood there before (the C6 module had its ground pads elsewhere); being the
    pad's own net, they pass drop_stale's clearance test."""
    pads = [pad for fp in board.GetFootprints() if fp.GetReference() in STALE_PARTS for pad in fp.Pads()
            if pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD]
    free = [t for t in board.GetTracks() if not t.IsLocked()]
    fixed = [t for t in board.GetTracks() if t.IsLocked()]
    ends = {}                                      # (x, y) -> free tracks with an end there
    for t in free:
        if t.GetClass() == 'PCB_TRACK':
            for p in ((t.GetStartX(), t.GetStartY()), (t.GetEndX(), t.GetEndY())):
                ends.setdefault(p, []).append(t)
    at_via = {(t.GetX(), t.GetY()): t for t in free if t.GetClass() == 'PCB_VIA'}

    def held(p, net):
        """A pad or a fixed item of the net at this point ends the chain."""
        v = pcbnew.VECTOR2I(*p)
        return (any(pad.GetNetCode() == net and pad.HitTest(v) for fp in board.GetFootprints() for pad in fp.Pads())
                or any(t.GetNetCode() == net and t.HitTest(v) for t in fixed))

    out = []
    for via in [t for t in free if t.GetClass() == 'PCB_VIA']:
        net = via.GetNetCode()
        if not any(pad.GetNetCode() == net and pad.HitTest(via.GetPosition()) for pad in pads):
            continue
        out.append(via)
        todo = [(via.GetX(), via.GetY())]
        while todo:
            p = todo.pop()
            for t in [t for t in ends.get(p, []) if t.GetNetCode() == net and t not in out]:
                out.append(t)
                q = (t.GetEndX(), t.GetEndY()) if (t.GetStartX(), t.GetStartY()) == p else (t.GetStartX(), t.GetStartY())
                onward = [u for u in ends.get(q, []) if u.GetNetCode() == net and u not in out]
                if held(q, net) or len(onward) > 1:
                    continue                       # a pad, a fixed item or a junction: the rest stays
                if q in at_via and at_via[q].GetNetCode() == net and at_via[q] not in out:
                    out.append(at_via[q])
                todo.append(q)
    return out


def drop_collisions(board):
    """Remove the autorouter's tracks and vias that no longer fit the board they are laid on: those that come
    too close to a pad, a fixed via or a fixed track of another net. That happens wherever the placement or
    a fixed route has changed since the autorouter ran; finish_route.py routes what is cut off again. On an
    unchanged board this removes nothing."""
    def seg_seg(a, b, c, d):
        def cross(p, q, r):
            return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

        def point_seg(p, s, e):
            dx, dy = e[0] - s[0], e[1] - s[1]
            L2 = dx * dx + dy * dy
            u = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / L2))
            return math.hypot(p[0] - s[0] - u * dx, p[1] - s[1] - u * dy)
        d1, d2, d3, d4 = cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)
        if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and d1 * d2 != 0 and d3 * d4 != 0:
            return 0.0
        return min(point_seg(a, c, d), point_seg(b, c, d), point_seg(c, a, b), point_seg(d, a, b))

    assert seg_seg((0, 0), (2, 2), (0, 2), (2, 0)) == 0.0                 # crossing
    assert abs(seg_seg((0, 0), (2, 0), (0, 1), (2, 1)) - 1.0) < 1e-9      # parallel, 1 apart
    assert abs(seg_seg((0, 0), (1, 0), (3, 0), (3, 5)) - 2.0) < 1e-9      # end to line

    def seg_pad(a, b, poly):
        """Distance in mm from the segment a-b to a pad's real copper outline (rounded corners, round
        pads and turned pads included), measured by KiCad."""
        seg = pcbnew.SEG(V(*a), V(*b))
        if poly.Contains(seg.A) or poly.Contains(seg.B):
            return 0.0
        return pcbnew.ToMM(int(math.sqrt(poly.SquaredDistanceToSeg(seg))))

    solid = []           # (net, layer or None for every layer, kind, geometry): what the autorouter's copper must clear
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            bb = pad.GetBoundingBox()
            x1, y1 = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            through = pad.GetAttribute() != pcbnew.PAD_ATTRIB_SMD
            if not through and not pad.IsOnLayer(F):
                continue                           # paste-only openings and the like
            poly = pad.GetEffectivePolygon(F, pcbnew.ERROR_INSIDE)
            solid.append((pad.GetNetname(), None if through else F, 'pad', ((x1, y1), (x2, y2), poly), 0.0))
    for t in board.GetTracks():
        if not t.IsLocked():
            continue
        if t.GetClass() == 'PCB_VIA':
            x, y = unV(t.GetPosition())
            solid.append((t.GetNetname(), None, 'seg', ((x, y), (x, y)), pcbnew.ToMM(t.GetWidth(F)) / 2))
        else:
            solid.append((t.GetNetname(), t.GetLayer(), 'seg', (unV(t.GetStart()), unV(t.GetEnd())),
                          pcbnew.ToMM(t.GetWidth()) / 2))
    cell = 2.0
    grid = {}
    for item in solid:
        _net, _layer, kind, geo, r = item
        xs, ys = (geo[0][0], geo[1][0]), (geo[0][1], geo[1][1])
        for i in range(int((min(xs) - r - 1) // cell), int((max(xs) + r + 1) // cell) + 1):
            for j in range(int((min(ys) - r - 1) // cell), int((max(ys) + r + 1) // cell) + 1):
                grid.setdefault((i, j), []).append(item)
    gone = []
    for t in board.GetTracks():
        if t.IsLocked():
            continue
        net = t.GetNetname()
        via = t.GetClass() == 'PCB_VIA'
        a, b = (unV(t.GetPosition()),) * 2 if via else (unV(t.GetStart()), unV(t.GetEnd()))
        half = pcbnew.ToMM(t.GetWidth(F) if via else t.GetWidth()) / 2
        layer = None if via else t.GetLayer()
        seen = set()
        hit = False
        for i in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
            for j in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1):
                for item in grid.get((i, j), ()):
                    if id(item) in seen:
                        continue
                    seen.add(id(item))
                    onet, olayer, kind, geo, r = item
                    if onet == net or not (layer is None or olayer is None or layer == olayer):
                        continue
                    # (a pad without a net is a bare hole: the hole clearance applies)
                    need = max(class_of(net)[0], class_of(onet)[0] if onet else 0.2) + half + r - 1e-3
                    if kind == 'pad':
                        (px1, py1), (px2, py2), poly = geo
                        if (min(a[0], b[0]) - need > px2 or max(a[0], b[0]) + need < px1 or
                                min(a[1], b[1]) - need > py2 or max(a[1], b[1]) + need < py1):
                            continue
                        d = seg_pad(a, b, poly)
                    else:
                        d = seg_seg(a, b, geo[0], geo[1])
                    if d < need:
                        hit = True
                        if os.environ.get('PCB_DEBUG'):
                            print('  collision: %s %s at %s  vs  %s %s %s  (%.3f < %.3f)' % (
                                short(net), 'via' if via else board.GetLayerName(t.GetLayer()),
                                tuple(round(v, 2) for v in a), short(onet), kind, [tuple(round(v, 2) for v in g) for g in geo[:2]], d, need))
                        break
                if hit:
                    break
            if hit:
                break
        if hit:
            gone.append(t)
    for t in gone:
        board.Remove(t)
    _KEEP.extend(gone)
    return len(gone)


def drop_in_keepouts(board):
    """Remove the autorouter's tracks and vias that touch a rule area for no tracks or no vias on their layer
    (keep-outs added after it ran, such as those around the fiducials)."""
    areas = [z for z in board.Zones() if z.GetIsRuleArea() and (z.GetDoNotAllowTracks() or z.GetDoNotAllowVias())]
    gone = []
    for t in board.GetTracks():
        if t.IsLocked():
            continue
        via = t.GetClass() == 'PCB_VIA'
        for z in areas:
            if via and not z.GetDoNotAllowVias() or not via and not z.GetDoNotAllowTracks():
                continue
            if not via and not z.IsOnLayer(t.GetLayer()):
                continue
            if via and not any(z.IsOnLayer(l) for l in (F, B_)):
                continue
            o = z.Outline()
            if via:
                pts = [t.GetPosition()]
                r = t.GetWidth(F) // 2
            else:
                a, b = t.GetStart(), t.GetEnd()
                n = max(1, int(pcbnew.ToMM(int(math.hypot(b.x - a.x, b.y - a.y))) / 0.05))
                pts = [pcbnew.VECTOR2I(a.x + (b.x - a.x) * k // n, a.y + (b.y - a.y) * k // n) for k in range(n + 1)]
                r = t.GetWidth() // 2
            if any(o.Contains(q) or o.SquaredDistance(q) <= r * r for q in pts):
                gone.append(t)
                break
    for t in gone:
        board.Remove(t)
    _KEEP.extend(gone)
    return len(gone)


def drop_vias_in_pads(board):
    """Remove the autorouter's vias that sit in a pad of a two-pad part. In the oven the solder runs into
    such a hole and the part gets too little of it. The pad keeps its other connection, or
    finish_route.py gives it a new one beside the pad."""
    gone = []
    pads = [pad for fp in board.GetFootprints() if fp.GetPadCount() == 2 for pad in fp.Pads()
            if pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD and pad.IsOnLayer(F)]
    for t in board.GetTracks():
        if t.GetClass() == 'PCB_VIA' and not t.IsLocked():
            if any(pad.GetNetCode() == t.GetNetCode() and pad.HitTest(t.GetPosition()) for pad in pads):
                gone.append(t)
    for t in gone:
        board.Remove(t)
    _KEEP.extend(gone)
    return len(gone)


def drop_edge_violations(board, clearance=0.3):
    """Remove the autorouter's tracks and vias that come closer than the edge clearance to the board edge
    or a cut-out (it keeps a slightly smaller distance of its own). finish_route.py routes them again."""
    w, h = G.LED_CUTOUT
    holes = [(G.NOTCH_X, G.NOTCH_Y, G.BOARD_W + 9, G.BOARD_H + 9), (-9, G.POCKET_Y, G.POCKET_X, G.BOARD_H + 9), G.SLOT,
             (G.WIFI_NOTCH[0], -9, G.WIFI_NOTCH[1], G.WIFI_NOTCH[2])]
    holes += [(x - w / 2, y - h / 2, x + w / 2, y + h / 2) for y in (G.LED_Y_TOP, G.LED_Y_BOT) for x in G.LED_X]
    # outside the board outline: four half planes as wide rectangles
    holes += [(-9, -9, 0, G.BOARD_H + 9), (G.BOARD_W, -9, G.BOARD_W + 9, G.BOARD_H + 9), (-9, -9, G.BOARD_W + 9, 0),
              (-9, G.BOARD_H, G.BOARD_W + 9, G.BOARD_H + 9)]

    def near(x, y, r):
        return any(math.hypot(max(x1 - x, 0, x - x2), max(y1 - y, 0, y - y2)) < r for x1, y1, x2, y2 in holes)

    gone = []
    for t in board.GetTracks():
        if t.IsLocked():
            continue
        if t.GetClass() == 'PCB_VIA':
            x, y = unV(t.GetPosition())
            bad = near(x, y, clearance + pcbnew.ToMM(t.GetWidth(F)) / 2 - 1e-4)
        else:
            (xa, ya), (xb, yb) = unV(t.GetStart()), unV(t.GetEnd())
            n = int(math.hypot(xb - xa, yb - ya) / 0.05) + 1
            r = clearance + pcbnew.ToMM(t.GetWidth()) / 2 - 1e-4
            bad = any(near(xa + (xb - xa) * k / n, ya + (yb - ya) * k / n, r) for k in range(n + 1))
        if bad:
            gone.append(t)
    for t in gone:
        board.Remove(t)
    _KEEP.extend(gone)                 # the bindings must not free removed items while the board lives
    return len(gone)


_KEEP = []


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'place'
    if cmd == 'place':
        build()
    elif cmd == 'dsn':
        b = pcbnew.LoadBoard(PCB)
        # only for the autorouter (not saved): keep it out of the isolated 48 V area
        helper = Board(b, None, {})
        boxes = list(G.POE_ROUTER_KEEPOUT)
        w, h = G.LED_CUTOUT                       # the router does not keep its tracks off board cut-outs
        boxes += [(x - w / 2 - 0.14, y - h / 2 - 0.3, x + w / 2 + 0.14, y + h / 2 + 0.3)
                  for y in (G.LED_Y_TOP, G.LED_Y_BOT) for x in G.LED_X]
        x1, y1, x2, y2 = G.SLOT
        boxes.append((x1 - 0.3, y1 - 0.3, x2 + 0.3, y2 + 0.3))
        boxes.append((G.NOTCH_X - 0.35, G.NOTCH_Y - 0.35, G.BOARD_W + 1, G.BOARD_H + 1))      # Ethernet cut-away
        boxes.append((-1, G.POCKET_Y - 0.35, G.POCKET_X + 0.35, G.BOARD_H + 1))               # DC plug cut-away
        for x1, y1, x2, y2 in boxes:
            helper.keepout(rect(x1, y1, x2, y2), ALL_CU, 'router only', tracks=True, vias=True,
                           pours=False)
        print('dsn', pcbnew.ExportSpecctraDSN(b, os.path.join(PROJECT, NAME + '.dsn')))
    elif cmd == 'ses':
        b = pcbnew.LoadBoard(PCB)
        # tracks placed by this script are locked and stay; everything else is replaced by the result
        routes = routes_of_session(os.path.join(PROJECT, NAME + '.ses'))
        before = {t.m_Uuid.AsString() for t in b.GetTracks()}
        print('ses', pcbnew.ImportSpecctraSES(b, routes))
        os.remove(routes)
        # The session marks the tracks that were fixed when the autorouter ran as protected, and KiCad imports
        # them locked. The fixed routes of now are the generator's own; everything from the session is free.
        freed = 0
        for t in b.GetTracks():
            if t.m_Uuid.AsString() not in before and t.IsLocked():
                t.SetLocked(False)
                freed += 1
        print('unlocked %d tracks and vias of the session' % freed)
        # The session names its vias after the four layers the autorouter saw ("Via[0-3]"). On a board with
        # more layers KiCad takes that for a buried via. All vias of this board go through.
        through = 0
        for t in b.GetTracks():
            if t.GetClass() == 'PCB_VIA' and t.GetViaType() != pcbnew.VIATYPE_THROUGH:
                t.SetViaType(pcbnew.VIATYPE_THROUGH)
                t.SetLayerPair(F, B_)
                through += 1
        print('made %d imported vias through vias' % through)
        thin = [t for t in b.GetTracks() if t.GetClass() == 'PCB_TRACK' and t.GetWidth() < mm(0.11)]
        for t in thin:                            # the autorouter's neck-downs go below the board minimum
            t.SetWidth(mm(0.11))
        print('widened %d tracks to 0.11 mm' % len(thin))
        # tracks of nets the circuit no longer has come in without a net
        orphans = [t for t in b.GetTracks() if not t.IsLocked() and t.GetNetCode() == 0]
        for t in orphans:
            b.Remove(t)
        _KEEP.extend(orphans)
        print('removed %d tracks and vias of nets that no longer exist' % len(orphans))
        print('removed %d tracks and vias that later changes made obsolete' % drop_stale(b))
        print('removed %d tracks and vias in the way of a moved pad or fixed route' % drop_collisions(b))
        print('removed %d tracks and vias in keep-out areas added since' % drop_in_keepouts(b))
        print('removed %d vias in pads of two-pad parts' % drop_vias_in_pads(b))
        print('removed %d tracks and vias too close to the board edge' % drop_edge_violations(b))
        pcbnew.SaveBoard(PCB, b)
    elif cmd == 'finish':
        b = pcbnew.LoadBoard(sys.argv[2] if len(sys.argv) > 2 else PCB)
        ep_vias(b)
        pcbnew.ZONE_FILLER(b).Fill(b.Zones())
        pcbnew.SaveBoard(sys.argv[2] if len(sys.argv) > 2 else PCB, b)
        bad = check_display_ground_pads(b)
        if bad:
            raise SystemExit('ground pads for the display are not on clean ground fill: %s' % bad)
