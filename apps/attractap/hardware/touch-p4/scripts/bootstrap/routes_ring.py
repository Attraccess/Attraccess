"""Fixed routes round the NFC loop: the antenna feeds from the PN532 block and the LED ring (data line, 5 V
supply and its rail on In2)."""

import math

import geometry as G
from board import B_, IN2, dog
from placement import LED_VIA, LED_VIA_OUT, led_frame, led_gap_index, led_refs


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
            B.track(dog(p3, c1), '+5V_LED', 0.4)
        else:                                       # along the pad's outer edge, clear of the capacitor's ground
            B.track([p3, f(2.775, -1.08), c1], '+5V_LED', 0.3)
        B.track([c1, via], '+5V_LED', 0.4)
        B.via(*via, '+5V_LED', size=0.8, drill=0.4)
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
        B.track([a, b], '+5V_LED', 0.6, layer=IN2)
