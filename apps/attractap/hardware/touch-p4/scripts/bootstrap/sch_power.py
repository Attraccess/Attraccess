"""Schematic layout: the power input sheet.

Each input is one row read from left to right: connector, protection, filter, converter, blocking
switch (eFuse or ideal diode), +5V. Parts to ground hang below their row; the 5 V rail and the 3.3 V converter follow on
the right."""
from sch_draw import P, Unit


def usb(cv, P_, x0, y0):
    """USB-C: connector, fuse, TVS and ESD protection, ferrite, bleed resistor, eFuse to +5V."""
    cv.begin('USB-C input (service port)')
    ya = y0                                         # VBUS row
    j = cv.put_at(P_['J101'], 'A4B9', x0 + 24.13, ya)
    xp = j.pin('A4B9')[0]
    f = cv.inline(P_['F101'], xp + 11.43, ya)
    cv.wire('J101.A4B9', 'F101.1')
    cv.wire('J101.B4A9', (xp + P, ya + P), (xp + P, ya))
    u = cv.put(P_['U101'], xp + 26.67, ya + 12.7, fields={'Reference': (7.62, -10.92), 'Value': (7.62, -9.22)})
    for a, b in (('A6', 'B6'), ('A7', 'B7')):       # each pair of the connector joins, then the ESD part
        cv.wire('J101.' + b, (xp + P, cv.at('J101.' + b)[1]), (xp + P, cv.at('J101.' + a)[1]))
    cv.wire('J101.A6', 'U101.3')
    cv.wire('J101.A7', 'U101.1')
    x = u.pin('4')[0] + 17.78
    d = cv.tvs(P_['D101'], x, ya)
    fb = cv.inline(P_['FB101'], x + 17.78, ya)
    c = cv.hang(P_['C101'], x + 27.94, ya)
    r = cv.hang(P_['R104'], x + 44.45, ya)
    efuse(cv, P_, x + 81.28, ya)
    cv.tag('+5V_USB', x + 60.96, ya)
    cv.wire('F101.2', 'FB101.1')
    cv.wire('FB101.2', 'U105.5')
    # configuration channel: 5.1 k to ground marks a sink; the lower pin gets the nearer resistor
    cc2, cc1 = cv.at('J101.B5'), cv.at('J101.A5')
    cv.hang(P_['R102'], cc2[0] + 5.08, cc2[1], gap=0)
    cv.wire('J101.B5', 'R102.1')
    cv.hang(P_['R101'], cc1[0] + 15.24, cc1[1], gap=0)
    cv.wire('J101.A5', 'R101.1')
    return f, d, fb, c, r


def efuse(cv, P_, x, y):
    """The USB eFuse in the row: IN left, OUT right to +5V; the UVLO/OVLO divider hangs on the left,
    slew-rate capacitor and current-limit resistor below."""
    u = cv.put_at(P_['U105'], '5', x, y)
    xr = x - 15.24
    # its text sits higher than usual on the right: the EN/UVLO label runs right below it
    w = lambda s: len(s) * 1.27 / 2 + 1.8
    cv.hang(P_['R107'], xr, y, fields={'Reference': (w('R107'), -3.4), 'Value': (w('330k'), -1.7),
                                       'Rating': (w('0.1% 25ppm'), 0.0)})
    en, ov = u.pin('1'), u.pin('2')
    cv.hang(P_['R108'], xr, en[1], gap=0, fields='l')
    cv.hang(P_['R109'], xr, ov[1], gap=0, fields='l')
    cv.wire((xr, en[1]), en)
    cv.wire((xr, ov[1]), ov)
    for pin, ref in (('7', 'C118'), ('9', 'R110')):
        px, py = u.pin(pin)
        cv.hang(P_[ref], px, py, gap=12.7, fields='l' if ref == 'C118' else 'r')
    out = u.pin('6')
    cv.wire(out, (out[0] + 5.08, y))
    cv.power('+5V', out[0] + 5.08, y)
    return u


def fet_inline(cv, part, xs, y):
    """An N-channel MOSFET lying in a horizontal wire: source (pin 2) at xs on the left, drain (3) on the
    right, gate (1) pointing down."""
    sym = cv.use(part.sym)
    for angle in (0, 90, 180, 270):
        for mirror in (False, True):
            u = Unit(part, 1, 0, 0, angle, sym, mirror)
            (gx, gy), (sx, sy), (dx, dy) = u.pin('1'), u.pin('2'), u.pin('3')
            if sy == dy and sx < dx and gy > sy:
                return cv.put_at(part, '2', xs, y, angle, mirror=mirror, fields='a')
    raise SystemExit('no orientation puts the MOSFET into the wire')


def ideal_diode(cv, P_, ic, fet, cap, x, y):
    """LM74700-Q1 and its MOSFET in the row from x to +5V: the MOSFET in the wire, the controller below
    with its gate pin straight under the MOSFET's gate, the charge pump capacitor from the row (anode)
    down to VCAP. Returns the x where the row ends."""
    cv.tag(P_[ic].nets['6'], x + 5.08, y)
    q = fet_inline(cv, P_[fet], x + 25.4, y)
    gx, gy = q.pin('1')
    probe = Unit(P_[ic], 1, 0, 0, 0, cv.use(P_[ic].sym))
    vcx = gx + probe.pin('1')[0] - probe.pin('5')[0]
    top_pin = y + 20.32
    u = cv.put_at(P_[ic], '5', gx, top_pin, fields='r')
    cv.wire((gx, gy), u.pin('5'))
    c = cv.hang(P_[cap], vcx, y, gap=top_pin - y - 7.62 - 10.16, fields='l')
    cv.wire(c.pin('2'), u.pin('1'))
    an, en, ka = u.pin('6'), u.pin('3'), u.pin('4')
    xa = an[0] - P
    cv.wire((xa, y), (xa, en[1]), en)
    cv.wire((xa, an[1]), an)
    cv.wire((x, y), q.pin('2'))
    xd = q.pin('3')[0]
    xk = max(ka[0] + P, xd + P)
    cv.wire(ka, (xk, ka[1]), (xk, y))
    cv.wire(q.pin('3'), (xk + 5.08, y))
    cv.power('+5V', xk + 5.08, y)
    return xk + 5.08


def dc_input(cv, P_, x0, y0):
    """DC 12 to 24 V: jack and terminal, fuse, reverse-polarity diode, pi filter, TVS, 5 V converter."""
    cv.begin('DC input 12 to 24 V')
    yb = y0
    cv.put(P_['J102'], x0 + 7.62, yb + P, fields='l')
    cv.put(P_['J103'], x0 + 10.16, yb + 15.24, mirror=True, fields='l')
    xj = cv.at('J102.1')[0]
    cv.wire('J103.1', (xj + 7.62, cv.at('J103.1')[1]), (xj + 7.62, yb))
    cv.inline(P_['F102'], xj + 15.24, yb)
    cv.tvs(P_['D107'], xj + 27.94, yb)
    cv.diode(P_['D105'], xj + 35.56, yb)
    cv.hang(P_['C117'], xj + 43.18, yb)
    cv.hang(P_['C120'], xj + 60.96, yb)
    cv.inline(P_['L103'], xj + 73.66, yb)
    cv.tvs(P_['D106'], xj + 83.82, yb)
    cv.hang(P_['C112'], xj + 99.06, yb)
    cv.hang(P_['C113'], xj + 116.84, yb)
    cv.tag('VDC', xj + 132.08, yb)
    converter(cv, P_, 'U104', 'R103', 'C114', 'L102', ['C115', 'C116', 'R105'], ('U107', 'Q102', 'C121'),
              xj + 160.02, yb, ren_low='R113')
    cv.wire('J102.1', 'F102.1')
    cv.wire('F102.2', 'D105.2')
    cv.wire('D105.1', 'L103.1')
    cv.wire('L103.2', 'U104.3')


def converter(cv, P_, ic, ren, cbst, ind, outs, ideal, ux, yin, ren_low=None):
    """A buck converter of the AP6320x family on the row yin: EN divider from VIN, bootstrap capacitor
    above the switch node, inductor, feedback from the output, output parts, and the ideal diode to
    +5V."""
    u = cv.put(P_[ic], ux, yin + P)
    vin, en = u.pin('3'), u.pin('2')
    r = cv.inline(P_[ren], en[0] - 13.97, en[1], fields='b')
    cv.wire(r.pin('2'), en)
    cv.wire(r.pin('1'), (r.pin('1')[0], yin))
    if ren_low:
        cv.hang(P_[ren_low], en[0] - 5.08, en[1], gap=10.16, fields='l')
    bst, sw, fb = u.pin('6'), u.pin('5'), u.pin('1')
    c = cv.put(P_[cbst], bst[0] + 15.24, sw[1] - 3.81)
    cv.wire(bst, (bst[0] + P, bst[1]), (bst[0] + P, c.pin('1')[1]), c.pin('1'))
    lx = bst[0] + 38.1
    cv.inline(P_[ind], lx, sw[1])
    cv.wire(sw, cv.at(ind + '.1'))
    xo = lx + 3.81 + P
    cv.wire(fb, (xo, fb[1]), (xo, sw[1]))
    x = xo + 7.62
    for ref in outs:
        cv.hang(P_[ref], x, sw[1])
        x += 16.51
    cv.wire(cv.at(ind + '.2'), (x, sw[1]))
    ideal_diode(cv, P_, *ideal, x, sw[1])
    return u


def poe(cv, P_, x0, y0):
    """PoE: ferrites and TVS on the 48 V side, the isolated module, output capacitors, ideal diode."""
    cv.begin('PoE input (LAN version)')
    yp, yn = y0, y0 + 7.62
    for net, y, fb in (('POE_VP', yp, 'FB102'), ('POE_VN', yn, 'FB103')):
        cv.label(net, x0, y, 'L')
        cv.inline(P_[fb], x0 + 7.62, y, fields='a' if fb == 'FB102' else 'b')
        cv.wire((x0, y), fb + '.1')
    cv.tvs(P_['D103'], x0 + 20.32, yp, gap=0)
    cv.hang(P_['C102'], x0 + 33.02, yn)
    u = cv.put(P_['U102'], x0 + 63.5, yp + 5.08)
    xb = u.pin('5')[0] - P
    cv.wire('FB102.2', 'U102.5')
    cv.wire('FB103.2', 'U102.8')
    cv.wire('U102.6', (xb, cv.at('U102.6')[1]), (xb, yp))
    cv.wire('U102.7', (xb, cv.at('U102.7')[1]), (xb, yn))
    xo = u.pin('1')[0] + P
    cv.wire('U102.2', (xo, cv.at('U102.2')[1]), (xo, yp))
    cv.hang(P_['C103'], xo + 10.16, yp)
    cv.hang(P_['C104'], xo + 30.48, yp)
    cv.wire('U102.1', (xo + 45.72, yp))
    ideal_diode(cv, P_, 'U106', 'Q101', 'C119', xo + 45.72, yp)
    cv.text('48 V side (primary)', x0 + 3.81, yp - 7.62, 1.27)
    cv.text('isolated 5 V side', u.pin('1')[0] + 1.27, yp - 7.62, 1.27)


def rail(cv, P_, x0, y0):
    """The 5 V rail with its capacitors and the 3.3 V converter."""
    cv.begin('5 V rail and 3.3 V converter')
    y = y0
    cv.power('+5V', x0, y)
    cv.put(P_['TP801'], x0 + 7.62, y, fields='tp')
    cv.hang(P_['C105'], x0 + 15.24, y)
    cv.hang(P_['C106'], x0 + 31.75, y)
    cv.hang(P_['C107'], x0 + 50.8, y)
    u = cv.put(P_['U103'], x0 + 96.52, y + P)
    vin, en, sw, fb = u.pin('4'), u.pin('1'), u.pin('3'), u.pin('5')
    cv.wire((x0, y), vin)
    r = cv.inline(P_['R106'], en[0] - 13.97, en[1], fields='b')
    cv.wire(r.pin('2'), en)
    cv.wire(r.pin('1'), (r.pin('1')[0], y))
    cv.inline(P_['L101'], sw[0] + 20.32, sw[1])
    cv.wire(sw, 'L101.1')
    xd = sw[0] + 33.02                              # divider: +3V3 - R111 - FB - R112 - GND, C108 over R111
    cv.hang(P_['R111'], xd, sw[1])
    cv.hang(P_['C108'], xd + 17.78, sw[1])
    yfb = cv.at('R111.2')[1]
    cv.wire('R111.2', 'C108.2')
    cv.hang(P_['R112'], xd, yfb)
    cv.wire(fb, (fb[0] + P, fb[1]), (fb[0] + P, yfb), (xd, yfb))
    xo = xd + 33.02
    for c in ('C109', 'C111'):
        cv.hang(P_[c], xo, sw[1])
        xo += 16.51
    cv.wire('L101.2', (xo + 10.16, sw[1]))
    cv.power('+3V3', xo + 10.16, sw[1])
    cv.put(P_['TP802'], xo - 5.08, sw[1], fields='tp')


def power(cv, P_, top):
    usb(cv, P_, 25.4, top + 22.86)
    rail(cv, P_, 25.4, top + 96.52)
    dc_input(cv, P_, 38.1, top + 167.64)
    poe(cv, P_, 38.1, top + 248.92)
    cv.begin('Ground test points')
    cv.put(P_['TP804'], 284.48, top + 106.68)
    cv.put(P_['TP805'], 297.18, top + 106.68)
