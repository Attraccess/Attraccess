"""Schematic layout: the power input sheet.

Each input is one row read from left to right: connector, protection, filter, converter, OR-ing
diode, +5V. Parts to ground hang below their row; the 5 V rail and the 3.3 V converter follow on
the right."""
from sch_draw import P


def usb(cv, P_, x0, y0):
    """USB-C: connector, fuse, TVS and ESD protection, ferrite, bleed resistor, OR-ing diode."""
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
    dd = cv.diode(P_['D102'], x + 60.96, ya)
    cv.wire('F101.2', 'FB101.1')
    cv.wire('FB101.2', 'D102.2')
    k = dd.pin('1')
    cv.wire(k, (k[0] + P, ya))
    cv.power('+5V', k[0] + P, ya)
    # configuration channel: 5.1 k to ground marks a sink; the lower pin gets the nearer resistor
    cc2, cc1 = cv.at('J101.B5'), cv.at('J101.A5')
    cv.hang(P_['R102'], cc2[0] + 5.08, cc2[1], gap=0)
    cv.wire('J101.B5', 'R102.1')
    cv.hang(P_['R101'], cc1[0] + 15.24, cc1[1], gap=0)
    cv.wire('J101.A5', 'R101.1')
    return f, d, fb, c, r


def dc_input(cv, P_, x0, y0):
    """DC 12 to 24 V: jack and terminal, fuse, reverse-polarity diode, pi filter, TVS, 5 V converter."""
    cv.begin('DC input 12 to 24 V')
    yb = y0
    cv.put(P_['J102'], x0 + 7.62, yb + P, fields='l')
    cv.put(P_['J103'], x0 + 10.16, yb + 15.24, mirror=True, fields='l')
    xj = cv.at('J102.1')[0]
    cv.wire('J103.1', (xj + 7.62, cv.at('J103.1')[1]), (xj + 7.62, yb))
    cv.inline(P_['F102'], xj + 15.24, yb)
    cv.diode(P_['D105'], xj + 35.56, yb)
    cv.hang(P_['C117'], xj + 43.18, yb)
    cv.inline(P_['L103'], xj + 63.5, yb)
    cv.tvs(P_['D106'], xj + 73.66, yb)
    cv.hang(P_['C112'], xj + 88.9, yb)
    cv.hang(P_['C113'], xj + 106.68, yb)
    converter(cv, P_, 'U104', 'R103', 'C114', 'L102', ['C115', 'C116', 'R105'], 'D107', xj + 149.86, yb)
    cv.wire('J102.1', 'F102.1')
    cv.wire('F102.2', 'D105.2')
    cv.wire('D105.1', 'L103.1')
    cv.wire('L103.2', 'U104.3')


def converter(cv, P_, ic, ren, cbst, ind, outs, diode, ux, yin, out_net=None):
    """A buck converter of the AP6320x family on the row yin: EN pull-up from VIN, bootstrap capacitor
    above the switch node, inductor, feedback from the output, output parts, and (optionally) the
    OR-ing diode to +5V."""
    u = cv.put(P_[ic], ux, yin + P)
    vin, en = u.pin('3'), u.pin('2')
    r = cv.inline(P_[ren], en[0] - 13.97, en[1], fields='b')
    cv.wire(r.pin('2'), en)
    cv.wire(r.pin('1'), (r.pin('1')[0], yin))
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
    end = (x, sw[1])
    if diode:
        dd = cv.diode(P_[diode], x + 3.81, sw[1])
        k = dd.pin('1')
        cv.wire(k, (k[0] + P, k[1]))
        cv.power('+5V', k[0] + P, k[1])
        end = dd.pin('2')
    elif out_net:
        cv.power(out_net, x, sw[1])
    cv.wire(cv.at(ind + '.2'), end)
    return u


def poe(cv, P_, x0, y0):
    """PoE: ferrites and TVS on the 48 V side, the isolated module, output capacitors, OR-ing diode."""
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
    dd = cv.diode(P_['D104'], xo + 48.26, yp)
    cv.wire('U102.1', 'D104.2')
    k = dd.pin('1')
    cv.wire(k, (k[0] + P, yp))
    cv.power('+5V', k[0] + P, yp)
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
    u = converter(cv, P_, 'U103', 'R106', 'C108', 'L101', ['C109', 'C110', 'C111'], None, x0 + 96.52, y,
                  out_net='+3V3')
    cv.wire((x0, y), u.pin('3'))
    x3 = cv.at('L101.2')[0]
    cv.put(P_['TP802'], x3 + 5.08, y + P, fields='tp')
    cv.put(P_['TP804'], x0 + 7.62, y + 30.48)
    cv.put(P_['TP805'], x0 + 20.32, y + 30.48)


def power(cv, P_, top):
    usb(cv, P_, 25.4, top + 22.86)
    dc_input(cv, P_, 25.4, top + 96.52)
    poe(cv, P_, 38.1, top + 152.4)
    rail(cv, P_, 187.96, top + 22.86)
