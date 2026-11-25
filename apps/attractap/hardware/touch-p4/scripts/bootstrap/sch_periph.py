"""Schematic layout: the Wi-Fi and Ethernet sheets."""
from sch_draw import P


def wifi(cv, P_, top):
    supply(cv, P_, 165.1, top + 17.78)
    module(cv, P_, 96.52, top + 27.94)
    enable(cv, P_, 190.5, top + 81.28)
    sdio(cv, P_, 190.5, top + 137.16)
    c5_test_points(cv, P_, 284.48, top + 93.98)


def supply(cv, P_, x0, y0):
    """The module's own 3.3 V converter: the circuit of U103 (TI SLVSDG1C figure 8-1), input left, switch node
    right, the divider with its feed-forward capacitor between the inductor and the output."""
    cv.begin('Wi-Fi module supply (3.3 V buck)')
    y = y0
    cv.power('+5V', x0, y)
    cv.hang(P_['C304'], x0 + 10.16, y)
    cv.hang(P_['C305'], x0 + 25.4, y)
    u = cv.put(P_['U302'], x0 + 81.28, y + P)
    vin, en, sw, fb = u.pin('4'), u.pin('1'), u.pin('3'), u.pin('5')
    cv.wire((x0, y), vin)
    r = cv.inline(P_['R310'], en[0] - 22.86, en[1], fields='b')
    cv.wire(r.pin('2'), en)
    cv.wire(r.pin('1'), (r.pin('1')[0], y))
    cv.inline(P_['L301'], sw[0] + 27.94, sw[1])
    cv.wire(sw, 'L301.1')
    xd = sw[0] + 40.64                              # divider: +3V3_WIFI - R311 - FB - R312 - GND, C306 over R311
    cv.hang(P_['R311'], xd, sw[1])
    cv.hang(P_['C306'], xd + 17.78, sw[1])
    yfb = cv.at('R311.2')[1]
    cv.wire('R311.2', 'C306.2')
    cv.hang(P_['R312'], xd, yfb)
    cv.wire(fb, (fb[0] + P, fb[1]), (fb[0] + P, yfb), (xd, yfb))
    xo = xd + 30.48
    cv.wire('L301.2', (xo, sw[1]))
    cv.label('+3V3_WIFI', xo, sw[1], 'R')


def module(cv, P_, x, y):
    cv.begin('ESP32-C5 module')
    u = cv.put(P_['U301'], x, y + 48.26)
    v = u.pin('3')
    ry = v[1] - 7.62                                # supply comes in from above, capacitors hang from it
    cv.wire(v, (v[0] - P, v[1]), (v[0] - P, ry))
    cv.rail('+3V3_WIFI', [P_['C301'], P_['C302']], v[0] - 45.72, ry, pitch=16.51, end=(v[0] - P, ry))


def enable(cv, P_, x, y):
    """Reset of the co-processor: the P4 drives C5_EN_M; pull-up and RC keep the module off until its 3.3 V
    is up. IO28 high at reset boots from flash; the test point C5_BOOT pulls it low for download."""
    cv.begin('Enable and boot')
    cv.label('C5_EN_M', x, y, 'L')
    cv.inline(P_['R302'], x + 7.62, y)
    cv.stand(P_['R301'], x + 17.78, y)
    cv.hang(P_['C303'], x + 27.94, y)
    cv.put(P_['TP810'], x + 38.1, y, fields='tp')
    cv.wire((x, y), 'R302.1')
    cv.wire('R302.2', (x + 50.8, y))
    cv.label('C5_EN', x + 50.8, y, 'R')
    yy = y + 30.48                                  # far enough below for R303's supply label to stand up
    cv.label('C5_IO28', x, yy, 'L')
    cv.stand(P_['R303'], x + 10.16, yy)
    cv.put(P_['TP811'], x + 22.86, yy, fields='tp')
    cv.wire((x, yy), (x + 22.86, yy))


def sdio(cv, P_, x, y):
    """SDIO: source resistor in the clock, 51 k pull-ups on command and data (esp-hosted asks for them)."""
    cv.begin('SDIO')
    cv.label('SDIO_CLK_M', x, y, 'L')
    cv.inline(P_['R304'], x + 7.62, y)
    cv.wire((x, y), 'R304.1')
    cv.out('R304.2', length=P)
    for k, (net, r) in enumerate((('SDIO_CMD', 'R305'), ('SDIO_D0', 'R306'), ('SDIO_D1', 'R307'),
                                  ('SDIO_D2', 'R308'), ('SDIO_D3', 'R309'))):
        yy = y + 30.48 + P * k                      # a staircase: each pull-up stands right of the lines above
        xr = x + 7.62 + 10.16 * k
        cv.label(net, x, yy, 'L')
        cv.wire((x, yy), (xr, yy))
        cv.stand(P_[r], xr, yy, fields='r')


def c5_test_points(cv, P_, x, y):
    """For the first flashing and for recovery of the co-processor (esp-hosted firmware): its USB pins carry
    SDIO, so UART0 with EN, BOOT (IO28) and ground is the only wired way in."""
    cv.begin('C5 programming test points')
    for k, ref in enumerate(('TP812', 'TP813', 'TP832')):
        cv.tp(P_[ref], x, y + 7.62 * k)


def eth(cv, P_, top):
    phy(cv, P_, 76.2, top + 43.18)
    phy_supply(cv, P_, 152.4, top + 20.32)
    eth_crystal(cv, P_, 152.4, top + 76.2)
    straps(cv, P_, 152.4, top + 137.16)
    rmii_resistors(cv, P_, 223.52, top + 76.2)
    jack(cv, P_, 340.36, top + 43.18)


def phy(cv, P_, x, y):
    cv.begin('Ethernet PHY')
    cv.put(P_['U401'], x, y + 30.48, fields={'Reference': (-9.5, -31.6), 'Value': (-9.5, -29.9)})


def phy_supply(cv, P_, x, y):
    cv.begin('PHY supply')
    cv.power('+3V3', x, y)
    cv.inline(P_['FB401'], x + 12.7, y)
    end = x + 25.4
    for c in ('C401', 'C402', 'C403'):
        cv.hang(P_[c], end, y, note=True)
        end += 16.51
    cv.wire((x, y), 'FB401.1')
    cv.wire('FB401.2', (end, y))
    cv.label('PHY_3V3', end, y, 'R')
    yr = y + 22.86
    cv.rail('PHY_REG', [P_['C404'], P_['C405']], x, yr, pitch=16.51)
    cv.label('PHY_ISET', x + 40.64, yr, 'L')
    cv.wire((x + 40.64, yr), (x + 45.72, yr))
    cv.hang(P_['R401'], x + 45.72, yr, gap=0)


def eth_crystal(cv, P_, x, y):
    cv.begin('25 MHz crystal')
    yp, yn = y, y + 12.7
    xc = x + 12.7
    cv.put(P_['Y401'], xc, (yp + yn) / 2, 270, fields='r')
    for net, yy in (('PHY_X1', yp), ('PHY_X2', yn)):
        cv.label(net, x, yy, 'L')
    cv.wire((x, yp), (xc, yp), 'Y401.1')
    cv.wire((x, yn), (xc, yn), 'Y401.3')
    cv.wire((xc, yp), (xc + 25.4, yp))
    cv.hang(P_['C406'], xc + 25.4, yp)
    cv.wire((xc, yn), (xc + 5.08, yn))
    cv.hang(P_['C407'], xc + 5.08, yn)


def straps(cv, P_, x, y):
    """Configuration read at reset: RMII mode, LED mode, PHY address 1."""
    cv.begin('PHY configuration straps')
    cv.label('PHY_3V3', x, y, 'L')
    end = x
    for k, r in enumerate(('R402', 'R403', 'R404')):
        xr = x + 7.62 + 33.02 * k
        cv.hang(P_[r], xr, y, note=True)
        end = xr
    cv.wire((x, y), (end, y))
    for k, r in enumerate(('R405', 'R406')):
        xr = x + 106.68 + 33.02 * k
        cv.put(P_[r], xr, y + 6.35, note=True)


def rmii_resistors(cv, P_, x, y):
    """Series resistors in the lines the PHY drives towards the P4, at the PHY."""
    cv.begin('RMII series resistors')
    for k, r in enumerate(('R407', 'R408', 'R409', 'R410')):
        yy = y + 10.16 * k
        cv.inline(P_[r], x + 7.62, yy)
        cv.out(r + '.1', length=P, side='L')
        cv.out(r + '.2', length=P, side='R')


def jack(cv, P_, x, y):
    """RJ45 with magnetics: centre taps to ground through 100 nF, LEDs, shield to ground through 1 nF and
    1 M; the PoE rectifiers' outputs go to the power sheet."""
    cv.begin('RJ45 jack with magnetics and PoE rectifiers')
    u = cv.put(P_['J401'], x, y)
    ctt, ctr = u.pin('4'), u.pin('3')
    for pin, cap, dx in ((ctt, 'C409', 50.8), (ctr, 'C408', 38.1)):
        cv.wire(pin, (pin[0] - dx, pin[1]))
        cv.hang(P_[cap], pin[0] - dx, pin[1], gap=0, fields='l')
    yk, gk = u.pin('12'), u.pin('14')
    for pin, r, dx, f in ((yk, 'R411', 17.78, 'a'), (gk, 'R412', 22.86, 'b')):
        cv.inline(P_[r], pin[0] - dx, pin[1], reverse=True, fields=f)
        cv.wire(pin, r + '.1')
        cv.out(r + '.2', length=P, side='L')
    s1, s2 = u.pin('GND1'), u.pin('GND2')
    ys = s1[1] + 5.08
    cv.wire(s1, (s1[0], ys))
    cv.wire(s2, (s2[0], ys))
    cv.wire((s1[0], ys), (s2[0] + 30.48, ys))
    cv.hang(P_['C410'], s2[0] + 12.7, ys, gap=0)
    cv.hang(P_['R413'], s2[0] + 30.48, ys, gap=0)
