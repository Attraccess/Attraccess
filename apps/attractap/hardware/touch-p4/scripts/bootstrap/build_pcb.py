"""Build the Attractap Touch P4 board file with KiCad's pcbnew Python API.

Usage (see README for the environment):
    python3 build_pcb.py place     # outline, parts, nets, zones, fixed routes -> kicad/attractap-touch-p4.kicad_pcb
    python3 build_pcb.py dsn       # export Specctra DSN for the autorouter
    python3 build_pcb.py ses       # import the autorouter result (dsn / autorouter / ses can be repeated)
    python3 build_pcb.py finish    # after the last round: fill the zones
"""

import os
import sys

import pcbnew

import design
import geometry as G
import libs
import placement
from board import B_, Board, F, IN1, IN2, NAME, PCB, PROJECT, mm, rect, schematic_net_names
from board_setup import documentation, outline, setup, write_project, zones
from routes_board import (
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


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'place'
    if cmd == 'place':
        build()
    elif cmd == 'dsn':
        b = pcbnew.LoadBoard(PCB)
        # only for the autorouter (not saved): keep it out of the isolated 48 V area
        helper = Board(b, None, {})
        boxes = list(G.POE_ROUTER_KEEPOUT)
        w, h = G.LED_WINDOW                       # the router does not keep its tracks off board cut-outs
        boxes += [(x - w / 2 - 0.14, y - h / 2 - 0.3, x + w / 2 + 0.14, y + h / 2 + 0.3)
                  for y in (G.LED_Y_TOP, G.LED_Y_BOT) for x in G.LED_X]
        x1, y1, x2, y2 = G.SLOT
        boxes.append((x1 - 0.3, y1 - 0.3, x2 + 0.3, y2 + 0.3))
        for x1, y1, x2, y2 in boxes:
            helper.keepout(rect(x1, y1, x2, y2), (F, IN1, IN2, B_), 'router only', tracks=True, vias=True,
                           pours=False)
        print('dsn', pcbnew.ExportSpecctraDSN(b, os.path.join(PROJECT, NAME + '.dsn')))
    elif cmd == 'ses':
        b = pcbnew.LoadBoard(PCB)
        # tracks placed by this script are locked and stay; everything else is replaced by the result
        print('ses', pcbnew.ImportSpecctraSES(b, os.path.join(PROJECT, NAME + '.ses')))
        thin = [t for t in b.GetTracks() if t.GetClass() == 'PCB_TRACK' and t.GetWidth() < mm(0.11)]
        for t in thin:                            # the autorouter's neck-downs go below the board minimum
            t.SetWidth(mm(0.11))
        print('widened %d tracks to 0.11 mm' % len(thin))
        pcbnew.SaveBoard(PCB, b)
    elif cmd == 'finish':
        b = pcbnew.LoadBoard(sys.argv[2] if len(sys.argv) > 2 else PCB)
        ep_vias(b)
        pcbnew.ZONE_FILLER(b).Fill(b.Zones())
        pcbnew.SaveBoard(sys.argv[2] if len(sys.argv) > 2 else PCB, b)
