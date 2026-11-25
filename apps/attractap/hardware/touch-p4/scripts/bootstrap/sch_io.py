"""Schematic layout: the NFC, display, UI and mechanical sheets."""
from sch_draw import P


# ---- NFC ---------------------------------------------------------------------------------------------
def nfc(cv, P_, top):
    pn532(cv, P_, 66.04, top + 30.48)
    nfc_supplies(cv, P_, 139.7, top + 20.32)
    nfc_crystal(cv, P_, 139.7, top + 101.6)
    host(cv, P_, 254.0, top + 116.84)
    rf(cv, P_, 50.8, top + 182.88)


def pn532(cv, P_, x, y):
    cv.begin('PN532')
    cv.put(P_['U501'], x, y + 35.56, fields={'Reference': (-22.86, -38.4), 'Value': (-22.86, -36.7)})


def nfc_supplies(cv, P_, x, y):
    """VBAT from 5 V through a ferrite; the chip's own regulator (DVDD) feeds the analog and the
    transmitter supply, each through a ferrite with its capacitors."""
    cv.begin('Supplies')
    cv.power('+5V', x, y)
    cv.inline(P_['FB501'], x + 12.7, y)
    cv.hang(P_['C501'], x + 25.4, y)
    cv.hang(P_['C502'], x + 43.18, y)
    cv.wire((x, y), 'FB501.1')
    cv.wire('FB501.2', (x + 55.88, y))
    cv.label('NFC_VBAT', x + 55.88, y, 'R')
    for k, (fb, caps, net) in enumerate((('FB502', ['C505', 'C506'], 'NFC_AVDD'),
                                         ('FB503', ['C507', 'C508'], 'NFC_TVDD'))):
        yy = y + 22.86 + 22.86 * k
        cv.label('NFC_DVDD', x, yy, 'L')
        cx = x + 7.62
        if k == 0:
            for c in ('C503', 'C504'):
                cv.hang(P_[c], cx, yy)
                cx += 16.51
        cv.inline(P_[fb], cx + 3.81, yy)
        cv.wire((x, yy), fb + '.1')
        cx += 15.24
        for c in caps:
            cv.hang(P_[c], cx, yy)
            cx += 16.51
        cv.wire(fb + '.2', (cx, yy))
        cv.label(net, cx, yy, 'R')
    cv.rail('+3V3', [P_['C509']], x + 96.52, y, note=True)


def nfc_crystal(cv, P_, x, y):
    cv.begin('27.12 MHz crystal')
    yp, yn = y, y + 12.7
    xc = x + 12.7
    cv.put(P_['Y501'], xc, (yp + yn) / 2, 270, fields='r')
    cv.label('NFC_X1', x, yp, 'L')
    cv.label('NFC_X2', x, yn, 'L')
    cv.wire((x, yp), (xc, yp), 'Y501.1')
    cv.wire((x, yn), (xc, yn), 'Y501.3')
    cv.wire((xc, yp), (xc + 27.94, yp))
    cv.hang(P_['C510'], xc + 27.94, yp)
    cv.wire((xc, yn), (xc + 5.08, yn))
    cv.hang(P_['C511'], xc + 5.08, yn)


def host(cv, P_, x, y):
    """I2C pull-ups and the reset pull-down that holds the PN532 in power-down while the MCU is in reset."""
    cv.begin('Host interface')
    for k, (net, r) in enumerate((('NFC_SCL', 'R501'), ('NFC_SDA', 'R502'))):
        yy = y + P * k
        xr = x + 7.62 + 10.16 * k
        cv.label(net, x, yy, 'L')
        cv.wire((x, yy), (xr, yy))
        cv.stand(P_[r], xr, yy, fields='r')
    yr = y + 15.24
    cv.label('NFC_RST', x, yr, 'L')
    cv.wire((x, yr), (x + 7.62, yr))
    cv.hang(P_['R503'], x + 7.62, yr, gap=0)


def rf(cv, P_, x, y):
    """TX - L0 - C0 - C1 - C2 - Rq - loop, once for each transmitter output; the receiver taps the second
    filter node through a divider. The upper lane is TX2: it ends at the loop's upper pin."""
    cv.begin('Transmit path: EMC filter, matching and antenna')
    ya, yb = y, y + 27.94
    lanes = (('NFC_TX2', ya, 'L502', 'C516', 'C517', ('C518', 'C519'), 'R505'),
             ('NFC_TX1', yb, 'L501', 'C512', 'C513', ('C514', 'C515'), 'R504'))
    xant = x + 165.1
    yant = ya + 12.7
    for net, yy, l0, c0, c1, c2, rq in lanes:
        cv.label(net, x, yy, 'L')
        cv.inline(P_[l0], x + 7.62, yy, fields='a' if yy == ya else 'b')
        cv.hang(P_[c0], x + 20.32, yy, note=True)
        cv.inline(P_[c1], x + 55.88, yy, fields='a' if yy == ya else 'b')
        cv.hang(P_[c2[0]], x + 71.12, yy, note=True)
        cv.hang(P_[c2[1]], x + 91.44, yy, note=True)
        cv.inline(P_[rq], x + 114.3, yy, fields='a' if yy == ya else 'b')
        cv.wire((x, yy), l0 + '.1')
        cv.wire(l0 + '.2', c1 + '.1')
        cv.wire(c1 + '.2', rq + '.1')
    ant = cv.put(P_['ANT501'], xant, yant, 270, fields='r')
    p1, p2 = ant.pin('1'), ant.pin('2')             # p1 (NFC_ANT2) above p2 (NFC_ANT1)
    cv.wire('R505.2', (xant - 22.86, ya), (xant - 22.86, p1[1]), p1)
    cv.wire('R504.2', (xant - 15.24, yb), (xant - 15.24, p2[1]), p2)
    # receiver: divider from the TX2 filter node, coupling capacitor, bias from VMID
    r = cv.put(P_['R506'], x + 35.56, ya - P - 3.81, 180)
    cv.wire((x + 35.56, ya), r.pin('1'))
    yr = r.pin('2')[1] - P
    cv.wire(r.pin('2'), (x + 35.56, yr))
    cv.inline(P_['C520'], x + 50.8, yr, fields='a')
    cv.wire((x + 35.56, yr), 'C520.1')
    cv.inline(P_['R507'], x + 73.66, yr, fields='a')
    cv.wire('C520.2', 'R507.1')
    cv.wire((x + 60.96, yr), (x + 60.96, yr - 7.62))
    cv.label('NFC_RX', x + 60.96, yr - 7.62, 'U')
    cv.hang(P_['C521'], x + 83.82, yr, gap=0)
    cv.wire('R507.2', (x + 96.52, yr))
    cv.label('NFC_VMID', x + 96.52, yr, 'R')


# ---- Display -----------------------------------------------------------------------------------------
def display(cv, P_, top):
    panel(cv, P_, 365.76, top + 12.7)
    series(cv, P_, 50.8, top + 20.32)
    backlight(cv, P_, 119.38, top + 22.86)
    expander(cv, P_, 152.4, top + 104.14)


def panel(cv, P_, x, y):
    cv.begin('Panel connector')
    cv.put_at(P_['J601'], '1', x, y + 5.08)
    cv.rail('+3V3', [P_[c] for c in ('C601', 'C602', 'C603', 'C604')], x - 104.14, y + 2.54, pitch=16.51, note=True)
    for k, (net, r) in enumerate((('I2C0_SCL', 'R601'), ('I2C0_SDA', 'R602'))):
        yy = y + 40.64 + P * k
        xr = x - 96.52 + 10.16 * k
        cv.label(net, x - 104.14, yy, 'L')
        cv.wire((x - 104.14, yy), (xr, yy))
        cv.stand(P_[r], xr, yy, fields='r')
    # ESD protection of the touch lines (pins close by labels)
    for k, ref in enumerate(('U603', 'U604')):
        cv.put(P_[ref], x - 60.96, y + 55.88 + 38.1 * k, fields={'Reference': (7.62, -10.92), 'Value': (7.62, -9.22)})


def series(cv, P_, x, y):
    """33 ohm arrays in the RGB bus at the MCU: labels on both sides (a bus)."""
    cv.begin('Series resistors on the RGB bus')
    for k in range(5):
        cv.put(P_['RN60%d' % (k + 1)], x, y + 20.32 * k + 5.08, 270, fields={'Reference': (0, -10.4), 'Value': (0, -8.7)})


def backlight(cv, P_, x, y):
    """Boost converter for the 4S2P backlight: current set by R603 (0.2 V / 5.1 ohm), PWM on CTRL."""
    cv.begin('Backlight driver')
    u = cv.put(P_['U601'], x + 45.72, y + P)
    vin, ctrl, sw, ov, fb = (u.pin(n) for n in ('6', '4', '1', '5', '3'))
    cv.power('+5V', x, vin[1])
    cv.hang(P_['C605'], x + 7.62, vin[1])
    cv.wire((x, vin[1]), vin)
    xb, yt = vin[0] - 5.08, vin[1] - 12.7          # the inductor's feed, over the top of the chip
    cv.wire((xb, vin[1]), (xb, yt))
    cv.inline(P_['L601'], xb + 17.78, yt)
    cv.wire('L601.2', (sw[0] + 7.62, yt), (sw[0] + 7.62, sw[1]))
    cv.wire((xb, yt), 'L601.1')
    cv.diode(P_['D601'], sw[0] + 15.24, sw[1])
    cv.wire(sw, 'D601.2')
    xo = sw[0] + 22.86
    cv.wire(ov, (xo, ov[1]), (xo, sw[1]))
    cv.hang(P_['C606'], xo + 7.62, sw[1])
    cv.hang(P_['C607'], xo + 25.4, sw[1])
    cv.wire('D601.1', (xo + 35.56, sw[1]))
    cv.label('BL_A', xo + 35.56, sw[1], 'R')
    yk = fb[1] + 15.24
    cv.wire(fb, (fb[0] + P, fb[1]), (fb[0] + P, yk), (fb[0] + 12.7, yk))
    cv.hang(P_['R603'], fb[0] + 7.62, yk, gap=0, fields='l')
    cv.label('BL_K', fb[0] + 12.7, yk, 'R')
    cv.wire(ctrl, (ctrl[0] - 5.08, ctrl[1]))
    cv.hang(P_['R604'], ctrl[0] - 5.08, ctrl[1], gap=0, fields='l')
    cv.wire((ctrl[0] - 5.08, ctrl[1]), (ctrl[0] - 10.16, ctrl[1]))
    cv.label('BL_PWM', ctrl[0] - 10.16, ctrl[1], 'L')


def expander(cv, P_, x, y):
    cv.begin('IO expander (I2C 0x20)')
    u = cv.put(P_['U602'], x, y + 12.7)
    vcc = u.pin('16')
    cv.wire(vcc, (vcc[0] + 33.02, vcc[1]))
    cv.hang(P_['C608'], vcc[0] + 27.94, vcc[1])      # beyond the labels of the inputs below
    cv.power('+3V3', vcc[0] + 33.02, vcc[1])


# ---- UI ----------------------------------------------------------------------------------------------
def ui(cv, P_, top):
    leds(cv, P_, 30.48, top + 45.72)
    buzzer(cv, P_, 309.88, top + 15.24)
    tamper(cv, P_, 50.8, top + 170.18)


def leds(cv, P_, x, y):
    """Level shifter and the LED chain, D701 to D708 in the order the data passes them."""
    cv.begin('LED data level shifter and addressable LEDs')
    u = cv.put(P_['U701'], x + 25.4, y - P)
    a, yo, vcc = u.pin('2'), u.pin('4'), u.pin('5')
    cv.label('LED_DATA', x, a[1], 'L')
    cv.wire((x, a[1]), a)
    cv.hang(P_['R705'], x + 5.08, a[1], gap=0, fields='l')
    yc = vcc[1] - 10.16
    cv.wire(vcc, (vcc[0] + P, vcc[1]), (vcc[0] + P, yc), (vcc[0] + 15.24, yc))
    cv.hang(P_['C701'], vcc[0] + 10.16, yc, gap=0)
    cv.power('+5V', vcc[0] + 15.24, yc)
    cv.inline(P_['R701'], yo[0] + 20.32, yo[1])
    cv.wire(yo, 'R701.1')
    pitch = 35.56
    x0 = yo[0] + 45.72
    for row in range(2):
        yy = yo[1] + 58.42 * row
        rail = yy - 25.4
        cv.power('+5V', x0 - 30.48, rail)
        if row == 0:
            cv.hang(P_['C702'], x0 - 22.86, rail, note=True)
        for k in range(4):
            i = 4 * row + k
            d = cv.put(P_['D70%d' % (i + 1)], x0 + pitch * k, yy, fields={'Reference': (4.6, 9.4), 'Value': (8.6, 11.1)})
            vdd = d.pin('3')
            cv.wire(vdd, (vdd[0], rail))
            cv.hang(P_['C7%02d' % (i + 3)], vdd[0] + 12.7, rail, note=True)
            if k:
                cv.wire('D70%d.4' % i, 'D70%d.2' % (i + 1))
        cv.wire((x0 - 30.48, rail), (x0 + pitch * 3 + 12.7, rail))
    cv.wire('R701.2', 'D701.2')
    out = cv.at('D704.4')
    yw = out[1] + 25.4
    cv.wire(out, (out[0] + 5.08, out[1]), (out[0] + 5.08, yw), (x0 - 35.56, yw),
            (x0 - 35.56, out[1] + 58.42), 'D705.2')


def buzzer(cv, P_, x, y):
    """Low-side switch: the coil between +5V (through R702) and the transistor, flyback diode across it."""
    cv.begin('Buzzer')
    cv.power('+5V', x, y)
    r = cv.put(P_['R702'], x, y + 6.35)
    cv.wire((x, y), r.pin('1'))
    yp = y + 15.24
    cv.wire(r.pin('2'), (x, yp), (x + 15.24, yp))
    bz = cv.put_at(P_['BZ701'], '1', x, yp + P, fields='l')
    cv.wire((x, yp), bz.pin('1'))
    d = cv.put_at(P_['D709'], '1', x + 15.24, yp + P, 270)
    cv.wire((x + 15.24, yp), d.pin('1'))
    yn = bz.pin('2')[1] + P
    cv.wire(bz.pin('2'), (x, yn), (x + 15.24, yn), d.pin('2'))
    q = cv.put_at(P_['Q701'], '3', x, yn + P, fields='r')
    cv.wire((x, yn), q.pin('3'))
    g = q.pin('1')
    cv.wire(g, (g[0] - 10.16, g[1]))
    cv.hang(P_['R704'], g[0] - 5.08, g[1], gap=0, fields='l')
    cv.inline(P_['R703'], g[0] - 15.24, g[1])
    cv.wire('R703.2', (g[0] - 10.16, g[1]))
    cv.out('R703.1', side='L')


def tamper(cv, P_, x, y):
    """Accelerometer, hall switch and proximity sensor; all on I2C0 except the hall switch (IO expander)."""
    cv.begin('Tamper detection')
    acc = cv.put(P_['U702'], x + 30.48, y, fields={'Reference': (11.4, -15.0), 'Value': (11.4, -13.3)})
    sa0 = acc.pin('3')
    cv.wire(sa0, (sa0[0] - 27.94, sa0[1]))
    cv.stand(P_['R706'], sa0[0] - 27.94, sa0[1], gap=0, fields='l')
    i1 = acc.pin('12')
    cv.wire(i1, (i1[0] + 12.7, i1[1]))
    cv.put(P_['TP814'], i1[0] + 12.7, i1[1], fields='tp')
    cv.rail('+3V3', [P_['C711'], P_['C712']], x, y - 35.56, pitch=16.51)
    hall = cv.put(P_['U703'], x + 96.52, y, fields='l')
    cv.rail('+3V3', [P_['C713']], x + 106.68, y - 35.56)
    prox = cv.put(P_['U704'], x + 172.72, y)
    k1, k2 = prox.pin('2'), prox.pin('5')
    yb = prox.body[3] + 5.08
    cv.wire(k1, (k1[0] - 12.7, k1[1]), (k1[0] - 12.7, yb), (k2[0] + 5.08, yb), (k2[0] + 5.08, k2[1]), k2)
    it = prox.pin('6')
    cv.wire(it, (it[0] + 30.48, it[1]))
    cv.stand(P_['R707'], it[0] + 17.78, it[1], gap=0, fields='r')
    cv.put(P_['TP815'], it[0] + 30.48, it[1], fields='tp')
    cv.rail('+3V3', [P_['C714'], P_['C715']], x + 137.16, y - 35.56, pitch=16.51)
    return hall


# ---- Mechanical --------------------------------------------------------------------------------------
def mech(cv, P_, top):
    cv.begin('Mounting holes (M3)')
    for k in range(4):
        cv.put(P_['H80%d' % (k + 1)], 40.64 + 25.4 * k, top + 25.4, fields='b')
    cv.begin('Fiducials')
    for k in range(5):
        cv.put(P_['FID80%d' % (k + 1)], 162.56 + 25.4 * k, top + 25.4, fields='b')
    cv.begin('Test points: supply rails, I2C buses, RMII clock')
    tps = sorted((r for r in P_ if r.startswith('TP') and P_[r].sheet == 'mech'), key=lambda r: int(r[2:]))
    for k, ref in enumerate(tps):
        col, row = divmod(k, 5)
        cv.tp(P_[ref], 40.64 + 60.96 * col, top + 55.88 + 10.16 * row)
