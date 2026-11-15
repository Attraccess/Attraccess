"""Fixed routes away from the MCU: 48 V nets, Ethernet pairs, PHY fan-out, antenna feeds, LED supply and
link, DC input, ground vias of modules and ICs, and the via fan-out of all supply pads into the planes."""

import math

import pcbnew

import geometry as G
from board import B_, F, IN2, V, dog, mm, unV


def module_ground(B):
    """Ground vias that plane_fanout() cannot place: one in each of the nine ground pads under the Wi-Fi
    module, two beside the output ground pad of the PoE module (under the module, on the secondary
    side) and one for the backlight driver."""
    for pad in B.fp['U301'].Pads():
        if pad.GetNumber() == '49':
            B.via(*unV(pad.GetPosition()), 'GND', size=0.6, drill=0.3)
    x, y = B.pad('U102', 3)
    for dy in (-0.4, 0.4):
        B.track([(x, y + dy), (x + 2.7, y + dy)], 'GND', 0.5)
        B.via(x + 2.7, y + dy, 'GND', size=0.6, drill=0.3)
    # backlight driver: its ground pin is boxed in by the inductor, so the via goes under the package
    x, y = B.pad('U601', 2)
    B.track([(x, y), (x, y + 0.9), (x + 0.25, y + 1.15)], 'GND', 0.25)
    B.via(x + 0.25, y + 1.15, 'GND')
    # QFN ground pins: straight into the exposed pad, which has the vias (the gap is too narrow for the fill)
    for ref in ('U201', 'U401', 'U501'):
        fp = B.fp[ref]
        ep = max((q for q in fp.Pads() if q.GetNetname() == 'GND'), key=lambda q: q.GetBoundingBox().GetArea())
        bb = ep.GetBoundingBox()
        ex1, ey1 = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
        ex2, ey2 = unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
        for q in fp.Pads():
            if q.GetNetname() != 'GND' or q.GetNumber() == ep.GetNumber():
                continue
            x, y = unV(q.GetPosition())
            end = (min(max(x, ex1 + 0.3), ex2 - 0.3), min(max(y, ey1 + 0.3), ey2 - 0.3))
            B.track(dog((x, y), end), 'GND', 0.2)         # straight in first, clear of the next pin


def ep_vias(board):
    """Ground vias in the exposed pad of the Ethernet PHY (its footprint has none)."""
    fp = board.FindFootprintByReference('U401')
    if fp is None:
        return
    pad = next(p for p in fp.Pads() if p.GetNumber() == '33')
    cx, cy = unV(pad.GetPosition())
    have = [t for t in board.GetTracks() if t.GetClass() == 'PCB_VIA' and t.GetNetCode() == pad.GetNetCode() and
            math.hypot(unV(t.GetPosition())[0] - cx, unV(t.GetPosition())[1] - cy) < 1.3]
    if have:
        return
    for dx in (-0.7, 0.7):
        for dy in (-0.7, 0.7):
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(V(cx + dx, cy + dy)); v.SetWidth(pcbnew.F_Cu, mm(0.6)); v.SetDrill(mm(0.3))
            v.SetNet(pad.GetNet()); v.SetLocked(True); v.SetLayerPair(F, B_)
            board.Add(v)


def poe_routes(B):
    """The four 48 V nets are routed by hand so they stay inside the isolated area."""
    if 'U102' not in B.fp:
        return
    w = 0.6
    p = B.pad
    j9, j10 = p('J401', '9'), p('J401', '10')
    f2a, f2b = p('FB102', '1'), p('FB102', '2')          # POE_VP side, POE_VPF side
    f3a, f3b = p('FB103', '1'), p('FB103', '2')          # POE_VN side, POE_VNF side
    dk, da = p('D103', '1'), p('D103', '2')              # TVS cathode (VPF, bottom), anode (VNF, top)
    m5, m6, m7, m8 = (p('U102', n) for n in '5678')
    c1 = p('C102', '1')
    B.track([j9, f2a], 'POE_VP', w)
    B.track([j10, (f3a[0], j10[1] - (f3a[0] - j10[0])), f3a], 'POE_VN', w)
    # filtered + : bead -> TVS cathode -> up the left side of the strip -> module pins 5 and 6
    xl = dk[0] - 1.9
    B.track([f2b, (dk[0] - 0.7, dk[1] + 0.5)], 'POE_VPF', w)
    B.track([(dk[0] - 0.7, dk[1]), (xl, dk[1] - 1.2), (xl, m5[1] + 1.0), (xl + 1.0, m5[1]), m5], 'POE_VPF', w)
    B.track([m5, m6], 'POE_VPF', w)
    # filtered - : bead -> right of the TVS cathode -> TVS anode -> under the + pads on the back layer
    #              -> module pins 7 and 8 -> C102
    xr = da[0] + 2.15
    B.track([f3b, (xr, f3b[1] - 0.85), (xr, da[1]), da], 'POE_VNF', w)
    vx = 85.1
    v1 = (vx, da[1] - 3.6)
    v2 = (vx, (m7[1] + m8[1]) / 2)
    B.track([(xr, da[1]), (xr, v1[1] + 0.6), v1], 'POE_VNF', w)
    B.via(v1[0], v1[1], 'POE_VNF', size=0.8, drill=0.4)
    B.track([v1, v2], 'POE_VNF', w, layer=B_)
    B.via(v2[0], v2[1], 'POE_VNF', size=0.8, drill=0.4)
    B.track([m7, (m7[0], v2[1]), m8], 'POE_VNF', w)
    B.track([v2, (m7[0], v2[1])], 'POE_VNF', w)
    B.track([m8, (m8[0], c1[1] + 1.2), c1], 'POE_VNF', w)


def mdi_routes(B):
    """Ethernet pairs from the PHY to the jack as two side-by-side pairs, plus the two PHY pins that
    sit between and beside them (regulator output, bias resistor)."""
    if 'U401' not in B.fp:
        return
    w = 0.2
    p = B.pad
    tp, tn, reg, rp, rn, iset = (p('U401', n) for n in ('30', '29', '28', '27', '26', '25'))
    # At the PHY the positive pin of each pair is the upper one and so takes the outer lane; at the jack
    # the positive pin is the inner one. The pairs therefore swap lanes on the way: the negative line
    # changes to the back layer and runs to its (through-hole) jack pin there.
    for pos, neg, name, jp, jn, d_pos, d_neg, drop in ((tp, tn, 'MDI_T', '5', '6', 0.83, 0.4, 3.0),
                                                       (rp, rn, 'MDI_R', '1', '2', 0.25, 0.28, 2.8)):
        (xi, yp), (xo, yn) = p('J401', jp), p('J401', jn)       # inner lane and jack pin +, outer lane and pin -
        yc = pos[1] + drop
        B.track([pos, (xo - d_pos, pos[1]), (xo, pos[1] + d_pos), (xo, yc + 0.6), (xi, yc + 0.6 + (xo - xi)), (xi, yp)],
                name + 'P', w)
        B.track([neg, (xi - d_neg, neg[1]), (xi, neg[1] + d_neg), (xi, yc)], name + 'N', w)
        B.via(xi, yc, name + 'N')
        B.track([(xi, yc), (xo, yc + (xo - xi)), (xo, yn)], name + 'N', w, layer=B_)
    c405, c404, r401 = p('C405', '1'), p('C404', '1'), p('R401', '1')
    B.track([reg, (c405[0] - 0.42, reg[1]), c405, c404], 'PHY_REG', 0.25)
    B.track([iset, (iset[0], iset[1] + 0.9), (r401[0], r401[1] - 0.42), r401], 'PHY_ISET', 0.15)


def nfc_feeds(B):
    """Antenna feeds: straight up from the two damping resistors, under the DC terminal, then right.
    The upper one ends on the outer end of the loop, the lower one crosses the turns through the gap
    in the keep-out to the inner end."""
    a1, a2 = B.pad('ANT501', '1'), B.pad('ANT501', '2')
    nets = B.d.parts['ANT501'].nets
    for a, net in ((a1, nets['1']), (a2, nets['2'])):
        ref = 'R504' if net == 'NFC_ANT1' else 'R505'
        r = B.pad(ref, next(n for n, v in B.d.parts[ref].nets.items() if v == net))
        B.track([r, (r[0], a[1]), a], net, 0.3)


def led_link(B):
    """Data line from the top LED row to the bottom row, on the inner layer past the DC connectors."""
    n = len(G.LED_X)
    last, first = 'D%d' % (700 + n), 'D%d' % (701 + n)    # end of the top row, start of the bottom row
    net = B.d.parts[last].nets['4']
    a, c = B.pad(last, '4'), B.pad(first, '2')
    x = G.ANT_C[0] + G.ANT_W / 2 + 1.7          # between the antenna and the DC connectors
    v1, v2 = (a[0] + 1.9, a[1] + 1.3), (c[0] + 1.9, c[1] - 1.3)
    B.track([a, (a[0] + 0.9, a[1] + 0.3), v1], net, 0.15)
    B.via(*v1, net)
    B.track([v1, (x, v1[1] + (x - v1[0])), (x, v2[1] - (x - v2[0])), v2], net, 0.15, layer=IN2)
    B.via(*v2, net)
    B.track([v2, (v2[0], c[1] - 0.43), (v2[0] - 0.43, c[1]), c], net, 0.15)


def led_power(B):
    """5 V for the top LED row: a bus in the strip between the flex slot and the LED windows."""
    yb = G.SLOT[3] + 0.8
    xs = []
    for i in range(len(G.LED_X)):
        p3 = B.pad('D%d' % (701 + i), '3')
        cap = B.pad('C%d' % (703 + i), '1')
        B.track([(p3[0], yb), p3], '+5V', 0.5)
        B.track(dog(p3, cap), '+5V', 0.3)
        xs.append(p3[0])
    for x1, x2 in zip(xs, xs[1:]):                # one segment per LED, so every junction is an end point
        B.track([(x1, yb), (x2, yb)], '+5V', 0.6)


def phy_fanout(B):
    """PHY pins on the left and bottom side to the parts next to them, in pin order, and its upper right corner."""
    if 'U401' not in B.fp:
        return
    p = B.pad
    net = lambda num: B.d.parts['U401'].nets[str(num)]
    w = 0.15
    # left side: pins 11 to 14 fan out to R404, R405, C403, R407 (same order top to bottom)
    for num, ref, padnum, wd in ((11, 'R404', '2', w), (12, 'R405', '1', w), (13, 'C403', '1', 0.25), (14, 'R407', '1', w)):
        x, y = p('U401', num)
        tx, ty = p(ref, padnum)
        d = abs(ty - y)
        xk = x - 0.6 if d > 0.8 else x - 1.1              # where the diagonal starts
        B.track([(x, y), (xk, y), (xk - d, ty), (tx, ty)], net(num), wd)
    # pin 10 carries the same 50 MHz clock as pin 14: joined on the back layer
    x, y = p('U401', 10)
    v1 = (x - 1.15, y - 1.3)
    r407 = p('R407', '1')
    v2 = (r407[0] + 0.22, r407[1] + 0.9)
    B.track([(x, y), (x - 0.55, y), (x - 1.15, y - 0.6), v1], net(10), w)
    B.via(*v1, net(10))
    B.track(dog(v1, v2), net(10), w, layer=B_)
    B.via(*v2, net(10))
    B.track(dog(v2, r407, 'd'), net(10), w)
    # upper right corner: TXER (pin 1) to its pull-down, the supply pin 31 to its capacitor, and the reset
    # pin 32 to a via between the two. Left to the router, these three block each other.
    t1, r406 = p('U401', 1), p('R406', '1')
    yk = t1[1] - 0.9
    B.track([t1, (t1[0], yk + 0.3), (t1[0] + 0.3, yk), (r406[0] - (r406[1] - yk), yk), r406], net(1), w)
    B.track(dog(p('U401', 31), p('C402', '1')), net(31), 0.2)
    x, y = p('U401', 32)
    B.track([(x, y), (x + 0.45, y), (x + 0.9, y - 0.45)], net(32), w)
    B.via(x + 0.9, y - 0.45, net(32))
    # bottom side: pins 17 to 20 to R409, R408, R410, R403
    for num, ref, padnum in ((17, 'R409', '1'), (18, 'R408', '1'), (19, 'R410', '1'), (20, 'R403', '2')):
        x, y = p('U401', num)
        tx, ty = p(ref, padnum)
        d = abs(tx - x)
        yk = ty - 0.25 - d                                 # the diagonal ends 0.25 mm above the pad centre
        B.track([(x, y), (x, yk), (tx, ty - 0.25), (tx, ty)], net(num), w)


def dc_route(B):
    """DC input: terminal and jack joined, then up through the board bridge to the fuse, diode and
    TVS beside the converter."""
    w = 0.6
    p = B.pad
    top, bot = sorted(B.pads_num('J103', '1'), key=lambda q: q[1])
    jack, f1 = p('J102', '1'), p('F102', '1')
    B.track([bot, top, (top[0], jack[1]), jack], 'VDC_IN', w)     # both pins of the + pole, then the jack
    B.track(dog(jack, f1), 'VDC_IN', w)
    B.track(dog(p('F102', '2'), p('D105', '2')), 'VDC_F', w)
    d105, d106, c112 = p('D105', '1'), p('D106', '1'), p('C112', '1')
    xe = 1.3
    B.track([d105, d106, (xe, d106[1] - (d106[0] - xe)), (xe, c112[1] + (c112[0] - xe)), c112], 'VDC', w)


def plane_fanout(B):
    """Give every supply pad of the small parts its own via into the ground / 3.3 V plane.

    Returns the pads for which no free spot was found (the autorouter has to deal with those).
    """
    VIA_R, CLR, W = 0.225, 0.14, 0.25
    x3, y3 = G.PLANE_3V3_TONGUE
    gnd, p3v3 = B.names.get('GND', 'GND'), B.names.get('+3V3', '+3V3')

    def has_plane(net, x, y):
        if net == gnd:
            return True
        return net == p3v3 and (y < 88.0 or (x < x3 - 0.8 and y < y3 - 0.8))
    pads = []                                    # (net, x1, y1, x2, y2) of every pad
    for ref, fp in B.fp.items():
        for pad in fp.Pads():
            bb = pad.GetBoundingBox()
            x1, y1 = unV(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unV(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            pads.append((pad.GetNetname(), x1, y1, x2, y2, ref, pad))
    vias = [(unV(t.GetPosition()), t.GetNetname()) for t in B.b.GetTracks() if t.GetClass() == 'PCB_VIA']
    segs = [(unV(t.GetStart()), unV(t.GetEnd()), pcbnew.ToMM(t.GetWidth()), t.GetNetname())
            for t in B.b.GetTracks() if t.GetClass() == 'PCB_TRACK']

    def seg_dist(px, py, a, c):
        (x1, y1), (x2, y2) = a, c
        dx, dy = x2 - x1, y2 - y1
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - x1 - t * dx, py - y1 - t * dy)
    holes = [G.SLOT] + [(x - 2.0, y - 1.8, x + 2.0, y + 1.8) for y in (G.LED_Y_TOP, G.LED_Y_BOT) for x in G.LED_X]
    ax, ay = G.ANT_C
    keep = holes + [G.C6_KEEPOUT, (ax - G.ANT_W / 2 - 1, ay - G.ANT_H / 2 - 1, ax + G.ANT_W / 2 + 1, ay + G.ANT_H / 2 + 1)]
    kr = G.MOUNT_KEEPOUT_R + 0.3
    keep += G.POE_PRIMARY + [(hx - kr, hy - kr, hx + kr, hy + kr) for hx, hy in G.MOUNT_HOLES]

    def free(x, y, net):
        if not (0.7 < x < G.BOARD_W - 0.7 and 0.7 < y < G.BOARD_H - 0.7):
            return False
        if x > G.NOTCH_X - 0.7 and y > G.NOTCH_Y - 0.7:
            return False
        if x < G.POCKET_X + 0.7 and y > G.POCKET_Y - 0.7:
            return False
        for x1, y1, x2, y2 in keep:
            if x1 - 0.5 < x < x2 + 0.5 and y1 - 0.5 < y < y2 + 0.5:
                return False
        for pnet, x1, y1, x2, y2, _, _ in pads:
            dx = max(x1 - x, 0, x - x2)
            dy = max(y1 - y, 0, y - y2)
            d = math.hypot(dx, dy)
            if pnet != net and d < VIA_R + CLR:
                return False
            if pnet == net and d < 0.05 and False:
                return False
        for (vx, vy), vnet in vias:
            if vnet != net and math.hypot(vx - x, vy - y) < 2 * VIA_R + CLR + 0.2:
                return False
        for a, c, w, snet in segs:                    # a via goes through all layers
            if snet != net and seg_dist(x, y, a, c) < VIA_R + w / 2 + (0.3 if w > 0.45 else 0.15):
                return False
        return True

    # C206 hangs on MCU pin 96, which has its own via. A second via here would sit in front of the
    # four NFC pins and leave room for only three of their tracks.
    fed = {('C206', '1'), ('U601', '2')}            # U601: via from module_ground()
    fed |= {('J601', n) for n in ('1', '7', '13', '25', '37')}       # vias from mcu_escape()
    # ICs and connectors whose supply pads get a via too. Without one, a converter's or protection
    # diode's ground pin would depend on what the routing leaves of the copper fill around it.
    # (MCU, PHY, PN532 and Wi-Fi module have vias in their exposed pads.)
    ics = ('U101', 'U103', 'U104', 'U202', 'U203', 'U601', 'U602', 'U701', 'J101', 'J601')
    failed, made = [], 0
    for net, x1, y1, x2, y2, ref, pad in list(pads):
        if net not in (gnd, p3v3):
            continue
        if not ref.startswith(('C', 'R', 'FB', 'L', 'D', 'Y', 'Q', 'RN', 'TP', 'SW', 'BZ')) and ref not in ics:
            continue
        if (ref, pad.GetNumber()) in fed:
            continue
        if pad.GetAttribute() != pcbnew.PAD_ATTRIB_SMD:
            continue
        px, py = (x1 + x2) / 2, (y1 + y2) / 2
        if not has_plane(net, px, py):
            continue
        fx, fy = unV(B.fp[ref].GetPosition())
        ox, oy = px - fx, py - fy                     # outward direction: away from the part centre
        n = math.hypot(ox, oy) or 1.0
        ox, oy = ox / n, oy / n
        hw, hh = (x2 - x1) / 2, (y2 - y1) / 2
        done = False
        # an existing via of the same net close by is good enough
        for (vx, vy), vnet in vias:
            if vnet == net and math.hypot(vx - px, vy - py) < max(hw, hh) + 0.9:
                B.track([(px, py), (vx, vy)], net, W)
                done = True
                break
        if not done:
            for dist_extra in (0.12, 0.3, 0.55):
                for ang in (0, 45, -45, 90, -90, 135, -135):
                    r = math.radians(ang)
                    dx = ox * math.cos(r) - oy * math.sin(r)
                    dy = ox * math.sin(r) + oy * math.cos(r)
                    reach = min(hw / abs(dx) if abs(dx) > 1e-6 else 9, hh / abs(dy) if abs(dy) > 1e-6 else 9)
                    d = reach + VIA_R + dist_extra
                    vx, vy = px + dx * d, py + dy * d
                    if free(vx, vy, net) and all(
                            snet == net or seg_dist(px + dx * d / 2, py + dy * d / 2, a, c) > W / 2 + w / 2 + 0.14
                            for a, c, w, snet in segs):
                        B.track([(px, py), (vx, vy)], net, W)
                        B.via(vx, vy, net)
                        vias.append(((vx, vy), net))
                        made += 1
                        done = True
                        break
                if done:
                    break
        if not done:
            failed.append('%s.%s' % (ref, pad.GetNumber()))
    print('plane fan-out: %d vias, %d pads left to the router%s' % (
        made, len(failed), (': ' + ' '.join(failed[:40])) if failed else ''))
    return failed
