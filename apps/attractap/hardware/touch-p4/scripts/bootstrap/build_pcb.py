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
from board import B_, Board, F, IN1, IN2, NAME, PCB, PROJECT, mm, rect, schematic_net_names, unV
from board_setup import (
    check_display_ground_pads,
    display_ground_pads,
    documentation,
    outline,
    setup,
    write_project,
    zones,
)
from route_grid import class_of, short
from routes_board import (
    buzzer_routes,
    dc_route,
    ep_vias,
    led_link,
    led_power,
    mdi_routes,
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
    mcu_power_vias,
    mcu_top,
    nfc_host,
    psram_ring,
    uart_escape,
)
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
    documentation(B)
    bad = check_silk(silkscreen(B))
    if bad:
        raise SystemExit('silkscreen: ' + '; '.join('"%s" %s' % item for item in bad))
    display_ground_pads(board)
    zones(B)
    mcu_power_vias(B)
    module_ground(B)
    psram_ring(board)
    ep_vias(board)
    poe_routes(B)
    mdi_routes(B)
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
    plane_fanout(B)                 # last: its vias go where the fixed routes leave room
    pcbnew.SaveBoard(PCB, board)
    write_project(names)
    print('wrote', PCB, len(B.fp), 'footprints', len(B.nets), 'nets')


# The committed autorouter result (the .ses file) is older than some changes to the circuit and the
# placement. Its tracks for the nets below are not taken over: they have fixed routes now, or
# finish_route.py routes them. Of its other tracks, those that come too close to a pad of one of the
# parts below are removed and routed again. Empty both when a new autorouter result is committed.
STALE_NETS = {'BUZ_P', 'BUZ_N', 'ETH_CT_RX', 'ETH_CT_TX', '+5V_POE'}
STALE_PARTS = {'R104', 'R105', 'R705', 'L103', 'C117', 'D106', 'D103', 'FB102', 'FB103', 'C408', 'C409',
               'U702', 'U703', 'C711', 'C712', 'C713', 'R706', 'TP814',
               'U704', 'C714', 'C715', 'R707', 'TP815',
               'D701', 'D702', 'D703', 'D704', 'D705', 'D706', 'D707', 'D708'}


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
    for t in board.GetTracks():
        if t.IsLocked():
            continue
        net = t.GetNetname()
        if short(net) in STALE_NETS:
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
    for t in gone:
        board.Remove(t)
    _KEEP.extend(gone)
    return len(gone)


def drop_edge_violations(board, clearance=0.3):
    """Remove the autorouter's tracks and vias that come closer than the edge clearance to the board edge
    or a cut-out (it keeps a slightly smaller distance of its own). finish_route.py routes them again."""
    w, h = G.LED_CUTOUT
    holes = [(G.NOTCH_X, G.NOTCH_Y, G.BOARD_W + 9, G.BOARD_H + 9), (-9, G.POCKET_Y, G.POCKET_X, G.BOARD_H + 9), G.SLOT,
             (G.C6_NOTCH[0], -9, G.C6_NOTCH[1], G.C6_NOTCH[2])]
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
            helper.keepout(rect(x1, y1, x2, y2), (F, IN1, IN2, B_), 'router only', tracks=True, vias=True,
                           pours=False)
        print('dsn', pcbnew.ExportSpecctraDSN(b, os.path.join(PROJECT, NAME + '.dsn')))
    elif cmd == 'ses':
        b = pcbnew.LoadBoard(PCB)
        # tracks placed by this script are locked and stay; everything else is replaced by the result
        routes = routes_of_session(os.path.join(PROJECT, NAME + '.ses'))
        print('ses', pcbnew.ImportSpecctraSES(b, routes))
        os.remove(routes)
        thin = [t for t in b.GetTracks() if t.GetClass() == 'PCB_TRACK' and t.GetWidth() < mm(0.11)]
        for t in thin:                            # the autorouter's neck-downs go below the board minimum
            t.SetWidth(mm(0.11))
        print('widened %d tracks to 0.11 mm' % len(thin))
        print('removed %d tracks and vias that later changes made obsolete' % drop_stale(b))
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
