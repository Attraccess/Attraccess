"""The SDIO bus between the MCU (slot 0, GPIO39 to 44) and the Wi-Fi module, laid out by hand and locked.

What Espressif asks (ESP32-C5 hardware design guidelines, 1.4.9): command and data lines within 50 mil
(1.27 mm) of the clock line's length ("use serpentine routing if necessary"), 2000 mil (50.8 mm) at most,
50 ohm, no change of layer, an unbroken reference plane below, ground copper round the clock.

The front layer between the two has no room for six lines: the core converter, the 5 V feed and the core
supply lie across the way. So the lines run on the back layer, over the ground plane In4, from a via beside
the MCU to a via below the module: one change of layer at each end, two vias in every line. The return current
changes plane there too (In1 to In4), through the nearest ground via. Below the module the vias stand too close
together for post_route.py to find room, so the ground vias there are placed here, each between two lines and
within 1.45 mm of the vias it serves; beside the MCU the plane fan-out's ground vias serve the data lines
(within 1.7 mm), and one placed here serves the command and clock lines (1.5 and 1.6 mm).

The order of the lines differs at the two ends. Beside the MCU the vias stand in a staircase (routes_mcu.
left_escape) that gives, from west to east, CLK, CMD, D3, D2, D1, D0 on the back layer; the module has D1, D0,
CLK, CMD, D3, D2 along its edge. So D0 and D1 leave the module on the front layer, pass below the other
vias and change layer east of them. The pull-ups sit at the ends of the front-layer stubs (placement.py).

In a zone of the straight run every line is made as long as the longest: a line that lacks much gets bumps,
one that lacks little moves east just far enough (MATCH); the amounts are worked out here from the drawn
geometry. The clock runs on the west edge of the bus, 1.2 mm from its neighbour: ground fill on both sides,
stitched by post_route.py. Lengths are counted from pad centre to pad centre, the clock with the
track from the MCU to its 22 ohm resistor and without the resistor itself.
"""

import math

from board import B_, F, dog
from routes_mcu import left_escape

W = 0.15                    # track width: 49 ohm on the outer layers over their plane (sim/field2d.py)
PERIOD = 1.2                # one bump: out, 0.6 mm along, back, 0.6 mm to the next one (3 widths apart)
LINES = ('CLK', 'CMD', 'D3', 'D2', 'D1', 'D0')          # west to east on the back layer
MODULE_PIN = {'D1': 19, 'D0': 20, 'CLK': 21, 'CMD': 22, 'D3': 23, 'D2': 24}
PULL_UP = {'CMD': 'R305', 'D0': 'R306', 'D1': 'R307', 'D2': 'R308', 'D3': 'R309'}
# in the straight run: x of each lane against the clock pin of the module. In the matching zone a line either
# gets bumps (on a lane moved east by the given amount, to the given side: -1 west, +1 east), or, where it
# lacks little, moves east just as far as makes up the difference: two 45 degree runs there and back add
# 2 (sqrt 2 - 1) of the distance moved.
LANE = {'CLK': -0.7, 'CMD': 0.5, 'D3': 1.0, 'D2': 1.5, 'D1': 2.0, 'D0': 2.5}
MATCH = {'CLK': ('bumps', 0.0, -1), 'CMD': ('bumps', 0.0, -1), 'D3': ('bumps', 0.0, 1), 'D2': ('bumps', 0.25, 1),
         'D1': ('move',), 'D0': ('move',)}
H_MIN = 0.15                # lower bumps are made fewer and higher
GAP = 0.2                   # between neighbouring lines in the zone, bumps included
GAP_CLK = 0.6               # beside the clock: room for the ground fill (0.2 clearance, 0.2 wide, 0.2 clearance)
# the matching zone, below the module's pad row
ZONE = (7.5, 14.5)
# where each line leaves its via below the module downwards and turns 45 degrees into its lane
FAN = {'CLK': 5.3, 'CMD': 5.1, 'D3': 5.0, 'D2': 5.5, 'D1': 5.7, 'D0': 5.8}
# height of the 45 degree run into each via beside the MCU (0: straight in from the west)
INTO = {'D0': 1.545, 'D1': 1.0, 'D2': 0.395, 'D3': 0.0, 'CMD': 0.855, 'CLK': 0.0}
# D0 leaves its pad, then steps this far west (just below the pad), to make room for the ground via west of the
# clock's via
D0_STEP = 0.3


def length(pts):
    return sum(math.hypot(c[0] - a[0], c[1] - a[1]) for a, c in zip(pts, pts[1:]))


def room(ya, yb):
    """How many bumps fit on a vertical run from ya to yb."""
    return max(int((yb - ya - 0.6) / PERIOD), 0)


def bumps(x, ya, yb, side, h, n):
    """Points of a vertical run from (x, ya) down to (x, yb) with n bumps of height h, centred on the run."""
    if n <= 0 or h <= 0:
        return [(x, ya), (x, yb)]
    y = ya + (yb - ya - n * PERIOD + 0.6) / 2
    pts = [(x, ya)]
    for _ in range(n):
        pts += [(x, y), (x + side * h, y), (x + side * h, y + 0.6), (x, y + 0.6)]
        y += PERIOD
    return pts + [(x, yb)]


def plan(B):
    """Every track and via of the bus: ({net: [(layer, points)]}, [(net, x, y)], {line: length of the path from
    pad to pad, without the stub to its pull-up}, [(x, y) of a ground via])."""
    net = lambda n: 'SDIO_' + n
    pad = {n: B.pad('U301', k) for n, k in MODULE_PIN.items()}
    yp = pad['CLK'][1]
    pull = {n: B.pad(r, '2') for n, r in PULL_UP.items()}
    col = pull['D0'][0]
    tracks = {n: [] for n in LINES}             # the path from pad to pad, measured
    taps = {n: [] for n in LINES}               # stubs to the pull-ups, not part of the path
    vias = []
    # ---- below the module: front-layer stubs to the vias, and on to the pull-ups
    top = {n: (pad[n][0], pull[n][1]) for n in ('D2', 'D3', 'CMD')}
    top['CLK'] = (pad['CLK'][0], yp + 2.8)
    top['D0'] = (col - 0.75, pull['D0'][1])
    top['D1'] = (col - 1.45, pull['D1'][1] - 0.2)
    for n in ('D2', 'D3', 'CMD'):
        tracks[n].append((F, [pad[n], top[n]]))
        taps[n].append((F, [top[n], pull[n]]))
    tracks['CLK'].append((F, [pad['CLK'], top['CLK']]))
    x_d0 = pad['D0'][0] - D0_STEP
    step = [(pad['D0'][0], yp + 0.6), (x_d0, yp + 0.6 + D0_STEP)]
    tracks['D0'].append((F, [pad['D0']] + step + [(x_d0, pull['D0'][1]), top['D0']]))
    taps['D0'].append((F, [top['D0'], pull['D0']]))
    yd1 = pull['D0'][1] + 0.4
    tracks['D1'].append((F, [pad['D1'], (pad['D1'][0], yd1), (top['D1'][0] - (top['D1'][1] - yd1), yd1), top['D1']]))
    taps['D1'].append((F, dog(top['D1'], pull['D1'])))
    # ---- beside the MCU: the fan-out of routes_mcu (drawn there), and the clock through its resistor
    escape = left_escape(B)
    bottom = {n: escape[net(n)][-1] for n in ('D0', 'D1', 'D2', 'D3', 'CMD')}
    r1, r2 = B.pad('R304', '1'), B.pad('R304', '2')
    bottom['CLK'] = (r2[0], r2[1] + 0.92)
    clock_m = dog(B.pad('U201', 84), r1)
    tracks['CLK'].append((F, [r2, bottom['CLK']]))
    # ---- the back layer, without bumps first
    x0 = pad['CLK'][0]
    y0, y1 = yp + ZONE[0], yp + ZONE[1]

    def back(n, d=0.0, side=1, h=0.0, k=0):
        """The back-layer track of a line: down from its via, into its lane, through the zone (moved east by d,
        k bumps of height h to one side), along the lane and into its via beside the MCU."""
        x, v, t = x0 + LANE[n], bottom[n], top[n]
        pts = [t, (t[0], yp + FAN[n]), (x, yp + FAN[n] + abs(t[0] - x))]
        if d or h:
            pts += [(x, y0)] + bumps(x + d, y0 + d, y1 - d, side, h, k) + [(x, y1)]
        ty = v[1] - INTO[n]
        return pts + ([(x, ty), (v[0] - INTO[n], ty), v] if INTO[n] else [(x, ty), v])

    fixed = {n: sum(length(p) for _l, p in tracks[n]) for n in LINES}
    fixed['CLK'] += length(clock_m)
    for n in ('D0', 'D1', 'D2', 'D3', 'CMD'):
        fixed[n] += length(escape[net(n)])
    base = {n: fixed[n] + length(back(n)) for n in LINES}
    target = max(base.values())
    lengths, zone = {}, {}
    for n in LINES:
        short_by = target - base[n]
        if MATCH[n][0] == 'move':
            d, side, h, k = short_by / (2 * (math.sqrt(2) - 1)), 1, 0.0, 0
        else:
            _kind, d, side = MATCH[n]
            short_by -= 2 * d * (math.sqrt(2) - 1)
            k = min(room(y0 + d, y1 - d), max(1, int(short_by / (2 * H_MIN)))) if short_by > 1e-6 else 0
            h = short_by / (2 * k) if k else 0.0
            assert short_by > -1e-6 and (k or short_by < 1e-6), (n, short_by)
        zone[n] = (x0 + LANE[n] + d, side, h)
        pts = back(n, round(d, 4), side, round(h, 4), k)
        tracks[n].append((B_, pts))
        lengths[n] = fixed[n] + length(pts)
    # neighbours in the zone keep their distance, bumps included; the clock keeps room for ground fill. A line
    # moves east no further than the one east of it, so their 45 degree runs do not close in on each other.
    for a, c in zip(LINES, LINES[1:]):
        assert zone[a][0] - x0 - LANE[a] <= zone[c][0] - x0 - LANE[c] + 1e-6, (a, c)
        (xa, sa, ha), (xc, sc, hc) = zone[a], zone[c]
        gap = xc - xa - W - (ha if sa > 0 else 0) - (hc if sc < 0 else 0)
        assert gap >= (GAP_CLK if 'CLK' in (a, c) else GAP) - 1e-6, (a, c, round(gap, 3))
    for n in LINES:
        tracks[n] += taps[n]
    tracks['CLK_M'] = [(F, clock_m)]
    for n in LINES:
        vias += [(n, *top[n]), (n, *bottom[n])] if n == 'CLK' else [(n, *top[n])]
    # ground vias below the module: one west of the clock's via, below the clock pad and clear of the D0 stub
    # (clock 1.05 mm, command 1.3 mm), and three east of the vias, each between two stubs to the pull-ups,
    # halfway down (D2 0.7 mm, D3 1.45 mm, D0 1.0 mm, D1 1.3 mm). Beside the MCU, one below the command line's
    # via, clear of the clock's via and track (command 1.5 mm, clock 1.6 mm).
    ground = [(pad['CLK'][0] - 0.45, top['CMD'][1] + 0.25)]
    rows = [pull[n][1] for n in ('D2', 'D3', 'CMD', 'D0')]
    ground += [(top['D2'][0] + 0.5, (a + c) / 2) for a, c in zip(rows, rows[1:])]
    ground.append((bottom['CMD'][0] - 0.25, bottom['CMD'][1] + 1.45))
    return tracks, vias, lengths, ground


def sdio_bus(B):
    """Draw the bus. Returns {line: length in mm}."""
    tracks, vias, lengths, ground = plan(B)
    for n, parts in tracks.items():
        for layer, pts in parts:
            B.track(pts, 'SDIO_' + n, W, layer=layer)
    for n, x, y in vias:
        B.via(x, y, 'SDIO_' + n)
    for x, y in ground:
        B.via(x, y, 'GND')
    spread = max(lengths.values()) - min(lengths.values())
    assert spread < 0.05, lengths
    return lengths
