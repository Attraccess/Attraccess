"""Fixed routes away from the MCU: 48 V nets, Ethernet pairs, PHY fan-out, antenna feeds, the LED ring, DC
input, ground vias of modules and ICs, and the via fan-out of all supply pads into the planes."""

import math

import pcbnew

import geometry as G
from board import B_, F, IN2, V, dog, mm, unV
from placement import LED_VIA, LED_VIA_OUT, led_frame, led_gap_index, led_refs


def module_ground(B):
    """Ground vias that plane_fanout() cannot place: twelve between the nine ground pads under the Wi-Fi
    module, two beside the output ground pad of the PoE module (under the module, on the secondary
    side), one for the backlight driver and one under the ESD part U603."""
    # The Wi-Fi module's nine ground pads (1.2 mm at 1.65 mm): a via in the middle of each of the twelve
    # 0.45 mm gaps between two neighbours, where Espressif's land pattern has them (ESP32-C5-MINI-1 datasheet
    # v1.4, fig. 11-1). The smallest via, 0.45 mm, just fills a gap and touches no paste; the order fills and
    # caps every via.
    pads = [unV(pad.GetPosition()) for pad in B.fp['U301'].Pads() if pad.GetNumber() == '61']
    xs, ys = sorted({round(x, 3) for x, _y in pads}), sorted({round(y, 3) for _x, y in pads})
    gaps = [((xa + xb) / 2, y) for xa, xb in zip(xs, xs[1:]) for y in ys]
    gaps += [(x, (ya + yb) / 2) for ya, yb in zip(ys, ys[1:]) for x in xs]
    for x, y in gaps:
        B.via(x, y, 'GND', size=0.45, drill=0.2)
    x, y = B.pad('U102', 3)
    for dy in (-0.4, 0.4):
        B.track([(x, y + dy), (x + 2.7, y + dy)], 'GND', 0.5)
        B.via(x + 2.7, y + dy, 'GND', size=0.6, drill=0.3)
    # backlight driver: its ground pin is boxed in by the inductor, so the via goes under the package
    x, y = B.pad('U601', 2)
    B.track([(x, y), (x, y + 0.9), (x + 0.25, y + 1.15)], 'GND', 0.25)
    B.via(x + 0.25, y + 1.15, 'GND')
    # ESD part of the touch lines U603: its ground pin sits between two signal pins whose tracks close it in; a
    # via under the package, between its two pad rows
    x, y = B.pad('U603', '2')
    B.track([(x, y), (x, y - 0.95)], 'GND', 0.25)
    B.via(x, y - 0.95, 'GND')
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
    """Ground vias in the exposed pad of the Ethernet PHY (its footprint has none): a cross of five, in
    the lanes between the four solder paste windows (make_lib.py), so no paste runs into a hole."""
    fp = board.FindFootprintByReference('U401')
    if fp is None:
        return
    pad = next(p for p in fp.Pads() if p.GetNumber() == '33')
    cx, cy = unV(pad.GetPosition())
    have = [t for t in board.GetTracks() if t.GetClass() == 'PCB_VIA' and t.GetNetCode() == pad.GetNetCode() and
            math.hypot(unV(t.GetPosition())[0] - cx, unV(t.GetPosition())[1] - cy) < 1.3]
    if have:
        return
    for dx, dy in ((0.0, 0.0), (-0.95, 0.0), (0.95, 0.0), (0.0, -0.95), (0.0, 0.95)):
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
    # Jack to the beads, each straight below its bead. Under the rear wall of the jack's metal shell the
    # two nets run on the inner layer: on the component side there would be 48 V against the shield
    # with nothing but solder mask in between, and the back layer faces the display's metal back. A via
    # above the shell brings each net up to its bead.
    yv = G.JACK_REAR_CLEAR_Y - 0.4                       # the via's copper ends where the limit is
    # The inner-layer track starts inside the pin's pad on the side away from the jack's shield pad GND2:
    # from the pin's centre its 0.6 mm would come 2.6 mm from that pad, from there 3.06 mm.
    g2 = p('J401', 'GND2')
    for name, pin, bead in (('POE_VP', j9, f2a), ('POE_VN', j10, f3a)):
        xv = bead[0]
        dx, dy = pin[0] - g2[0], pin[1] - g2[1]
        k = 0.5 / math.hypot(dx, dy)
        start = (pin[0] + dx * k, pin[1] + dy * k)
        B.track([start, (xv, start[1] - abs(xv - start[0])), (xv, yv)], name, w, layer=IN2)
        B.via(xv, yv, name, size=0.8, drill=0.4)
        B.track([(xv, yv), bead], name, w)
    # filtered + : bead -> TVS cathode -> up the left side of the strip -> module pins 5 and 6
    xl = dk[0] - 1.9
    B.track([f2b, (dk[0] - 0.7, dk[1] + 0.5)], 'POE_VPF', w)
    B.track([(dk[0] - 0.7, dk[1]), (xl, dk[1] - 1.2), (xl, m5[1] + 1.0), (xl + 1.0, m5[1]), m5], 'POE_VPF', w)
    B.track([m5, m6], 'POE_VPF', w)
    # filtered - : bead -> right of the TVS cathode -> TVS anode -> under the + pads on the inner layer
    #              -> module pins 7 and 8 -> C102. (Not on the back layer: that one faces the display.)
    xr = da[0] + 2.15
    B.track([f3b, (xr, f3b[1] - 0.85), (xr, da[1]), da], 'POE_VNF', w)
    vx = 85.1
    v1 = (vx, da[1] - 3.6)
    v2 = (vx, (m7[1] + m8[1]) / 2)
    B.track([(xr, da[1]), (xr, v1[1] + 0.6), v1], 'POE_VNF', w)
    B.via(v1[0], v1[1], 'POE_VNF', size=0.8, drill=0.4)
    B.track([v1, v2], 'POE_VNF', w, layer=IN2)
    B.via(v2[0], v2[1], 'POE_VNF', size=0.8, drill=0.4)
    B.track([m7, (m7[0], v2[1]), m8], 'POE_VNF', w)
    B.track([v2, (m7[0], v2[1])], 'POE_VNF', w)
    B.track([m8, (m8[0], c1[1] + 1.2), c1], 'POE_VNF', w)
    # Module output: the two pins are joined between their pads, not around the pad ends, which would
    # be inside the module's isolation barrier (geometry.POE_UNDER_MODULE). Then on to the output
    # capacitors and the ideal diode's MOSFET (its source).
    w5 = 0.5
    o1, o2, c103, c104, q = p('U102', '1'), p('U102', '2'), p('C103', '1'), p('C104', '1'), p('Q101', '2')
    B.track([o2, o1, (o1[0], c103[1] + 5.08), (c103[0], c103[1] + 5.08 - (c103[0] - o1[0])), c103], '+5V_POE', w5)
    B.track(dog(c103, q), '+5V_POE', w5)
    B.track([c103, (c104[0], c103[1] - (c104[0] - c103[0])), c104], '+5V_POE', w5)


def shield_route(B):
    """The jack's two shield pads joined on the inner layer below its pin rows: 3.25 mm from PoE pin 10 (the
    isolation rule asks 3 mm) and clear of the jack's two plastic pegs, whose holes lie 1.6 mm further down."""
    if 'J401' not in B.fp:
        return
    g1, g2 = B.pad('J401', 'GND1'), B.pad('J401', 'GND2')
    y = G.JACK_Y + 0.15
    B.track([g1, (g1[0] + 0.8, y), (g2[0] - 0.8, y), g2], 'ETH_SHIELD', 0.2, layer=IN2)


def mdi_routes(B):
    """Ethernet pairs from the PHY to the jack as two side-by-side pairs, plus the two PHY pins that
    sit between and beside them (regulator output, bias resistor)."""
    if 'U401' not in B.fp:
        return
    # 0.155 mm: 50.3 ohm on either outer layer (JLCPCB's impedance calculator, stack-up JLC06161H-3313, read
    # 25 November 2026). The lines of a pair run 1.27 mm apart, the jack's pin pitch, which couples them
    # little: about 100 ohm between them, as 100BASE-TX wants.
    w = 0.155
    p = B.pad
    tp, tn, reg, rp, rn, iset = (p('U401', n) for n in ('30', '29', '28', '27', '26', '25'))
    # At the PHY the positive pin of each pair is the upper one and so takes the outer lane; at the jack
    # the positive pin is the inner one. The pairs therefore swap lanes on the way.
    # Both lines of a pair run side by side on the component side down to the jack. There, before the
    # rear wall of its shell, they change to the back layer through one via each and swap lanes.
    for pos, neg, name, jp, jn, d_pos, d_neg in ((tp, tn, 'MDI_T', '5', '6', 0.83, 0.4),
                                                 (rp, rn, 'MDI_R', '1', '2', 0.25, 0.28)):
        (xi, yp), (xo, yn) = p('J401', jp), p('J401', jn)       # inner lane and jack pin +, outer lane and pin -
        yc = G.JACK_REAR_CLEAR_Y - 2.4                           # the lower via's copper ends at the limit
        vp = (xi, yc + 0.6 + (xo - xi))
        B.track([pos, (xo - d_pos, pos[1]), (xo, pos[1] + d_pos), (xo, yc + 0.6), vp], name + 'P', w)
        B.via(*vp, name + 'P')
        B.track([vp, (xi, yp)], name + 'P', w, layer=B_)
        B.track([neg, (xi - d_neg, neg[1]), (xi, neg[1] + d_neg), (xi, yc)], name + 'N', w)
        B.via(xi, yc, name + 'N')
        # MDI_TN passes the jack's PoE pin 9: 0.1 mm further left keeps it 3 mm from it (3.06 mm)
        s = 0.1 if name == 'MDI_T' else 0.0
        B.track([(xi, yc), (xo - s, yc + (xo - s - xi)), (xo - s, yn - 1.0), (xo, yn)], name + 'N', w, layer=B_)
    # centre taps: from the capacitors straight down to jack pins 3 and 4
    B.track([p('C408', '1'), p('J401', '3')], 'ETH_CT_RX', 0.15)
    B.track([p('C409', '1'), p('J401', '4')], 'ETH_CT_TX', 0.15)
    c405, c404, r401 = p('C405', '1'), p('C404', '1'), p('R401', '1')
    B.track([reg, (c405[0] - 0.42, reg[1]), c405, c404], 'PHY_REG', 0.25)
    B.track([iset, (iset[0], iset[1] + 0.9), (r401[0], r401[1] - 0.42), r401], 'PHY_ISET', 0.15)


def nfc_feeds(B):
    """Antenna feeds from the two damping resistors below the PN532 block to the loop: on the back layer past
    the 5 V rail and between the cut-outs of the LED ring's upper left corner, then on the front layer down
    to the loop's ends. The one to the outer end (NFC_ANT2) runs on the right; the one to the inner end
    crosses the turns through the gap in the keep-out."""
    a_out, a_in = B.pad('ANT501', '1'), B.pad('ANT501', '2')          # outer end NFC_ANT2, inner end NFC_ANT1
    w = 0.3
    for ref, net, ant, lane, turn in (('R505', 'NFC_ANT2', a_out, a_out[0] - 0.9, 95.5),
                                      ('R504', 'NFC_ANT1', a_in, a_out[0] - 1.6, None)):
        r = B.pad(ref, next(n for n, v in B.d.parts[ref].nets.items() if v == net))
        v1 = (r[0], r[1] + 1.0)
        B.track([r, v1], net, w)
        B.via(*v1, net, size=0.6, drill=0.3)
        if turn:                                    # outer: down the right lane, a via above the loop's corner
            v2 = (lane, G.ANT_C[1] - G.ANT_H / 2)
            B.track([v1, (lane, v1[1] + lane - v1[0]), v2], net, w, layer=B_)
        else:                                       # inner: diagonally to the left lane, a via beside the LED
            v2 = (lane, G.ANT_C[1] - G.ANT_H / 2 + 1.5)
            B.track([v1, (lane, v1[1] + lane - v1[0]), v2], net, w, layer=B_)
        B.via(*v2, net, size=0.6, drill=0.3)
        B.track([v2, (lane, ant[1]), ant], net, w)


# corners of the 5 V rail on In2 are cut off by this much (bottom left: the mounting hole H803)
LED_RAIL_CHAMFER = 3.0


def led_ring(B):
    """The LED ring: the data line from LED to LED, each LED's supply pad to its capacitor and a via, and the
    5 V rail on In2 that joins the vias. The rail runs round the ring outside the LEDs and stays open where the
    copper round the NFC loop is open (geometry.NFC_GAP): closed, it would be a shorted turn round the loop
    (its capacitors join it to ground at 13.56 MHz). The data line does cross that gap: it ends in an LED's
    input, which is no low impedance."""
    n = len(G.LEDS)
    refs = led_refs()
    gap = led_gap_index()
    w = 0.2
    vias = []
    for k in range(n):
        f = led_frame(k)
        ref, cref = refs[k]
        p3 = B.pad(ref, '3')
        c1 = B.pad(cref, '1')
        via = f(*(LED_VIA_OUT if k == gap else LED_VIA))
        vias.append(via)
        if k == gap:
            B.track(dog(p3, c1), '+5V', 0.4)
        else:                                       # along the pad's outer edge, clear of the capacitor's ground
            B.track([p3, f(2.775, -1.08), c1], '+5V', 0.3)
        B.track([c1, via], '+5V', 0.4)
        B.via(*via, '+5V', size=0.8, drill=0.4)
        if k + 1 == n:
            break
        net = B.d.parts[ref].nets['4']
        out, nxt = B.pad(ref, '4'), B.pad(refs[k + 1][0], '2')
        # the next LED's input in this LED's frame
        x0, y0, rot = G.LEDS[k]
        c, s_ = round(math.cos(math.radians(rot))), round(math.sin(math.radians(rot)))
        dx, dy = nxt[0] - x0, nxt[1] - y0
        nx, ny = dx * c - dy * s_, dx * s_ + dy * c
        if abs(ny + 0.75) < 0.01:                   # the next LED on the same side: past the capacitor's inner end
            pts = [out, f(5.6, 0.75), f(7.1, -0.75), nxt]
        else:                                       # round a corner
            d = ny - 0.75 - 0.4
            pts = [out, f(nx - d, 0.75), f(nx, ny - 0.4), nxt]
        B.track(pts, net, w)
    # the rail: from the LED after the gap round the ring to the LED before it
    order = [(gap + 1 + j) % n for j in range(n)]
    pts = []
    for j, k in enumerate(order):
        v = vias[k]
        if j and G.LEDS[k][2] != G.LEDS[order[j - 1]][2]:
            # corner: the square's corner point, cut off
            prev = pts[-1]
            corner = (v[0], prev[1]) if G.LEDS[order[j - 1]][2] in (0, 180) else (prev[0], v[1])
            ux, uy = (corner[0] - prev[0]), (corner[1] - prev[1])
            la = math.hypot(ux, uy)
            vx, vy = (v[0] - corner[0]), (v[1] - corner[1])
            lb = math.hypot(vx, vy)
            ch = min(LED_RAIL_CHAMFER, la, lb)
            pts.append((corner[0] - ux / la * ch, corner[1] - uy / la * ch))
            pts.append((corner[0] + vx / lb * ch, corner[1] + vy / lb * ch))
        pts.append(v)
    for a, b in zip(pts, pts[1:]):                  # one segment each, so every junction is an end point
        B.track([a, b], '+5V', 0.6, layer=IN2)


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
    """DC input: terminal and jack joined, then up through the board bridge to the fuse, the diode, the
    input filter and the TVS beside the converter."""
    w = 0.6
    p = B.pad
    top, bot = sorted(B.pads_num('J103', '1'), key=lambda q: q[1])
    jack, f1 = p('J102', '1'), p('F102', '1')
    B.track([bot, top, (top[0], jack[1]), jack], 'VDC_IN', w)     # both pins of the + pole, then the jack
    B.track(dog(jack, f1), 'VDC_IN', w)
    B.track(dog(p('F102', '2'), p('D105', '2')), 'VDC_F', w)
    # input TVS: its VDC_F pad below and right of the diode's, its ground pad straight down into the plane
    d107a, d107g = p('D107', '1'), p('D107', '2')
    B.track([p('D105', '2'), d107a], 'VDC_F', w)
    for dx in (-0.45, 0.45):
        B.track([d107g, (d107g[0] + dx, d107g[1] + 2.0)], 'GND', w)
        B.via(d107g[0] + dx, d107g[1] + 2.0, 'GND', size=0.6, drill=0.3)
    # diode cathode -> filter inductor (straight above it) and the filter capacitor beside the inductor
    d105, l_in, c117 = p('D105', '1'), p('L103', '1'), p('C117', '1')
    B.track([d105, l_in], 'VDC_R', w)
    B.track(dog(l_in, c117), 'VDC_R', w)
    # filter output -> TVS -> along the board edge up to the converter's input capacitors
    l_out, d106, c112 = p('L103', '2'), p('D106', '1'), p('C112', '1')
    xe = 1.3
    B.track([l_out, d106, (xe, d106[1] - (d106[0] - xe)), (xe, c112[1] + (c112[0] - xe)), c112], 'VDC', w)


def small_links(B):
    """Short links of the parts that were added after the autorouter ran: the two bleed resistors and
    the pull-down of the LED data line."""
    p = B.pad
    B.track([p('C101', '1'), p('R104', '1')], '+5V_USB', 0.3)
    B.track([p('C116', '1'), p('R105', '1')], '+5V_DC', 0.3)
    u, r = p('U701', '2'), p('R705', '1')
    B.track([u, (r[0], u[1]), r], 'LED_DATA', 0.15)


def tamper_routes(B):
    """Accelerometer and hall switch: the links between their pins and capacitors. The accelerometer's
    pads are 0.5 mm apart, so its supply and ground pins are joined right at the part. The bus pins and
    the hall switch's output are left to finish_route.py."""
    p = B.pad
    w = 0.2
    u = lambda n: p('U702', str(n))
    # supply: pins 10 and 9 -> 100 nF -> 10 uF; CS (pin 2) through a via into the 3.3 V plane
    c1, c2 = p('C711', '1'), p('C712', '1')
    B.track([u(10), u(9), c1], '+3V3', w)
    B.track(dog(c1, c2), '+3V3', w)
    v = (round(u(2)[0] - 0.94, 3), u(2)[1])
    B.track([u(2), v], '+3V3', 0.15)
    B.via(*v, '+3V3')
    # address pin SA0 (pin 3) straight left to its pull-up, and the pull-up into the 3.3 V plane
    r1, r2 = p('R706', '1'), p('R706', '2')
    B.track([u(3), r2], 'ACC_SA0', 0.15)
    vr = (r1[0], round(r1[1] - 0.95, 3))
    B.track([r1, vr], '+3V3', w)
    B.via(*vr, '+3V3')
    # ground: pins 5 to 8 joined, then down to the 10 uF capacitor
    B.track([u(5), u(6)], 'GND', 0.15)
    B.track(dog(u(6), u(7)), 'GND', 0.15)
    B.track([u(7), u(8)], 'GND', 0.15)
    B.track(dog(u(6), p('C712', '2')), 'GND', w)
    # interrupt output to its test point
    B.track([u(12), p('TP814', '1')], 'ACC_INT', 0.15)
    # hall switch: supply pin to its capacitor
    B.track([p('U703', '1'), p('C713', '1')], '+3V3', w)


def proximity_routes(B):
    """Proximity sensor: the link between its two cathode pins, its supply pins with their capacitors and the
    interrupt output. The bus pins (lower left) are left to finish_route.py, so nothing fixed runs past them."""
    p = B.pad
    u = lambda n: p('U704', str(n))
    cx = G.PROX[0]
    # emitter cathode (pin 5) to the driver's pin 2: along the middle of the part, between its two pad rows
    B.track([u(5), (cx, u(5)[1]), (cx, u(2)[1]), u(2)], 'PROX_K', 0.25)
    # supply: anode (pin 4) and VDD (pin 3) joined, 100 nF beside pin 3, 10 uF above pin 4
    c1, c2 = p('C714', '1'), p('C715', '1')
    B.track([u(4), u(3), c1], '+3V3', 0.25)
    B.track(dog(u(4), c2), '+3V3', 0.25)
    # interrupt: left out of pin 6, up to the test point, on to the pull-up
    tp, r = p('TP815', '1'), p('R707', '2')
    xi = round(u(6)[0] - 1.06, 3)
    B.track([u(6), (xi, u(6)[1])] + dog((xi, u(6)[1]), tp)[1:], 'PROX_INT', 0.15)
    B.track(dog(tp, r, first='d'), 'PROX_INT', 0.15)


def buzzer_routes(B):
    """Buzzer and its driver. The coil is between pads 1 (+) and 2 (-), both on the side away from the
    sound port. Pad 1 is next to the series resistor. Pad 2 is on the far side of the part: its
    track runs on the inner layer above the buzzer and comes back to the flyback diode and the
    transistor."""
    p = B.pad
    w = 0.25
    b1, b2 = p('BZ701', '1'), p('BZ701', '2')
    r2, dk, da, q3 = p('R702', '2'), p('D709', '1'), p('D709', '2'), p('Q701', '3')
    # + : buzzer pad 1 -> below the resistor's supply pad -> resistor pad 2, with a branch to the diode's cathode
    xa, yk, xk = b1[0] + 1.454, r2[1] + 0.794, dk[0] - 0.9
    B.track([b1, (xa, b1[1]), (xa, yk - 0.496), (xa + 0.496, yk), (xk, yk)], 'BUZ_P', w)
    B.track([(xk, yk), (r2[0] - 0.794, yk), r2], 'BUZ_P', w)
    B.track([(xk, yk), (xk, dk[1] - 0.9), dk], 'BUZ_P', w)
    # - : buzzer pad 2 -> via -> inner layer -> via beside the resistor -> diode anode -> transistor
    vb = (r2[0] + 1.509, r2[1] - 0.705)
    d = 2.227
    va = (b2[0] - 0.573, vb[1] - d)
    B.track([b2, (b2[0], b2[1] - 1.454), (va[0], b2[1] - 2.027), va], 'BUZ_N', w)
    B.via(*va, 'BUZ_N', size=0.6, drill=0.3)
    B.track([va, (vb[0] - d, va[1]), vb], 'BUZ_N', w, layer=IN2)
    B.via(*vb, 'BUZ_N', size=0.6, drill=0.3)
    xn = da[0] + 0.9
    B.track([vb, (vb[0], da[1] - (vb[0] - xn)), (xn, da[1])], 'BUZ_N', w)
    B.track([(xn, da[1]), da], 'BUZ_N', w)
    B.track([(xn, da[1]), (xn, q3[1] - (xn - q3[0])), q3], 'BUZ_N', w)


def usb_power_routes(B):
    """The USB path through the eFuse U105 at full width. Its IN and OUT are 0.3 mm bars between the two pin
    rows, reached from their ends: IN from the top (ferrite and C101 come in above the pin row), OUT from
    the bottom, then above the 3.3 V converter's inductor to its input capacitor C106. (The router took
    0.17 mm tracks here, the 5 V one between the inductor's pads.)"""
    p = B.pad
    vin, vout = p('U105', '5'), p('U105', '6')
    fb, c101, c106 = p('FB101', '2'), p('C101', '1'), p('C106', '1')
    top, bot = vin[1] - 1.2, vout[1] + 1.2                 # the bars' ends (2.4 mm long)
    # as wide as the bar only until the wide track clears the other bar and the pin rows (0.15 mm)
    xr, yi = c101[0] - 1.6, top - 0.15 - 0.3
    B.track(dog(fb, c101), '+5V_USB', 0.6)
    B.track([c101, (xr, c101[1]), (xr, yi - 0.15), (vin[0], yi - 0.15), (vin[0], yi)], '+5V_USB', 0.6)
    B.track([(vin[0], yi), (vin[0], top + 0.2)], '+5V_USB', 0.3)
    yo = c106[1] - 3.85                                    # above the inductor and C107's ground via
    yw = bot + 0.15 + 0.4
    B.track([(vout[0], bot - 0.2), (vout[0], yw)], '+5V', 0.3)
    B.track([(vout[0], yw), (vout[0] - (yo - yw), yo), (c106[0], yo), c106], '+5V', 0.8)


def buck_routes(B):
    """The 3.3 V converter U103: the input loop (VIN - C106/C107 - ground), the switch node to the inductor,
    the output into the 3.3 V plane and the feedback divider. Ground goes into the plane right below
    through vias at the capacitors and under the converter, so the loops close through it."""
    p = B.pad
    vin, gnd, sw, en, fb = (p('U103', n) for n in '42315')
    c106, c106g, c107, c107g = p('C106', '1'), p('C106', '2'), p('C107', '1'), p('C107', '2')
    B.track([c106, vin], '+5V', 0.6)
    B.track(dog(p('C105', '1'), c106), '+5V', 0.6)
    B.track([c107, vin], '+5V', 0.4)
    B.track([c107g, (c107g[0], c107g[1] - 0.75)], 'GND', 0.4)
    B.via(c107g[0], c107g[1] - 0.75, 'GND')
    for dy in (-0.35, 0.35):
        B.track([c106g, (c106g[0] - 1.0, c106g[1] + dy)], 'GND', 0.4)
        B.via(c106g[0] - 1.0, c106g[1] + dy, 'GND')
    cx = (vin[0] + gnd[0]) / 2                           # under the converter, between its pad rows
    B.track([gnd, (cx, gnd[1])], 'GND', 0.4)
    B.via(cx, gnd[1], 'GND', size=0.6, drill=0.3)
    l1, l2 = p('L101', '1'), p('L101', '2')
    B.track([sw, (l1[0], sw[1])], 'BUCK_SW', 0.6)
    c109, c109g = p('C109', '1'), p('C109', '2')
    B.track(dog(l2, c109), '+3V3', 0.8)
    for dx in (-0.6, 0.6):
        B.via(c109[0] + dx, c109[1] + 0.95, '+3V3')
        B.track([c109, (c109[0] + dx, c109[1] + 0.95)], '+3V3', 0.4)
    B.track([c109g, (c109g[0], c109g[1] - 0.8)], 'GND', 0.4)
    B.via(c109g[0], c109g[1] - 0.8, 'GND')
    r112a, r112g, r111a, r111b, c108a, c108b = (p(r, n) for r, n in (('R112', '1'), ('R112', '2'), ('R111', '1'),
                                                                     ('R111', '2'), ('C108', '1'), ('C108', '2')))
    B.track([fb, r112a], 'BUCK_FB', 0.2)
    B.track([r112a, r111b], 'BUCK_FB', 0.2)
    B.track([r111b, c108b], 'BUCK_FB', 0.2)
    B.track([r112g, (r112g[0], r112g[1] + 0.7)], 'GND', 0.3)
    B.via(r112g[0], r112g[1] + 0.7, 'GND')
    # the divider senses the 3.3 V plane right here
    B.track([r111a, c108a], '+3V3', 0.25)
    xs = r111a[0] - 0.8
    B.track([((r111a[0] + c108a[0]) / 2, (r111a[1] + c108a[1]) / 2), (xs, (r111a[1] + c108a[1]) / 2)], '+3V3', 0.25)
    B.via(xs, (r111a[1] + c108a[1]) / 2, '+3V3')
    r106e = p('R106', '2')
    B.track([r106e, (en[0] + 0.45, r106e[1]), en], 'BUCK_EN', 0.2)


def plane_fanout(B):
    """Give every supply pad of the small parts its own via into the ground / 3.3 V plane.

    Returns the pads for which no free spot was found (the autorouter has to deal with those).
    """
    VIA_R, HOLE_R, CLR, W = 0.225, 0.1, 0.14, 0.25
    gnd, p3v3 = B.names.get('GND', 'GND'), B.names.get('+3V3', '+3V3')

    def has_plane(net, x, y):
        if net == gnd:
            return True
        return net == p3v3 and y < G.PLANE_3V3_Y - 1.0
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
    holes = [G.SLOT] + G.led_cutouts(0.2)
    ax, ay = G.ANT_C
    keep = holes + [G.WIFI_KEEPOUT, (ax - G.ANT_W / 2 - 1, ay - G.ANT_H / 2 - 1, ax + G.ANT_W / 2 + 1, ay + G.ANT_H / 2 + 1)]
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
        for pnet, x1, y1, x2, y2, pref, _ in pads:
            dx = max(x1 - x, 0, x - x2)
            dy = max(y1 - y, 0, y - y2)
            d = math.hypot(dx, dy)
            if pnet != net and d < VIA_R + CLR:
                return False
            # Its hole not in or at a pad of its own net: the solder would run into it. (A test point has
            # no solder paste; a via in its pad does no harm.)
            if pnet == net and d < HOLE_R + 0.1 and not pref.startswith('TP'):
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
    ics = ('U101', 'U103', 'U104', 'U202', 'U203', 'U302', 'U601', 'U602', 'U701', 'J101', 'J601')
    failed, made, served = [], 0, set()
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
        # a pad with a via of its own in it (filled and capped) needs no other
        if any(vnet == net and x1 <= vx <= x2 and y1 <= vy <= y2 for (vx, vy), vnet in vias):
            continue
        done = False
        # an existing via of the same net close by is good enough
        for (vx, vy), vnet in vias:
            if vnet == net and math.hypot(vx - px, vy - py) < max(hw, hh) + 0.9:
                B.track([(px, py), (vx, vy)], net, W)
                done = True
                break
        if not done:
            # (the last step is for capacitors that stand in a row 1.1 mm apart: the via fits exactly
            # between two pads of the same net)
            for dist_extra in (0.12, 0.3, 0.55, 0.02):
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
            # No room for a via of its own: share the one of a pad of the same net right beside it (two
            # capacitors side by side), if the short track between the two pads is clear.
            for qnet, qx1, qy1, qx2, qy2, qref, qpad in pads:
                qx, qy = (qx1 + qx2) / 2, (qy1 + qy2) / 2
                if qnet != net or qpad is pad or (qref, qpad.GetNumber()) not in served or math.hypot(qx - px, qy - py) > 1.3:
                    continue
                clear = all(snet == net or min(seg_dist(px + (qx - px) * k / 8, py + (qy - py) * k / 8, a, c) for k in range(9)) > W / 2 + w / 2 + 0.14
                            for a, c, w, snet in segs)
                clear = clear and all(onet == net or math.hypot(max(ox1 - (px + qx) / 2, 0, (px + qx) / 2 - ox2),
                                                               max(oy1 - (py + qy) / 2, 0, (py + qy) / 2 - oy2)) > W / 2 + CLR
                                      for onet, ox1, oy1, ox2, oy2, _r, _p in pads)
                if clear:
                    B.track([(px, py), (qx, qy)], net, W)
                    done = True
                    break
        if done:
            served.add((ref, pad.GetNumber()))
        else:
            failed.append('%s.%s' % (ref, pad.GetNumber()))
    print('plane fan-out: %d vias, %d pads left to the router%s' % (
        made, len(failed), (': ' + ' '.join(failed[:40])) if failed else ''))
    return failed
