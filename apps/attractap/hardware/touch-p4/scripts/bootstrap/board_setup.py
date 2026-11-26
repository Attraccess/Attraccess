"""Board outline, labels, zones and keep-outs, design rules, net classes and the project file."""

import json
import math
import os
import re

import pcbnew

import geometry as G
from board import ALL_CU, B_, F, IN1, IN2, IN3, IN4, NAME, PLANE_3V3, PROJECT, SIX, V, mm, rect, unV


def outline(B):
    W, H = G.BOARD_W, G.BOARD_H
    nx, ny = G.NOTCH_X, G.NOTCH_Y
    r = 2.0
    k = r * (1 - math.sqrt(0.5))
    px, py = G.POCKET_X, G.POCKET_Y
    # outer contour: rectangle with both bottom corners cut away (Ethernet plug on the right, DC plug on
    # the left), rounded corners
    ax1, ax2, ad = G.WIFI_NOTCH                 # cut under the Wi-Fi antenna, inside corners rounded
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
    """Mechanical reference drawings on user layers. (The silkscreen is in silk.py.)"""
    Dw = pcbnew.Dwgs_User
    B.edge(rect(*G.LENS), layer=Dw, width=0.15)
    B.edge(rect(*G.LCM), layer=Dw, width=0.1)
    B.text('display cover lens 84.3 x 84.3 (on the other side)', 43, 9.0, 1.2, Dw)
    B.text('LCD module (metal back)', 43, 14.6, 1.0, Dw)
    for x1, y1, x2, y2 in G.FLEX_KEEPOUT:
        B.edge(rect(x1, y1, x2, y2), layer=pcbnew.Cmts_User, width=0.1)
    B.text('display flex: no tall parts', 44, 77.9, 0.8, pcbnew.Cmts_User)
    B.edge(rect(*G.FLEX_BEHIND_LCD), layer=pcbnew.Cmts_User, width=0.1)
    B.text('folded display flex behind the LCD (other side)', 38.5, 84.0, 1.0, pcbnew.Cmts_User)
    B.text('Ethernet plug', 77.8, G.NOTCH_Y + 15, 1.0, Dw, rot=90)


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
    all_cu = ALL_CU
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
    B.keepout(rect(*G.WIFI_KEEPOUT), all_cu, 'Wi-Fi antenna: no copper', pours=True, tracks=True, vias=True)
    for x1, y1, x2, y2 in G.POE_PRIMARY:
        B.keepout(rect(x1, y1, x2, y2), all_cu, 'PoE primary side: no secondary copper pour', pours=True)
    B.keepout(G.POE_UNDER_MODULE, all_cu, 'PoE module: primary side and isolation barrier, no copper', pours=True,
              tracks=True, vias=True)
    B.keepout(rect(*G.POE_BARRIER_DIP), all_cu, 'PoE module: barrier between output pins 2 and 3, no copper',
              pours=True, tracks=True, vias=True)
    # the 3.3 V pour under the MCU feeds its supply pins through vias inside the pad ring
    cx, cy = unV(B.fp['U201'].GetPosition())
    # (above and left of the MCU it ends at the pad row: signals change to this layer right there). With six
    # layers 3.3 V has In3 to itself and In2 is ground fill here: the area ends inside the upper and the right
    # pad row, which leaves room for the flash supply's link along them (routes_mcu.upper_left_cluster).
    if G.COPPER_LAYERS == 6:
        B.keepout(rect(cx - 5.6, cy - 4.8, cx + 5.05, cy + 7.0), (IN2,), 'MCU: In2 ground fill stays whole, no tracks',
                  pours=False, tracks=True)
    else:
        B.keepout(rect(cx - 5.6, cy - 5.6, cx + 7.0, cy + 7.0), (IN2,), 'MCU: 3.3 V pour stays whole, no tracks',
                  pours=False, tracks=True)
    # no tracks under the 40 MHz crystal on the other layers (Espressif's layout guide), its courtyard as the area
    cy = B.fp['Y201'].GetCourtyard(pcbnew.F_CrtYd).Outline(0)
    inner = (IN1, IN2, IN3, IN4) if G.COPPER_LAYERS == 6 else (IN1, IN2)
    B.keepout([unV(cy.CPoint(k)) for k in range(cy.PointCount())], inner + (B_,), 'crystal: no tracks under it',
              pours=False, tracks=True)
    rr = G.MOUNT_KEEPOUT_R / math.cos(math.pi / 8)
    for hx, hy in G.MOUNT_HOLES:
        octagon = [(hx + rr * math.cos(math.pi / 8 + i * math.pi / 4), hy + rr * math.sin(math.pi / 8 + i * math.pi / 4))
                   for i in range(8)]
        bare = (hx, hy) == G.NFC_GAP_HOLE
        B.keepout(octagon, (F, B_), 'mounting hole: no %s under the screw head' % ('copper' if bare else 'tracks'),
                  pours=bare, tracks=True, vias=True)
    # fiducials: the pick-and-place camera wants bare copper in the 2 mm mask opening and nothing else
    # within the pad's clearance (0.5 mm pad radius + 0.6 mm). The pour keeps that clearance by itself;
    # tracks and vias are kept out here, so that the routers see it too.
    rf = 1.12 / math.cos(math.pi / 8)
    for ref in sorted(r for r in B.fp if r.startswith('FID')):
        fx, fy = unV(B.fp[ref].GetPosition())
        octagon = [(fx + rf * math.cos(math.pi / 8 + i * math.pi / 4), fy + rf * math.sin(math.pi / 8 + i * math.pi / 4))
                   for i in range(8)]
        B.keepout(octagon, (F,), 'fiducial: no tracks or vias', pours=False, tracks=True, vias=True)
    # The jack's LED supply pins go solid into the 3.3 V plane. With thermal spokes such a pin can end
    # up on a single spoke where signal tracks on that layer pass it.
    for pad in B.fp['J401'].Pads():
        if pad.GetNetname().split('/')[-1] == '+3V3':
            pad.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
    # ground: solid plane on In1, fill on both outer layers
    B.zone('GND', IN1, full, priority=0, thermal=None, name='GND plane')
    B.zone('GND', F, full, priority=0, thermal=None, name='GND top fill')
    B.zone('GND', B_, full, priority=0, thermal=None, name='GND bottom fill')
    # 3.3 V plane, display area only (nothing below the slot needs it as a plane)
    x3, y3 = G.PLANE_3V3_TONGUE
    B.zone('+3V3', PLANE_3V3, [(0.3, 0.3), (W - 0.3, 0.3), (W - 0.3, 89.0), (x3, 89.0), (x3, y3), (0.3, y3)],
           priority=0, thermal=None, name='3V3 plane')
    if SIX:
        # Six layers: the 3.3 V plane has a layer of its own (In3) and stays whole. In2 keeps the signal
        # tracks, with ground filled in between them; a second ground plane (In4) is the reference of
        # the back layer.
        B.zone('GND', IN2, full, priority=0, thermal=None, name='GND fill between the inner tracks')
        B.zone('GND', IN4, full, priority=0, thermal=None, name='GND plane 2')
    # core rail under the MCU on the bottom layer, reaching the DC-DC output capacitors
    cx, cy = unV(B.fp['U201'].GetPosition())
    # One outline without a point visited twice: the square under the MCU, a neck up its left side and
    # the area under the converter's output capacitors. (Drawn as a square plus a second loop from one of
    # its corners, KiCad filled the square only, and the rail hung on one thin track.)
    B.zone('VDD_HP', B_, [(cx + 6.2, cy - 6.2), (cx + 6.2, cy + 6.2), (cx - 6.2, cy + 6.2), (cx - 6.2, cy - 10.4),
                           (cx - 11.4, cy - 10.4), (cx - 11.4, cy - 14.9), (cx - 4.0, cy - 14.9), (cx - 4.0, cy - 6.2)],
           priority=2, thermal=False, name='VDD_HP core rail')


def relieve_small_parts(B):
    """Thermal relief for the pads of the 0402 and 0603 two-pad parts that lie in a copper pour. With one
    pad solid in the ground fill and the other on a thin track, the two ends do not melt at the same
    moment in the oven and the part can stand up. Larger parts, ICs and vias stay solid in the pours."""
    n = 0
    for ref, fp in B.fp.items():
        name = str(fp.GetFPID().GetLibItemName())
        if fp.GetPadCount() != 2 or not any(size in name for size in ('0402', '0603')):
            continue
        for pad in fp.Pads():
            pad.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_THERMAL)
            pad.SetLocalThermalSpokeWidthOverride(mm(0.25))
            pad.SetThermalGap(mm(0.2))
            n += 1
    return n


def stackup_text(layers=None):
    """The (stackup ...) block of the board file for geometry.STACKUP, in KiCad's own layout."""
    layers = layers or G.COPPER_LAYERS
    _name, dielectrics = G.STACKUP[layers]
    copper = ['F.Cu'] + ['In%d.Cu' % k for k in range(1, layers - 1)] + ['B.Cu']
    t = '\t\t\t'
    out = ['\t\t(stackup',
           t + '(layer "F.SilkS"\n' + t + '\t(type "Top Silk Screen")\n' + t + ')',
           t + '(layer "F.Paste"\n' + t + '\t(type "Top Solder Paste")\n' + t + ')',
           t + '(layer "F.Mask"\n' + t + '\t(type "Top Solder Mask")\n' + t + '\t(thickness 0.01)\n' + t + ')']
    for k, name in enumerate(copper):
        thick = G.COPPER_OUTER if k in (0, len(copper) - 1) else G.COPPER_INNER
        out.append(t + '(layer "%s"\n%s\t(type "copper")\n%s\t(thickness %s)\n%s)' % (name, t, t, thick, t))
        if k < len(dielectrics):
            kind, thick, material, er = dielectrics[k]
            out.append(t + '(layer "dielectric %d"\n%s\t(type "%s")\n%s\t(thickness %s)\n%s\t(material "%s")\n'
                       '%s\t(epsilon_r %s)\n%s\t(loss_tangent 0.02)\n%s)' % (k + 1, t, kind, t, thick, t, material, t, er, t, t))
    out += [t + '(layer "B.Mask"\n' + t + '\t(type "Bottom Solder Mask")\n' + t + '\t(thickness 0.01)\n' + t + ')',
            t + '(layer "B.Paste"\n' + t + '\t(type "Bottom Solder Paste")\n' + t + ')',
            t + '(layer "B.SilkS"\n' + t + '\t(type "Bottom Silk Screen")\n' + t + ')',
            t + '(copper_finish "ENIG")', t + '(dielectric_constraints no)', '\t\t)']
    return '\n'.join(out) + '\n'


def write_stackup(path):
    """Put the stack-up into a saved board file. pcbnew's Python interface cannot set it, so the block is
    written into the file's setup section; KiCad reads it back and keeps it from then on."""
    text = open(path, encoding='utf-8').read()
    block = stackup_text()
    old = re.search(r'\t\t\(stackup\n.*?\n\t\t\)\n', text, re.S)
    if old:
        text = text[:old.start()] + block + text[old.end():]
    else:
        at = text.index('\t(setup\n') + len('\t(setup\n')
        text = text[:at] + block + text[at:]
    open(path, 'w', encoding='utf-8').write(text)


def setup(board):
    board.SetCopperLayerCount(G.COPPER_LAYERS)
    # In1 is the ground plane and stays free of tracks. In2 is the third routing layer: two layers are not
    # enough around the MCU. On four layers it also carries the 3.3 V pour; on six that pour has In3 to
    # itself and In4 is a second ground plane.
    board.SetLayerType(IN1, pcbnew.LT_POWER)
    board.SetLayerType(IN2, pcbnew.LT_SIGNAL if SIX else pcbnew.LT_MIXED)
    if SIX:
        board.SetLayerType(IN3, pcbnew.LT_POWER)
        board.SetLayerType(IN4, pcbnew.LT_POWER)
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
    ('Power5V', 0.15, 0.5, 0.8, 0.4, ['+5V', '+5V_USB', '+5V_POE', '+5V_DC', 'VBUS_F', 'BUCK_SW', 'WIFI_BUCK_SW',
                                      '+3V3_WIFI']),
    # DC input, up to 28 V
    ('DCIN', 0.25, 0.6, 0.8, 0.4, ['VDC_IN', 'VDC_F', 'VDC_R', 'VDC', 'DC_SW']),
    ('DCSig', 0.2, 0.25, 0.6, 0.3, ['DC_EN', 'DC_BST']),
    # the USB-C connector has 0.2 mm between its VBUS and GND pads (HRO's drawing)
    ('VBUS', 0.127, 0.6, 0.8, 0.4, ['VBUS']),
    # 48 V side of the PoE module. The 2 mm isolation to all other nets is a custom rule (.kicad_dru)
    ('PoE', 0.3, 0.6, 0.8, 0.4, ['POE_VP', 'POE_VN', 'POE_VPF', 'POE_VNF']),
    ('NFC_RF', 0.127, 0.3, 0.6, 0.3, ['NFC_TX1', 'NFC_TX2', 'NFC_F1', 'NFC_F2', 'NFC_M1', 'NFC_M2', 'NFC_ANT1',
                                      'NFC_ANT2']),
    # widths and gaps of the impedance-controlled lines: routes_signal.py (USB), routes_board.mdi_routes
    ('USB', 0.127, 0.14, 0.45, 0.2, ['USB_DP', 'USB_DN', 'USB_DP_M', 'USB_DN_M']),
    ('MDI', 0.127, 0.155, 0.45, 0.2, ['MDI_TP', 'MDI_TN', 'MDI_RP', 'MDI_RN']),
]


def write_project(names):
    """Net classes and rule severities live in the project file."""
    path = os.path.join(PROJECT, NAME + '.kicad_pro')
    pro = json.load(open(path)) if os.path.exists(path) else {}
    classes, patterns = [], []
    for name, clr, w, vd, vdr, pats in NETCLASSES:
        c = {'name': name, 'clearance': clr, 'track_width': w, 'via_diameter': vd, 'via_drill': vdr,
             'microvia_diameter': 0.3, 'microvia_drill': 0.1, 'diff_pair_width': w,
             'diff_pair_gap': {'USB': 0.15, 'MDI': 1.115}.get(name, 0.2), 'diff_pair_via_gap': 0.25,
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
    # KiCad's default severities for every check: nothing is switched off or downgraded
    pro.setdefault('board', {}).setdefault('design_settings', {}).pop('rule_severities', None)
    json.dump(pro, open(path, 'w'), indent=2)
    open(os.path.join(PROJECT, NAME + '.kicad_dru'), 'w').write(
        '(version 1)\n'
        '(rule "PoE isolation"\n'
        '  (condition "A.NetClass == \'PoE\' && B.NetClass != \'PoE\' && B.NetName != \'\''
        ' && B.NetName != \'unconnected-*\' && !(A.memberOfFootprint(\'J401\') && B.memberOfFootprint(\'J401\'))")\n'
        '  (constraint clearance (min 3mm)))\n'
        # JLCPCB: 0.45 mm between the hole of a part's pad and any other hole (0.2 mm between two vias)
        '(rule "part hole to via hole"\n'
        '  (condition "(A.Type == \'Pad\' && B.Type == \'Via\') || (A.Type == \'Via\' && B.Type == \'Pad\')")\n'
        '  (constraint hole_to_hole (min 0.45mm)))\n')
