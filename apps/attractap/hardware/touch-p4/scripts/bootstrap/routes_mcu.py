"""Fixed routes at the ESP32-P4: supply vias, the fan-out of all four sides, flash, display bus, and the
host-signal fan-out at the PN532. The routers cannot solve the first millimetres around a 0.35 mm pitch part
(see docs/design-notes.md), so these are laid out here and locked.

Every route ends on a pad or a via and uses only horizontal, vertical and 45 degree segments."""

import math

import pcbnew

from board import B_, V, dog, mm, unV


def mcu_power_vias(B):
    """Every MCU supply pin gets a via just inside the pad row, down to its plane."""
    cx, cy = unV(B.fp['U201'].GetPosition())
    part = B.d.parts['U201']
    # Pins whose neighbour also is a supply pin cannot both have a via (0.35 mm pitch). These leave the
    # pad row outwards to their capacitor instead: VDD_HP_1, VDD_USBPHY, VDDO_FLASH, VDDO_3, VDDO_4,
    # VDD_HP_2, VDD_BAT.
    outward = {'51', '54', '71', '73', '74', '76', '102'}
    for num, (x, y), pad in B.pads('U201'):
        net = part.nets.get(num)
        if not net or num == '105' or num in outward:
            continue
        if not (net.startswith(('+3V3', 'VDD', 'VDDO'))):
            continue
        dx, dy = x - cx, y - cy
        if abs(dx) > abs(dy):
            vx, vy = cx + math.copysign(4.15, dx), y
            if abs(dy) > 4.2:                         # corner pin: stay clear of the neighbouring pad row
                vy -= math.copysign(0.12, dy)
        else:
            vx, vy = x, cy + math.copysign(4.15, dy)
            if abs(dx) > 4.2:
                vx -= math.copysign(0.12, dx)
        B.track([(x, y), (vx, vy)], net, 0.15)
        B.via(vx, vy, net)
    # ground vias in the exposed pad
    for i in range(-2, 3):
        for j in range(-2, 3):
            B.via(cx + i * 1.4, cy + j * 1.4, 'GND', size=0.6, drill=0.3)


def psram_ring(board):
    """VDD_PSRAM has three pins on the MCU's top edge (59, 67, 72) with signal pins between them. Their
    vias inside the pad ring are joined on the back layer, so the net does not have to cross the
    signals that leave upwards."""
    fp = board.FindFootprintByReference('U201')
    pads = {p.GetNumber(): p for p in fp.Pads()}
    net = pads['72'].GetNet()
    cx, cy = unV(fp.GetPosition())
    yv, yr = cy - 4.15, cy - 3.45                 # via row of the supply pins, ring track below it
    xs = sorted(unV(pads[n].GetPosition())[0] for n in ('59', '67', '72'))

    def track(a, c):
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(V(round(a[0], 3), round(a[1], 3))); t.SetEnd(V(round(c[0], 3), round(c[1], 3)))
        t.SetWidth(mm(0.2)); t.SetLayer(B_); t.SetNet(net); t.SetLocked(True)
        board.Add(t)

    for x in xs:
        track((x, yv), (x, yr))
    for x1, x2 in zip(xs, xs[1:]):                # one segment per pin, so every junction is an end point
        track((x1, yr), (x2, yr))


def mcu_escape(B):
    """Routes at the MCU that are better laid out by hand: crystal, reset, VDD_BAT, a few supply pins,
    backlight PWM. The flash side of the MCU is in flash_routes().

    Every route here ends on a pad or a via. Tracks with an open end make the autorouter give up on
    that net, so the signals of pins 80 to 95 are left to it; the placement keeps the strip to the
    left of those pins free for them.
    """
    p = B.pad
    net = lambda num: B.d.parts['U201'].nets[str(num)]
    w = 0.15
    B.track(dog(p('U201', 84), p('R304', '1')), net(84), w)                   # SDIO clock to its resistor
    # converter enable: pin 79 -> pull-down -> converter pin 1
    r206 = p('R206', '1')
    B.track(dog(p('U201', 79), r206), net(79), w)
    B.track(dog(r206, p('U202', '1'), 'd'), net(79), w)
    # capacitors in the gaps of the unused pins 90 and 97/98
    for num, cap, wd in ((91, 'C222', 0.25), (96, 'C206', 0.2)):
        B.track(dog(p(cap, '1'), p('U201', num), 'd'), net(num), wd)
    # crystal
    c239, y3, y1, r209b = p('C239', '1'), p('Y201', '3'), p('Y201', '1'), p('R209', '2')
    B.track(dog(p('U201', 99), p('R210', '1')), net(99), w)
    B.track(dog(p('R210', '2'), c239), 'XTAL_N_X', w)
    B.track(dog(c239, y3, 'd'), 'XTAL_N_X', w)
    xp, r209a = p('U201', 100), p('R209', '1')
    B.track([xp, (xp[0] - 0.75, xp[1])] + dog((xp[0] - 0.75, xp[1]), r209a, 'd')[1:], net(100), w)
    B.track(dog(r209b, y1), 'XTAL_P_X', w)
    B.track(dog(p('C238', '1'), y1), 'XTAL_P_X', w)
    # VDD_BAT and reset fan out downwards in pin order
    c214, r201 = p('C214', '1'), p('R201', '2')
    B.track(dog(p('U201', 102), c214), net(102), 0.2)
    B.track(dog(c214, r201, 'd'), net(102), 0.2)
    B.track(dog(r201, p('C213', '1'), 'd'), net(102), 0.2)
    pu, r211 = p('U201', 103), p('R211', '2')
    k = (pu[0] - 1.99, pu[1] + 0.99)
    B.track([pu, (pu[0] - 1.0, pu[1]), k] + dog(k, r211)[1:], net(103), w)
    B.track(dog(r211, p('C240', '1')), net(103), w)
    # top edge: PSRAM and flash regulator outputs to their capacitors
    B.track(dog(p('U201', 72), p('C226', '1')), net(72), 0.2)
    B.track(dog(p('U201', 71), p('C223', '1')), net(71), 0.2)
    # backlight PWM: under the board to the backlight driver
    bl, u601, r604 = p('U201', 55), p('U601', '4'), p('R604', '1')
    va = (bl[0], bl[1] - 2.2)
    vb2 = (round(r604[0] + 0.08, 1), round(r604[1] - 0.95, 2))
    xc = 58.6
    vi = (bl[0], unV(B.fp['U201'].GetPosition())[1] - 4.15)       # inside the pad ring, like a supply pin:
    B.track([bl, vi], net(55), w)                                 # the front layer above the pins is needed
    B.via(*vi, net(55))                                           # for the Ethernet signals
    B.track([vi, va, (va[0] + 0.4, va[1] - 0.4), (xc - 0.4, va[1] - 0.4), (xc, va[1])] +
            dog((xc, va[1]), vb2)[1:], net(55), w, layer=B_)
    B.via(*vb2, net(55))
    B.track(dog(vb2, r604), net(55), w)
    B.track(dog(vb2, u601, 'd'), net(55), w)
    # 3.3 V pins of larger parts: a via straight into the plane
    x, y = p('U103', '1')
    B.track([(x, y), (x, y - 1.2)], '+3V3', 0.25)
    B.via(x, y - 1.2, '+3V3', size=0.6, drill=0.3)
    # supply pins of the panel connector (0.5 mm pitch): small vias in two rows, 3.3 V near, ground far
    for num, net, dy in (('2', '+3V3', -1.45), ('36', '+3V3', -1.45), ('1', 'GND', -2.25), ('7', 'GND', -2.25),
                         ('13', 'GND', -2.25), ('25', 'GND', -2.25), ('37', 'GND', -2.25)):
        x, y = p('J601', num)
        B.track([(x, y), (x, y + dy)], net, 0.2)
        B.via(x, y + dy, net)
    B.track(dog(p('U202', '4'), p('C232', '1')), '+3V3', 0.25)
    B.track(dog(p('U301', '3'), p('C302', '1')), '+3V3', 0.25)


def flash_routes(B):
    """The MCU's right-hand side, laid out by hand: flash memory, its supply, the USB PHY supply and the
    two USB pins. The grid router cannot solve this corner: seven flash pins at 0.35 mm pitch, two
    supply nets and a column of capacitors share it, and every track has exactly one place to go.

    Everything is on the front layer except the flash supply. That one starts at the via inside the pad
    ring (pin 30) and runs on the back to three vias: at its capacitors, at flash pin 8 and at the
    pull-up of the chip select.
    """
    p = B.pad
    m = lambda num: p('U201', num)
    w = 0.15
    u = {n: p('U203', n) for n in '12345678'}

    # USB PHY supply: pin 51 passes above R202 to its far pad, then on to the three capacitors
    a, r2, c216, c217, c215 = m(51), p('R202', '2'), p('C216', '1'), p('C217', '1'), p('C215', '1')
    ya = a[1] - 0.18
    B.track([a, (a[0] + 0.6, a[1]), (a[0] + 0.78, ya), (r2[0] - (r2[1] - ya), ya), r2], 'VDD_USBPHY', w)
    B.track(dog(c216, r2, 'd'), 'VDD_USBPHY', 0.2)
    B.track([c216, c217], 'VDD_USBPHY', 0.2)
    B.track([r2, (r2[0] + 0.87, r2[1]), (r2[0] + 1.17, r2[1] + 0.3), (r2[0] + 1.17, c215[1]), c215], 'VDD_USBPHY', 0.2)
    # USB pins to their series resistors, above the PHY supply track
    dn, r215 = m(52), p('R215', '2')
    B.track([dn, (dn[0] + 0.4, dn[1]), (r215[0] - 0.16, r215[1]), r215], 'USB_DN_M', w)
    dp, r216 = m(53), p('R216', '2')
    B.track([dp, (dp[0], dp[1] - 0.43), (dp[0] + (dp[1] - 0.43 - r216[1]), r216[1]), r216], 'USB_DP_M', w)

    # flash supply on the back layer
    c224, c225, c237, r207 = p('C224', '1'), p('C225', '1'), p('C237', '1'), p('R207', '1')
    cx = unV(B.fp['U201'].GetPosition())[0]
    v0 = (cx + 4.15, m(30)[1])                          # the via mcu_power_vias() made for pin 30
    j = (v0[0] + 0.8, v0[1])
    vb = (c224[0] - 0.72, (c224[1] + c225[1]) / 2)      # between the MCU pins and the capacitors
    vc = (u['8'][0] - 1.67, u['8'][1])                  # left of flash pin 8
    vd = (c237[0], c237[1] + 0.8)
    B.track([v0, j], 'VDD_FLASH', 0.2, layer=B_)
    B.track([j, (vb[0], j[1] - (vb[0] - j[0])), vb], 'VDD_FLASH', 0.2, layer=B_)
    B.track([j, (j[0] + (vc[1] - j[1]), vc[1]), vc], 'VDD_FLASH', 0.2, layer=B_)
    B.track([vd, (vd[0], vc[1] - 0.6), (vd[0] - 0.6, vc[1]), vc], 'VDD_FLASH', 0.2, layer=B_)
    for v in (vb, vc, vd):
        B.via(*v, 'VDD_FLASH')
    B.track([vb, (c224[0] - 0.22, c224[1]), c224], 'VDD_FLASH', 0.2)
    B.track([c224, c225], 'VDD_FLASH', 0.2)
    B.track([vc, u['8']], 'VDD_FLASH', 0.2)
    B.track([c237, vd], 'VDD_FLASH', 0.2)
    B.track([c237, (c237[0] + 0.7, c237[1] - 0.7), (r207[0] - 0.7, r207[1] - 0.7), r207], 'VDD_FLASH', 0.2)

    # flash signals, in pin order from top to bottom
    d0, h0, w0, q0, cs = m(33), m(31), m(29), m(28), m(27)
    yd = d0[1] - 0.98                                   # between the capacitors and R208
    B.track([d0, (d0[0] + 0.55, d0[1]), (d0[0] + 1.53, yd), (u['5'][0] - 0.97 - (yd - u['5'][1]), yd),
             (u['5'][0] - 0.97, u['5'][1]), u['5']], 'FLASH_D', w)
    B.track(dog(m(32), p('R208', '1')), 'FLASH_CK_M', w)
    B.track(dog(p('R208', '2'), u['6'], 'd'), 'FLASH_CK', w)
    dy = u['7'][1] - h0[1]
    B.track([h0, (h0[0] + 0.5, h0[1]), (h0[0] + 0.5 + dy, u['7'][1]), u['7']], 'FLASH_HOLD', w)
    # write protect: through the gap between flash pins 7 and 8, under the package, up to pin 3
    yg, xw = (u['7'][1] + u['8'][1]) / 2, u['3'][0] - 1.93
    B.track([w0, (vc[0] - 0.1 - (yg - w0[1]), w0[1]), (vc[0] - 0.1, yg), (xw - 0.4, yg), (xw, yg - 0.4),
             (xw, u['3'][1] + 0.4), (xw + 0.4, u['3'][1]), u['3']], 'FLASH_WP', w)
    # data out: below pin 8, up to pin 2
    yq, xq = u['8'][1] + 0.53, u['2'][0] - 1.53
    B.track([q0, (q0[0] + 1.3, q0[1]), (q0[0] + 1.3 + (yq - q0[1]), yq), (xq - 0.45, yq), (xq, yq - 0.45),
             (xq, u['2'][1] + 0.4), (xq + 0.4, u['2'][1]), u['2']], 'FLASH_Q', w)
    # chip select: below the data-out track to pin 1; its pull-up joins from the other side of the flash
    yc = u['1'][1] + 0.9
    B.track([cs, (cs[0] + 1.1, cs[1]), (cs[0] + 1.1 + (yc - cs[1]), yc), (u['1'][0] - 0.9, yc), u['1']], 'FLASH_CS', w)
    r207b, xr = p('R207', '2'), u['1'][0] + 1.57
    B.track([r207b, (xr - 0.4, r207b[1]), (xr, r207b[1] + 0.4), (xr, u['1'][1] - 0.4), (xr - 0.4, u['1'][1]), u['1']],
            'FLASH_CS', w)


def nfc_host(B):
    """Fan-outs of the four NFC host signals at both ends. At the MCU they are neighbouring pins and
    leave to the left between two capacitors; at the PN532 the pull-ups sit right below the pins. In
    both places a track of one signal easily shuts in the next pin, so each gets a fixed track to a
    via. The long run between the vias is left to the router."""
    p = B.pad
    w = 0.15
    # MCU: pins 92 to 95. The outer two turn away first, the inner two run on between their vias.
    for num, net, run, turn in ((92, 'NFC_IRQ', 3.4, -0.4), (95, 'NFC_SCL', 3.4, 0.4),
                                (93, 'NFC_RST', 4.6, -0.4), (94, 'NFC_SDA', 4.6, 0.4)):
        x, y = p('U201', num)
        via = (x - run - 0.4, y + turn)
        B.track([(x, y), (x - run, y), via], net, w)
        B.via(*via, net)
    # PN532
    irq, scl, sda, rst = p('U501', 25), p('U501', 27), p('U501', 28), p('U501', 38)
    r501, r502, r503 = p('R501', '2'), p('R502', '2'), p('R503', '1')
    v = (irq[0], irq[1] + 0.99)
    B.track([irq, v], 'NFC_IRQ', w)
    B.via(*v, 'NFC_IRQ')
    B.track(dog(scl, r501), 'NFC_SCL', w)
    v = (r501[0] - 1.0, r501[1] + 0.36)
    B.track(dog(r501, v), 'NFC_SCL', w)
    B.via(*v, 'NFC_SCL')
    B.track(dog(sda, r502), 'NFC_SDA', w)
    v = (r502[0] + 0.8, r502[1] - 0.64)
    B.track(dog(r502, v, 'd'), 'NFC_SDA', w)
    B.via(*v, 'NFC_SDA')
    B.track(dog(rst, r503), 'NFC_RST', w)
    v = (r503[0], r503[1] + 0.9)
    B.track([r503, v], 'NFC_RST', w)
    B.via(*v, 'NFC_RST')


def uart_escape(B):
    """UART0 TX (pin 69) has no way out on the front layer: the flash regulator's capacitor and its track
    close the space above pins 69 and 70, and only one of the two fits past it. This one leaves like a
    supply pin, through a via inside the pad ring, and runs on the back to a via above the capacitors."""
    x, y = B.pad('U201', 69)
    cy = unV(B.fp['U201'].GetPosition())[1]
    v1 = (x, cy - 4.15)
    yk = B.pad('C229', '2')[1] + 0.53                   # turn towards the gap between two ground vias
    xg = (B.pad('C229', '2')[0] + B.pad('C228', '2')[0]) / 2
    v2 = (xg, yk - (xg - x) - 1.37)
    B.track([(x, y), v1], 'UART0_TX', 0.15)
    B.via(*v1, 'UART0_TX')
    B.track([v1, (x, yk), (xg, yk - (xg - x)), v2], 'UART0_TX', 0.15, layer=B_)
    B.via(*v2, 'UART0_TX')


def lcd_fanout(B):
    """The 20 display signals from the MCU's lower edge to their series resistor arrays. Pins and
    resistors are in the same order, so every track is a drop, one diagonal and a drop. The diagonals
    start 0.1 mm apart from the outside inwards, which keeps neighbours 0.3 mm apart (centre to centre)
    while both run diagonally. The routers shuffle these tracks without end; this is the one solution."""
    rn = {}
    for ref in ('RN601', 'RN602', 'RN603', 'RN604', 'RN605'):
        for q in B.fp[ref].Pads():
            name = q.GetNetname().split('/')[-1]
            if name.endswith('_M'):
                rn[name] = unV(q.GetPosition())
    pins = sorted((unV(q.GetPosition()), q.GetNetname().split('/')[-1]) for q in B.fp['U201'].Pads()
                  if q.GetNetname().split('/')[-1] in rn)
    left = [pn for pn in pins if rn[pn[1]][0] < pn[0][0]]                 # these move left, outermost first
    right = [pn for pn in reversed(pins) if rn[pn[1]][0] >= pn[0][0]]     # these move right, outermost first
    for group, y0 in ((left, 1.2), (right, 0.95)):
        for k, ((x, y), name) in enumerate(group):
            xr, yr = rn[name]
            ya = y + y0 + 0.1 * k
            B.track([(x, y), (x, ya), (xr, ya + abs(xr - x)), (xr, yr)], name, 0.15)


def mcu_top(B):
    """Fan-out of the MCU's upper edge: UART0 RX, the nine Ethernet signals and the core supply pin 54.
    Each signal gets a via in a field above its pin, so it can change layer at once; the long run to the
    PHY is left to the router. Neighbouring pins are spread from 0.35 to 0.45 mm and their vias alternate
    between two rows; any other arrangement puts a via in the way of the next track."""
    p = B.pad
    m = lambda num: p('U201', num)
    w = 0.15
    # core supply pin 54: along the USB track to C220, and on between R203 and C220 to R203
    a, c220, r203 = m(54), p('C220', '1'), p('R203', '2')
    yk = c220[1] + 0.9
    B.track([a, (a[0], a[1] - 0.53), (a[0] + (a[1] - 0.53 - yk), yk), (c220[0] - 0.9, yk), c220], 'VDD_HP_1', 0.2)
    xk = (r203[0] + c220[0]) / 2 + 0.005
    B.track([c220, (xk, c220[1]), (xk, r203[1]), r203], 'VDD_HP_1', w)
    # GPIO35 strap resistor to the BOOT branch resistor above it
    B.track([p('R212', '2'), p('R217', '1')], 'RMII_TXD1', w)
    # UART0 RX: under the flash regulator's capacitor, up beside it to a via
    rx, c223 = m(70), p('C223', '1')
    yh = c223[1] + 0.49
    v = (c223[0] + 0.72, yh - 1.07)
    B.track([rx, (rx[0], yh + 0.43), (rx[0] + 0.43, yh), (v[0], yh), v], 'UART0_RX', w)
    B.via(*v, 'UART0_RX')
    # Ethernet pins: columns 0.5 mm apart, vias alternating between two rows. Third value: how far above
    # the pin the track turns. Of two neighbours that both move right, the right one turns 0.1 mm earlier,
    # so the two diagonals never run closer than 0.3 mm.
    x0 = m(68)[0] + 0.08
    rows = (1.8, 1.0)                                   # via rows: distance above the pin centres
    for k, (num, net, turn) in enumerate(((68, 'ETH_MDIO', 0.5), (66, 'RMII_TXD1', 0.5), (65, 'RMII_TXD0', 0.65),
                                          (64, 'RMII_TX_EN', 0.55), (63, 'RMII_REF_CLK', 0.45), (61, 'ETH_MDC', 0.55),
                                          (60, 'RMII_RXD1', 0.45), (58, 'RMII_RXD0', 0.55), (57, 'RMII_CRS_DV', 0.45))):
        x, y = m(num)
        xv = x0 + 0.5 * k
        B.track([(x, y), (x, y - turn), (xv, y - turn - abs(xv - x)), (xv, y - rows[k % 2])], net, w)
        B.via(xv, y - rows[k % 2], net)


def mcu_left(B):
    """Fan-out of the MCU's left edge above the NFC pins: the four SDIO data lines (pins 80 to 83) and
    SDIO command, Wi-Fi enable, buzzer and LED data (pins 86 to 89). Each group runs in a channel that is
    just high enough for its four tracks, between fixed tracks and parts. The vias form a staircase to
    the left: the track nearest the open side ends first, the others pass its via."""
    w = 0.15
    m = lambda num: B.pad('U201', num)
    # SDIO data: vias up and to the left, into the space below the core converter's enable resistor
    for num, net, via in ((80, 'SDIO_D0', (-2.0, -0.53)), (81, 'SDIO_D1', (-2.7, -0.93)),
                          (82, 'SDIO_D2', (-3.4, -0.43)), (83, 'SDIO_D3', (-4.25, -0.42))):
        x, y = m(num)
        v = (x + via[0], y + via[1])
        B.track([(x, y), (v[0] - via[1], y), v], net, w)
        B.via(*v, net)
    # the other four close up to 0.3 mm pitch on their way left (the upper one turns first), then each
    # drops to its via; LED data, the lowest, ends first
    for num, net, turn, up, run, drop in ((86, 'SDIO_CMD', 0.60, 0.37, 4.70, 0.50), (87, 'C6_EN_M', 0.75, 0.42, 4.05, 0.45),
                                          (88, 'BUZZER', 0.90, 0.47, 3.35, 0.45)):
        x, y = m(num)
        B.track([(x, y), (x - turn, y), (x - turn - up, y - up), (x - run, y - up), (x - run - drop, y - up + drop)], net, w)
        B.via(x - run - drop, y - up + drop, net)
    x, y = m(89)                                        # (leaves room for the ground via of C222 below it)
    B.track([(x, y), (x - 2.88, y), (x - 3.1, y - 0.22)], 'LED_DATA', w)
    B.via(x - 3.1, y - 0.22, 'LED_DATA')
