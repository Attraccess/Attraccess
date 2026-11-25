"""Schematic layout: the two ESP32-P4 sheets (GPIO and system units; supply unit with decoupling and
the core converter). The P4's pins carry labels: every block around it is a block of its own, joined
by the net names (crystal, flash, reset, straps, decoupling groups)."""
from sch_draw import P


def mcu(cv, P_, top):
    gpio(cv, P_, 50.8, top + 50.8)
    system(cv, P_, 200.66, top + 22.86)
    crystal(cv, P_, 287.02, top + 22.86)
    flash(cv, P_, 287.02, top + 81.28)
    reset(cv, P_, 200.66, top + 147.32)
    straps(cv, P_, 287.02, top + 147.32)


def gpio(cv, P_, x, y):
    cv.begin('ESP32-P4: GPIO')
    u = cv.put(P_['U201'], x, y, unit=1)
    # USB Serial/JTAG: series resistors right at the pins, then on to the connector on the power sheet
    for pin, r, dx in (('GPIO24', 'R215', 17.78), ('GPIO25', 'R216', 35.56)):
        num = next(n for n, p in u.pins.items() if p[3] == pin)
        px, py = u.pin(num)
        cv.inline(P_[r], px + dx, py, reverse=True, fields='a' if r == 'R215' else 'b')
        cv.wire((px, py), r + '.2')
        cv.out(r + '.1', side='R')
    # UART0 to its test points: each point stands on its line, the lower one further out
    for k, (pin, tp) in enumerate((('GPIO37', 'TP808'), ('GPIO38', 'TP809'))):
        num = next(n for n, p in u.pins.items() if p[3] == pin)
        px, py = u.pin(num)
        tx = px + 25.4 + 15.24 * k
        cv.wire((px, py), (tx, py))
        cv.put(P_[tp], tx, py, fields='tp')


def system(cv, P_, x, y):
    cv.begin('ESP32-P4: clock, reset, flash, unused interfaces')
    cv.put(P_['U201'], x, y, unit=2)


def crystal(cv, P_, x, y):
    """40 MHz crystal: 0 ohm links at the pins (EMC tuning), crystal, load capacitors."""
    cv.begin('40 MHz crystal')
    yp, yn = y, y + 12.7
    for net, yy, r in (('XTAL_P', yp, 'R209'), ('XTAL_N', yn, 'R210')):
        cv.label(net, x, yy, 'L')
        cv.inline(P_[r], x + 7.62, yy)
        cv.wire((x, yy), r + '.1')
    yc = (yp + yn) / 2
    xc = x + 22.86
    cv.put(P_['Y201'], xc, yc, 270, fields='r')
    cv.wire('R209.2', (xc, yp), 'Y201.1')
    cv.wire('R210.2', (xc, yn), 'Y201.3')
    cv.wire((xc, yp), (xc + 33.02, yp))
    cv.hang(P_['C238'], xc + 33.02, yp, gap=P)
    cv.wire((xc, yn), (xc + 5.08, yn))
    cv.hang(P_['C239'], xc + 5.08, yn, gap=P)


def flash(cv, P_, x, y):
    """QSPI flash: chip-select pull-up and clock link at the part, supply from the P4's flash regulator."""
    cv.begin('Flash')
    u = cv.put(P_['U203'], x + 30.48, y + 5.08)
    cs = u.pin('1')
    r = cv.put(P_['R207'], cs[0] - 5.08, cs[1] - P - 3.81)
    cv.wire(cs, (cs[0] - 10.16, cs[1]))
    cv.label('FLASH_CS', cs[0] - 10.16, cs[1], 'L')
    cv.wire((cs[0] - 5.08, cs[1]), r.pin('2'))
    vcc = u.pin('8')
    top = r.pin('1')[1] - P
    cv.wire(r.pin('1'), (r.pin('1')[0], top), (vcc[0] + 17.78, top), (vcc[0] + 17.78, vcc[1]))
    cv.wire(vcc, (vcc[0] + 48.26, vcc[1]))
    cv.hang(P_['C237'], vcc[0] + 43.18, vcc[1])
    cv.label('VDD_FLASH', vcc[0] + 48.26, vcc[1], 'R')
    clk = u.pin('6')
    cv.inline(P_['R208'], clk[0] + 20.32, clk[1], reverse=True)
    cv.wire(clk, 'R208.2')
    cv.out('R208.1', side='R')


def reset(cv, P_, x, y):
    """Reset: RC on CHIP_PU, the button and its test point."""
    cv.begin('Reset')
    cv.put(P_['TP806'], x + 5.08, y, fields='tp')
    cv.stand(P_['R211'], x + 15.24, y)
    cv.hang(P_['C240'], x + 25.4, y)
    sw = cv.put_at(P_['SW201'], '1', x + 45.72, y + 7.62, fields='b')
    cv.wire((x + 43.18, y), (x + 43.18, y + 7.62), sw.pin('1'))
    cv.wire((x + 5.08, y), (x + 55.88, y))
    cv.label('CHIP_PU', x + 55.88, y, 'R')
    # supervisor: its open-drain output pulls CHIP_PU low with the button
    u = cv.put_at(P_['U204'], '2', x + 38.1, y + 22.86, fields='a')
    cv.wire(u.pin('2'), (x + 43.18, y + 22.86), (x + 43.18, y + 7.62))
    vx, vy = cv.out('U204.3')
    cv.hang(P_['C241'], vx - 5.08, vy, fields='l')
    cv.wire((vx - 5.08, vy), (vx, vy))


def straps(cv, P_, x, y):
    """Boot straps: GPIO35 (download mode with BOOT), GPIO34, GPIO36 (MDIO pull-up)."""
    cv.begin('Boot and straps')
    cv.label('RMII_TXD1', x, y, 'L')
    cv.stand(P_['R212'], x + 7.62, y)
    cv.inline(P_['R217'], x + 20.32, y)
    cv.wire((x, y), 'R217.1')
    cv.put(P_['TP807'], x + 33.02, y, fields='tp')
    sw = cv.put_at(P_['SW202'], '1', x + 40.64, y + 7.62, fields='b')
    cv.wire('R217.2', (x + 38.1, y), (x + 38.1, y + 7.62), sw.pin('1'))
    for k, (net, r) in enumerate((('RMII_TXD0', 'R213'), ('ETH_MDIO', 'R214'))):
        yy = y + 25.4 + 20.32 * k
        cv.label(net, x, yy, 'L')
        cv.stand(P_[r], x + 7.62, yy)
        cv.wire((x, yy), (x + 7.62, yy))


def mcu_power(cv, P_, top):
    supply_unit(cv, P_, 66.04, top + 12.7)
    decoupling(cv, P_, 129.54, top + 12.7)
    core_converter(cv, P_, 129.54, top + 142.24)


def supply_unit(cv, P_, x, y):
    cv.begin('ESP32-P4: supply pins')
    cv.put(P_['U201'], x, y, unit=3)


def decoupling(cv, P_, x, y):
    """The capacitors of each supply pin, grouped by rail. Each names the pin it sits at."""
    cv.begin('3.3 V supply pins: one capacitor at each pin')
    refs = ['C201', 'C202', 'C203', 'C204', 'C205', 'C206', 'C207', 'C212', 'C210', 'C211', 'C208', 'C209']
    cv.rail('+3V3', [P_[r] for r in refs], x, y, pitch=19.05, note=True)
    yb = y + 30.48
    cv.begin('VDD_BAT and USB PHY supply')
    for k, (r, net, caps) in enumerate((('R201', 'VDD_BAT', ['C213', 'C214']),
                                         ('R202', 'VDD_USBPHY', ['C215', 'C216', 'C217']))):
        yy = yb + 25.4 * k
        cv.power('+3V3', x, yy)
        cv.inline(P_[r], x + 7.62, yy)
        cx = x + 20.32
        for c in caps:
            cv.hang(P_[c], cx, yy)
            cx += 16.51
        cv.wire((x, yy), r + '.1')
        cv.wire(r + '.2', (cx, yy))
        cv.label(net, cx, yy, 'R')
    cv.begin('Core rail: one capacitor at each pin')
    yc = yb
    xc = x + 96.52
    end = cv.rail('VDD_HP', [P_[r] for r in ('C218', 'C219', 'C221', 'C222')], xc, yc, pitch=16.51, note=True)
    cv.put(P_['TP803'], end, yc, fields='tp')
    cv.wire((end - 16.51, yc), (end, yc))
    yh = yc + 25.4
    cv.label('VDD_HP', xc, yh, 'L')
    cv.inline(P_['R203'], xc + 7.62, yh)
    cv.wire((xc, yh), 'R203.1')
    cv.hang(P_['C220'], xc + 20.32, yh, note=True)
    cv.wire('R203.2', (xc + 27.94, yh))
    cv.label('VDD_HP_1', xc + 27.94, yh, 'R')
    cv.begin('Internal regulator outputs')
    yr = yb + 55.88
    for k, (net, caps) in enumerate((('VDD_FLASH', ['C223', 'C224', 'C225']),
                                      ('VDD_PSRAM', ['C226', 'C227', 'C228', 'C229']),
                                      ('VDDO_3', ['C230']), ('VDDO_4', ['C231']))):
        xx = x + (0, 76.2, 177.8, 205.74)[k]
        cv.rail(net, [P_[c] for c in caps], xx, yr, pitch=21.59, note=True)


def core_converter(cv, P_, x, y):
    """1.1 V core converter: the P4 enables it (EN_DCDC) and trims its voltage through FB_DCDC."""
    cv.begin('Core 1.1 V converter (TLV62569)')
    u = cv.put(P_['U202'], x + 66.04, y + P)
    vin, en, sw, fb = u.pin('4'), u.pin('1'), u.pin('3'), u.pin('5')
    cv.rail('+3V3', [P_['C232'], P_['C233']], x, vin[1], pitch=16.51, end=vin, note=True)
    cv.wire(en, (en[0] - 5.08, en[1]))
    cv.hang(P_['R206'], en[0] - 5.08, en[1], gap=0, fields='l')
    cv.wire((en[0] - 5.08, en[1]), (en[0] - 10.16, en[1]))
    cv.label('EN_DCDC', en[0] - 10.16, en[1], 'L')
    cv.inline(P_['L201'], sw[0] + 20.32, sw[1])
    cv.wire(sw, 'L201.1')
    xd = sw[0] + 33.02                              # divider: VDD_HP - R204 - FB - R205 - GND, C236 over R204
    cv.hang(P_['R204'], xd, sw[1])
    cv.hang(P_['C236'], xd + 17.78, sw[1])
    yfb = cv.at('R204.2')[1]
    cv.wire('R204.2', 'C236.2')
    cv.hang(P_['R205'], xd, yfb)
    cv.wire(fb, (fb[0] + P, fb[1]), (fb[0] + P, yfb), (xd, yfb))
    xo = xd + 33.02
    for c in ('C234', 'C235'):
        cv.hang(P_[c], xo, sw[1])
        xo += 16.51
    cv.wire('L201.2', (xo, sw[1]))
    cv.label('VDD_HP', xo, sw[1], 'R')
    cv.wire((xd - 5.08, yfb), (xd - 5.08, yfb + 7.62))
    cv.label('FB_DCDC', xd - 5.08, yfb + 7.62, 'D')
