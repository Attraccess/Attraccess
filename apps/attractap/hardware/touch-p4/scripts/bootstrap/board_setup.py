"""Board outline, labels, zones and keep-outs, design rules, net classes and the project file."""

import json
import math
import os

import pcbnew

import geometry as G
from board import B_, F, IN1, IN2, NAME, PROJECT, V, mm, rect, unV


def outline(B):
    W, H = G.BOARD_W, G.BOARD_H
    nx, ny = G.NOTCH_X, G.NOTCH_Y
    r = 2.0
    k = r * (1 - math.sqrt(0.5))
    px, py = G.POCKET_X, G.POCKET_Y
    # outer contour: rectangle with both bottom corners cut away (Ethernet plug on the right, DC plug on
    # the left), rounded corners
    ax1, ax2, ad = G.C6_NOTCH                 # cut under the Wi-Fi antenna, inside corners rounded
    ar = 1.0
    ak = ar * (1 - math.sqrt(0.5))
    pts_lines = [
        ((r, 0), (ax1, 0)), ((ax1, 0), (ax1, ad - ar)), ((ax1 + ar, ad), (ax2 - ar, ad)), ((ax2, ad - ar), (ax2, 0)),
        ((ax2, 0), (W - r, 0)), ((W, r), (W, ny - r)), ((W - r, ny), (nx + r, ny)),
        ((nx, ny + r), (nx, H - r)), ((nx - r, H), (px + r, H)), ((px, H - r), (px, py + r)),
        ((px - r, py), (r, py)), ((0, py - r), (0, r)),
    ]
    for a, c in pts_lines:
        B.edge([a, c], closed=False)

    def arc(start, mid, end):
        s = pcbnew.PCB_SHAPE(B.b)
        s.SetShape(pcbnew.SHAPE_T_ARC)
        s.SetArcGeometry(V(*start), V(*mid), V(*end))
        s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); B.b.Add(s)
    arc((ax1, ad - ar), (ax1 + ak, ad - ak), (ax1 + ar, ad))
    arc((ax2 - ar, ad), (ax2 - ak, ad - ak), (ax2, ad - ar))
    arc((W - r, 0), (W - k, k), (W, r))
    arc((W, ny - r), (W - k, ny - k), (W - r, ny))
    arc((nx + r, ny), (nx + k, ny + k), (nx, ny + r))          # inside corner of the notch
    arc((nx, H - r), (nx - k, H - k), (nx - r, H))
    arc((px + r, H), (px + k, H - k), (px, H - r))
    arc((px, py + r), (px - k, py + k), (px - r, py))            # inside corner of the DC cut-away
    arc((r, py), (k, py - k), (0, py - r))
    arc((0, r), (k, k), (r, 0))
    # flex slot
    B.rounded_rect(*G.SLOT, r=1.0)
    # The LED windows (the reverse-mount LEDs shine through the board) come with the LED footprint:
    # 3.4 x 3.0 mm with relieved corners, so a body with square corners fits a milled opening.


def documentation(B):
    """Mechanical reference drawings on user layers and silkscreen notes."""
    Dw = pcbnew.Dwgs_User
    B.edge(rect(*G.LENS), layer=Dw, width=0.15)
    B.edge(rect(*G.LCM), layer=Dw, width=0.1)
    B.text('display cover lens 84.3 x 84.3 (on the other side)', 43, 9.0, 1.2, Dw)
    B.text('LCD module (metal back)', 43, 14.6, 1.0, Dw)
    for x1, y1, x2, y2 in G.FLEX_KEEPOUT:
        B.edge(rect(x1, y1, x2, y2), layer=pcbnew.Cmts_User, width=0.1)
    B.text('folded display flex lies here: no tall parts', 37, 82.5, 1.0, pcbnew.Cmts_User)
    B.text('Ethernet plug', 77.8, G.NOTCH_Y + 15, 1.0, Dw, rot=90)
    B.text('Attractap Touch P4', 44, 100.3, 1.0, pcbnew.F_SilkS)
    B.text('rev A', 62.0, 100.3, 0.8, pcbnew.F_SilkS)
    B.text('PoE 48V', 82.0, G.JACK_Y - 0.9, 0.8, pcbnew.F_SilkS)
    for num, mark in (('1', '+'), ('2', '-')):
        x, y = min(B.pads_num('J103', num), key=lambda p: p[1])
        B.text(mark, x, y - 3.6, 1.0, pcbnew.F_SilkS)
    for ref, label in (('SW201', 'RST'), ('SW202', 'BOOT')):
        x, y = unV(B.fp[ref].GetPosition())
        B.text(label, x + 5.6, y, 0.8, pcbnew.F_SilkS)


def display_ground_pads(board):
    """Solder mask openings on the display side that leave the ground fill bare (see geometry)."""
    h = G.LCD_GROUND_PAD / 2
    for x, y in G.LCD_GROUND_PADS:
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_RECT)
        s.SetStart(V(x - h, y - h)); s.SetEnd(V(x + h, y + h))
        s.SetLayer(pcbnew.B_Mask); s.SetFilled(True); s.SetWidth(0)
        board.Add(s)


def check_display_ground_pads(board):
    """After the zone fill: every pad must lie on ground fill, clear of vias. Returns the bad ones."""
    fill = next(z for z in board.Zones() if not z.GetIsRuleArea() and z.IsOnLayer(B_) and z.GetNetname() == 'GND')
    vias = [unV(t.GetPosition()) for t in board.GetTracks() if t.GetClass() == 'PCB_VIA']
    h = G.LCD_GROUND_PAD / 2
    bad = []
    for x, y in G.LCD_GROUND_PADS:
        n = int(2 * h / 0.25)
        on_fill = all(fill.HitTestFilledArea(B_, V(x - h + i * 0.25, y - h + j * 0.25), 0)
                      for i in range(n + 1) for j in range(n + 1))
        if not on_fill or any(abs(vx - x) < h + 0.3 and abs(vy - y) < h + 0.3 for vx, vy in vias):
            bad.append((x, y))
    return bad


def zones(B):
    W, H = G.BOARD_W, G.BOARD_H
    ax, ay = G.ANT_C
    hw, hh = G.ANT_W / 2 + 1.5, G.ANT_H / 2 + 1.5
    full = rect(0.3, 0.3, W - 0.3, H - 0.3)
    all_cu = (F, IN1, IN2, B_)
    # copper-free areas
    B.keepout(rect(ax - hw, ay - hh, ax + hw, ay + hh), all_cu, 'NFC antenna: no copper pour', pours=True)
    # nothing else may be routed across the loop; the notch lets the inner feed trace out on the left
    l, r, t, bt = ax - G.ANT_W / 2 + 0.5, ax + G.ANT_W / 2 + 0.6, ay - G.ANT_H / 2 - 0.6, ay + G.ANT_H / 2 + 0.6
    n1, n2, nx = ay - 11.3, ay - 9.7, ax - G.ANT_W / 2 + 4.3
    B.keepout([(l, t), (r, t), (r, bt), (l, bt), (l, n2), (nx, n2), (nx, n1), (l, n1)], all_cu,
              'NFC antenna: no tracks', pours=True, tracks=True, vias=True)
    # copper around the loop must stay open on one side, otherwise it acts as a shorted turn
    B.keepout(rect(ax + G.ANT_W / 2 - 1.0, ay - 2.0, G.NOTCH_X, ay + 0.5), all_cu,
              'NFC antenna: gap in the surrounding copper', pours=True)
    B.keepout(rect(*G.C6_KEEPOUT), all_cu, 'Wi-Fi antenna: no copper', pours=True, tracks=True, vias=True)
    for x1, y1, x2, y2 in G.POE_PRIMARY:
        B.keepout(rect(x1, y1, x2, y2), all_cu, 'PoE primary side: no secondary copper pour', pours=True)
    B.keepout(G.POE_UNDER_MODULE, all_cu, 'PoE module: primary side and isolation barrier, no copper', pours=True,
              tracks=True, vias=True)
    # the 3.3 V pour under the MCU feeds its supply pins through vias inside the pad ring
    cx, cy = unV(B.fp['U201'].GetPosition())
    # (above and left of the MCU it ends at the pad row: signals change to this layer right there)
    B.keepout(rect(cx - 5.6, cy - 5.6, cx + 7.0, cy + 7.0), (IN2,), 'MCU: 3.3 V pour stays whole, no tracks',
              pours=False, tracks=True)
    rr = G.MOUNT_KEEPOUT_R / math.cos(math.pi / 8)
    for hx, hy in G.MOUNT_HOLES:
        octagon = [(hx + rr * math.cos(math.pi / 8 + i * math.pi / 4), hy + rr * math.sin(math.pi / 8 + i * math.pi / 4))
                   for i in range(8)]
        B.keepout(octagon, (F, B_), 'mounting hole: no tracks under the screw head', pours=False, tracks=True,
                  vias=True)
    # The jack's LED supply pins go solid into the 3.3 V plane. With thermal spokes such a pin can end
    # up on a single spoke where signal tracks on that layer pass it.
    for pad in B.fp['J401'].Pads():
        if pad.GetNetname().split('/')[-1] == '+3V3':
            pad.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
    # ground: solid plane on In1, fill on both outer layers
    B.zone('GND', IN1, full, priority=0, thermal=None, name='GND plane')
    B.zone('GND', F, full, priority=0, thermal=None, name='GND top fill')
    B.zone('GND', B_, full, priority=0, thermal=None, name='GND bottom fill')
    # 3.3 V plane on In2, display area only (nothing below the slot needs it as a plane)
    x3, y3 = G.PLANE_3V3_TONGUE
    jx1, jx2, jy = G.PLANE_3V3_JACK
    B.zone('+3V3', IN2, [(0.3, 0.3), (W - 0.3, 0.3), (W - 0.3, 89.0), (jx2, 89.0), (jx2, jy), (jx1, jy), (jx1, 89.0),
                         (x3, 89.0), (x3, y3), (0.3, y3)],
           priority=0, thermal=None, name='3V3 plane')
    # core rail under the MCU on the bottom layer, reaching the DC-DC output capacitors
    cx, cy = unV(B.fp['U201'].GetPosition())
    B.zone('VDD_HP', B_, [(cx - 6.2, cy - 6.2), (cx + 6.2, cy - 6.2), (cx + 6.2, cy + 6.2), (cx - 6.2, cy + 6.2),
                           (cx - 6.2, cy - 6.2), (cx - 4.0, cy - 6.2), (cx - 4.0, cy - 14.4), (cx - 11.4, cy - 14.4),
                           (cx - 11.4, cy - 10.4), (cx - 6.2, cy - 10.4)], priority=2, thermal=False,
           name='VDD_HP core rail')


def setup(board):
    board.SetCopperLayerCount(4)
    # In1 is the ground plane and stays free of tracks. In2 carries the 3.3 V pour, but the autorouter
    # may use it as a third routing layer: two layers are not enough around the MCU.
    board.SetLayerType(IN1, pcbnew.LT_POWER)
    board.SetLayerType(IN2, pcbnew.LT_MIXED)
    ds = board.GetDesignSettings()
    ds.SetBoardThickness(mm(1.6))
    ds.m_TrackMinWidth = mm(0.11)        # the autorouter necks tracks down to 0.112 mm at fine-pitch pins
    ds.m_MinClearance = mm(0.1)
    ds.m_ViasMinSize = mm(0.45)
    ds.m_MinThroughDrill = mm(0.2)
    ds.m_ViasMinAnnularWidth = mm(0.1)
    ds.m_CopperEdgeClearance = mm(0.3)
    ds.m_HoleClearance = mm(0.2)
    ds.m_HoleToHoleMin = mm(0.25)
    ds.m_SilkClearance = mm(0.0)


NETCLASSES = [
    # name, clearance, track, via dia, via drill, nets
    ('Default', 0.127, 0.15, 0.45, 0.2, []),
    # supply nets that end on fine-pitch pins: 0.3 mm still fits a 0.4 mm pitch pad row
    ('Power', 0.127, 0.25, 0.6, 0.3, ['+3V3', 'VDD_HP', 'VDD_HP_1', 'VDD_BAT', 'VDD_USBPHY', 'VDD_FLASH', 'VDD_PSRAM',
                                     'DCDC_SW', 'PHY_3V3', 'PHY_REG', 'NFC_VBAT', 'NFC_TVDD', 'NFC_AVDD', 'NFC_DVDD',
                                     'BL_SW', 'BL_A', 'BL_K', 'BUZ_P', 'BUZ_N']),
    ('Power5V', 0.15, 0.5, 0.8, 0.4, ['+5V', '+5V_USB', '+5V_POE', '+5V_DC', 'VBUS_F', 'BUCK_SW']),
    # DC input, up to 28 V
    ('DCIN', 0.25, 0.6, 0.8, 0.4, ['VDC_IN', 'VDC_F', 'VDC_R', 'VDC', 'DC_SW']),
    ('DCSig', 0.2, 0.25, 0.6, 0.3, ['DC_EN', 'DC_BST']),
    # the USB-C connector has 0.1 mm between its VBUS and GND pads
    ('VBUS', 0.1, 0.6, 0.8, 0.4, ['VBUS']),
    # 48 V side of the PoE module. The 2 mm isolation to all other nets is a custom rule (.kicad_dru)
    ('PoE', 0.3, 0.6, 0.8, 0.4, ['POE_VP', 'POE_VN', 'POE_VPF', 'POE_VNF']),
    ('NFC_RF', 0.127, 0.3, 0.6, 0.3, ['NFC_TX1', 'NFC_TX2', 'NFC_F1', 'NFC_F2', 'NFC_M1', 'NFC_M2', 'NFC_ANT1',
                                      'NFC_ANT2']),
    ('USB', 0.127, 0.25, 0.45, 0.2, ['USB_DP', 'USB_DN', 'USB_DP_M', 'USB_DN_M']),
    ('MDI', 0.127, 0.2, 0.45, 0.2, ['MDI_TP', 'MDI_TN', 'MDI_RP', 'MDI_RN']),
]


def write_project(names):
    """Net classes and rule severities live in the project file."""
    path = os.path.join(PROJECT, NAME + '.kicad_pro')
    pro = json.load(open(path)) if os.path.exists(path) else {}
    classes, patterns = [], []
    for name, clr, w, vd, vdr, pats in NETCLASSES:
        c = {'name': name, 'clearance': clr, 'track_width': w, 'via_diameter': vd, 'via_drill': vdr,
             'microvia_diameter': 0.3, 'microvia_drill': 0.1, 'diff_pair_width': w,
             'diff_pair_gap': 0.15 if name == 'USB' else 0.2, 'diff_pair_via_gap': 0.25,
             'wire_width': 6, 'bus_width': 12, 'line_style': 0,
             'pcb_color': 'rgba(0, 0, 0, 0.000)', 'schematic_color': 'rgba(0, 0, 0, 0.000)', 'priority': 0}
        if name == 'Default':
            c['priority'] = 2147483647
        classes.append(c)
        patterns += [{'netclass': name, 'pattern': names.get(p, p)} for p in pats]
    ns = pro.setdefault('net_settings', {})
    ns['classes'] = classes
    ns['netclass_patterns'] = patterns
    ns.setdefault('meta', {'version': 4})
    sev = pro.setdefault('board', {}).setdefault('design_settings', {}).setdefault('rule_severities', {})
    # converted footprints differ from their library copies in text only; silkscreen is clipped by the fab
    for check in ('lib_footprint_issues', 'lib_footprint_mismatch', 'silk_over_copper', 'silk_overlap',
                  'silk_edge_clearance'):
        sev[check] = 'ignore'
    json.dump(pro, open(path, 'w'), indent=2)
    open(os.path.join(PROJECT, NAME + '.kicad_dru'), 'w').write(
        '(version 1)\n'
        '# The reverse-mount LEDs sit in windows cut into the board: their pads are closer to that edge\n'
        '# than the general copper-to-edge rule allows.\n'
        '(rule "PoE isolation"\n'
        '  (condition "A.NetClass == \'PoE\' && B.NetClass != \'PoE\' && B.NetName != \'\''
        ' && B.NetName != \'unconnected-*\' && !B.memberOfFootprint(\'C102\')")\n'
        '  (constraint clearance (min 2mm)))\n'
        '# the USB-C receptacle has 0.1 mm between its own VBUS and GND pads\n'
        '(rule "USB-C pad spacing"\n'
        '  (condition "A.memberOfFootprint(\'J101\') && B.memberOfFootprint(\'J101\')")\n'
        '  (constraint clearance (min 0.09mm)))\n'
        '(rule "LED window"\n'
        '  (condition "A.memberOfFootprint(\'D70?\')")\n'
        '  (constraint edge_clearance (min 0.12mm)))\n')
