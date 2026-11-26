"""Fixed routes of the Wi-Fi module's own 3.3 V converter U302 (placement.py puts it in the column left of the
module). Split from routes_board.py, which keeps the module's ground vias (module_ground)."""

from board import dog


def wifi_buck_routes(B):
    """The Wi-Fi module's own converter U302, as U103: the input loop (VIN - C305/C304 - ground), the switch
    node into the inductor, the output through C301 (22 uF) into the module's 3V3 pin, the feedback divider,
    EN. Turned 90 degrees, the converter has SW, GND and EN facing the inductor and VIN and FB facing the
    input capacitors and the divider. Ground into the plane right below, through vias at the capacitors and
    one under the converter between its pad rows, so the loops close through it."""
    p = B.pad
    vin, gnd, sw, en, fb = (p('U302', n) for n in '42315')
    c305, c305g, c304, c304g = p('C305', '1'), p('C305', '2'), p('C304', '1'), p('C304', '2')
    B.track([c305, vin], '+5V', 0.4)
    B.track(dog(c304, vin), '+5V', 0.6)
    B.track([c305g, (c305g[0], c305g[1] + 0.7)], 'GND', 0.4)
    B.via(c305g[0], c305g[1] + 0.7, 'GND')
    for dy in (-0.35, 0.35):
        B.track([c304g, (c304g[0] - 1.0, c304g[1] + dy)], 'GND', 0.4)
        B.via(c304g[0] - 1.0, c304g[1] + dy, 'GND')
    cy = (gnd[1] + vin[1]) / 2                           # under the converter, between its pad rows
    B.track([gnd, (gnd[0], cy)], 'GND', 0.4)
    B.via(gnd[0], cy, 'GND', size=0.6, drill=0.3)
    l1, l2 = p('L301', '1'), p('L301', '2')
    B.track([sw, (sw[0], l1[1])], 'WIFI_BUCK_SW', 0.6)     # straight up into the inductor's switch pad
    # output: inductor - C301 (+) - the module's 3V3 pin; C301's ground pad to the module's ground pins 1, 2
    c301, c301g, c302, c302g = p('C301', '1'), p('C301', '2'), p('C302', '1'), p('C302', '2')
    v3, g1, g2 = p('U301', '3'), p('U301', '1'), p('U301', '2')
    B.track(dog(l2, c301, first='d'), '+3V3_WIFI', 0.8)
    B.track(dog(c301, v3), '+3V3_WIFI', 0.5)
    B.track([c301, c302], '+3V3_WIFI', 0.4)
    B.track(dog(c301g, g1), 'GND', 0.4)
    B.track([g1, g2], 'GND', 0.4)
    B.track([c301g, (c301g[0], c301g[1] - 0.75)], 'GND', 0.4)
    B.via(c301g[0], c301g[1] - 0.75, 'GND')
    B.track([c302g, (c302g[0], c302g[1] + 0.65)], 'GND', 0.3)
    B.via(c302g[0], c302g[1] + 0.65, 'GND')
    # feedback divider below FB; it senses the rail at C302, along the module's edge
    r312a, r312g, r311a, r311b, c306a, c306b = (p(r, n) for r, n in (('R312', '1'), ('R312', '2'), ('R311', '1'),
                                                                     ('R311', '2'), ('C306', '1'), ('C306', '2')))
    B.track([fb, r312a], 'WIFI_BUCK_FB', 0.2)
    B.track(dog(fb, r311b), 'WIFI_BUCK_FB', 0.2)
    B.track([r311b, c306b], 'WIFI_BUCK_FB', 0.2)
    B.track([r312g, (r312g[0], r312g[1] + 0.7)], 'GND', 0.3)
    B.via(r312g[0], r312g[1] + 0.7, 'GND')
    xs = c302[0] + 0.75
    B.track([c306a, (xs, c306a[1]), (xs, c302[1]), c302], '+3V3_WIFI', 0.25)
    B.track([r311a, (xs, r311a[1])], '+3V3_WIFI', 0.25)
    r310e = p('R310', '2')
    B.track([r310e, en], 'WIFI_BUCK_EN', 0.2)
