"""Component placement for the Attractap Touch P4 board.

``place(B)`` positions every footprint. ``B`` is the board helper from
build_pcb.py: ``B.put(ref, x, y, rot)`` places a part.
All coordinates are board millimetres (see geometry.py), rotations in degrees
counter-clockwise. Passive pad 1 is at -x for rotation 0, at +y (below) for 90.
"""
import geometry as G

MCU = (43.0, 50.0)          # ESP32-P4 centre
FPC = (43.85, 67.7)         # display connector origin
PHY = (67.6, 64.6)          # Ethernet PHY centre
DCDC = (9.0, 70.0)          # DC input converter (U104) centre
NFC = (19.3, 123.2)         # PN532 centre


def place(B):
    put = B.put

    def rel(origin):
        return lambda ref, dx, dy, rot=0: put(ref, origin[0] + dx, origin[1] + dy, rot)

    # ================================================================ MCU core
    m = rel(MCU)
    # rot 90: bottom edge = GPIO1..23 (display bus), left edge = GPIO39..54 + crystal,
    # top edge = GPIO25..38 + regulator outputs, right edge = flash + USB
    m('U201', 0, 0, 90)

    # Regulator output capacitors above their pins (top edge, left part). They sit 2.4 mm above the
    # pad row: the twelve signals of the top edge need that strip to get out.
    m('C231', -4.4, -8.6, 90)      # VDDO_4
    m('C230', -3.3, -8.6, 90)      # VDDO_3
    m('C226', -2.2, -8.6, 90)      # VDDO_PSRAM
    m('C223', -1.1, -8.6, 90)      # VDDO_FLASH
    m('C221', -5.5, -10.8, 90)     # VDD_HP_2
    m('C209', -4.4, -10.8, 90)     # VDD_DCDCC 100n
    m('C211', -3.3, -10.8, 90)     # VDD_LDO 100n
    m('C227', -2.2, -10.8, 90)     # VDD_PSRAM 1u
    m('C229', -1.1, -10.8, 90)     # VDD_PSRAM_1
    m('C228', 0.0, -10.8, 90)      # VDD_PSRAM_0
    m('C208', -12.2, -12.6, 0)     # VDD_DCDCC 10u (plane connected, left of the converter)
    m('C210', -12.2, -14.1, 0)     # VDD_LDO 10u
    # right of the top edge: VDD_IO_4, VDD_HP_1 link, USB series resistors
    m('C204', 6.9, -9.0, 90)
    m('R203', 8.0, -9.0, 90)
    m('C220', 9.1, -9.0, 90)
    m('R216', 7.4, -6.8, 180)      # USB D+ (chip side on the left)
    m('R215', 7.4, -5.7, 180)      # USB D-
    # straps: GPIO35, GPIO34, MDIO pull-ups, to the right of the RMII pins' way out
    m('R212', 6.0, -12.4, 90)
    m('R217', 6.0, -14.4, 90)      # BOOT branch resistor, in line with the GPIO35 strap
    m('R213', 7.1, -12.4, 90)
    m('R214', 8.2, -12.4, 90)

    # core DC-DC at the top-left corner
    m('U202', -9.6, -7.6, 0)
    m('R206', -7.1, -5.9, 90)      # EN pull-down
    m('C232', -12.6, -8.4, 90)     # 10u input
    m('C233', -11.2, -10.7, 0)     # 100n input
    m('L201', -8.3, -10.6, 90)
    m('C234', -8.8, -13.9, 0)      # 22u output
    m('C235', -5.2, -13.9, 0)      # 22u output
    m('R204', -11.9, -5.65, 0)     # 510k VDD_HP - FB
    m('C236', -11.9, -4.65, 0)     # 22p feed-forward
    m('R205', -9.7, -4.65, 0)      # 510k FB - GND

    # USB PHY supply (right edge, upper part: neighbours there are unused MIPI pins)
    m('R202', 7.0, -3.6, 0)
    m('C216', 7.0, -2.6, 0)
    m('C217', 7.0, -1.6, 0)
    m('C215', 9.5, -2.6, 90)

    # flash, right of the chip (pins 5..8 face the chip in the same order as its flash pins)
    m('U203', 13.4, 2.6, 90)
    m('R208', 7.0, 2.6, 0)         # clock series
    m('C225', 7.0, 0.4, 0)         # VDD_FLASHIO 100n
    m('C224', 7.0, -0.6, 0)        # VDD_FLASHIO 1u
    m('C237', 12.4, -1.4, 0)       # flash VCC
    m('R207', 14.6, -1.4, 0)       # CS pull-up

    # bottom-right corner: VDD_IO_0 and VDD_HP_0
    m('C203', 6.6, 7.0, 90)
    m('C219', 7.7, 7.0, 90)
    m('C218', 9.6, 7.0, 90)
    # Left edge. The signals of pins 80 to 95 need room to leave to the left, so the strip
    # x 33 to 37.6, y 45.4 to 51.6 stays free except for two capacitors that sit in the gaps of
    # unused pins, right at their supply pin.
    m('C222', -6.7, -0.35, 180)    # VDD_HP_3 (pin 91)
    m('C206', -6.5, 1.93, 180)     # VDD_IO_6 (pin 96)
    m('R304', -10.7, -2.625, 180)   # SDIO clock source termination, at the end of the bus
    # 40 MHz crystal, below the bus
    m('R210', -8.5, 2.625, 180)     # XTAL_N
    m('R209', -10.7, 3.35, 180)    # XTAL_P
    m('Y201', -13.9, 3.35, 0)
    m('C239', -11.6, 1.87, 90)    # XTAL_N side
    m('C238', -16.7, 4.2, 180)     # XTAL_P side
    # bottom-left corner: VDD_BAT, reset
    m('C214', -7.9, 5.0, 270)
    m('R201', -9.6, 4.6, 0)
    m('C213', -10.1, 6.0, 180)
    # reset pull-up and capacitor: left of the passage that TP_RST, TP_INT and the touch I2C lines need
    # between here and the first resistor array
    m('R211', -9.0, 7.5, 0)
    m('C240', -9.0, 8.6, 180)
    # 3.3 V capacitors whose pins have a via straight into the plane: VDD_IO_5, VDD_ANA, VDD_LP, bulk
    m('C207', -18.6, 7.4, 90)
    m('C205', -17.0, 7.4, 90)
    m('C212', -15.4, 7.4, 90)
    m('C201', -13.8, 7.4, 90)
    m('C202', -12.2, 7.4, 90)

    put('SW201', 4.8, 21.0, 0)     # RESET
    put('SW202', 4.8, 28.0, 0)     # BOOT

    # ====================================================== display interface
    f = rel(FPC)
    f('J601', 0, 0, 180)
    for ref, x in (('RN601', 38.35), ('RN602', 40.85), ('RN603', 43.35), ('RN604', 45.85), ('RN605', 48.35)):
        put(ref, x, FPC[1] - 6.0, 270)
    f('C601', 9.9, -3.8, 90)       # panel VCI
    f('C602', 11.0, -3.8, 90)
    f('C603', -11.1, -3.8, 90)     # touch VCI
    f('C604', -12.2, -3.8, 90)
    f('R601', -13.8, -3.6, 90)     # I2C0 pull-ups
    f('R602', -14.9, -3.6, 90)
    # IO expander: P0..P3 (LCD_CS, SCK, SDA, RST) on its left side, towards the connector
    put('U602', 57.4, 59.6, 0)
    put('C608', 59.6, 56.2, 0)
    # backlight boost in a column right of the connector: input cap, inductor, driver, diode, output caps
    put('C605', 59.5, 63.7, 0)     # boost input
    put('L601', 59.5, 66.4, 90)    # +5V on top, switch node towards the driver
    put('U601', 58.9, 70.4, 90)
    put('D601', 61.2, 70.4, 90)
    put('R603', 57.2, 66.4, 90)    # current sense
    put('C606', 60.6, 73.6, 0)
    put('C607', 60.6, 75.2, 0)
    put('R604', 57.4, 73.4, 0)     # CTRL pull-down

    # =================================================== Wi-Fi module (top left)
    put('U301', 22.0, 11.3, 0)
    put('C301', 12.4, 9.4, 90)
    put('C302', 14.2, 7.4, 90)
    put('R301', 13.0, 13.4, 0)
    put('C303', 13.0, 14.4, 0)
    put('R302', 13.0, 15.4, 0)
    put('R303', 24.4, 18.6, 0)     # IO8 pull-up
    for i, ref in enumerate(('R305', 'R306', 'R307', 'R308', 'R309')):
        put(ref, 30.6 + i * 1.1, 19.4, 90)

    # ================================================ supply: 3.3 V buck (top centre)
    put('C105', 44.6, 24.6, 90)
    put('C106', 46.8, 24.6, 90)
    put('C107', 44.4, 27.4, 0)
    put('R106', 46.6, 27.4, 0)
    put('U103', 49.6, 24.6, 180)
    put('C108', 49.6, 27.4, 0)
    put('L101', 54.2, 24.6, 0)
    put('C109', 58.2, 24.4, 90)
    put('C110', 60.4, 24.4, 90)
    put('C111', 58.6, 27.4, 0)

    # ====================== supply: DC input converter (left column, away from the NFC loop)
    c = rel(DCDC)
    c('U104', 0, 0, 180)
    c('C112', -5.9, 0, 270)        # input capacitors, VDC on top
    c('C113', -3.3, 0, 270)
    c('R103', -3.0, 3.2, 0)        # EN pull-up
    c('C114', 0, 2.8, 0)           # bootstrap
    c('L102', 4.6, 0, 0)
    c('C115', 8.6, -0.2, 90)
    c('C116', 10.8, -0.2, 90)
    c('R105', 10.8, 2.55, 270)     # bleed resistor, +5V_DC on top, straight below C116
    c('D107', 15.4, 0, 180)        # OR diode, +5V on the right

    # ========= USB-C: service port only, at the right board edge next to the MCU's USB pins
    u = rel((82.3, 18.0))
    u('J101', 0, 0, 90)            # opens to the right
    u('R101', -4.5, 2.2, 90)
    u('R102', -4.5, -2.2, 90)
    u('U101', -7.4, 0, 90)
    u('F101', -9.2, -4.2, 180)
    u('D101', -13.2, 0.8, 180)
    u('FB101', -14.2, -2.8, 180)
    u('C101', -18.2, -2.6, 90)
    u('R104', -18.2, 0.1, 270)     # bleed resistor, +5V_USB on top, straight below C101
    u('D102', -21.4, -1.6, 90)     # USB OR diode

    # ===== DC input: both connectors at the top of the tongue's left margin. The jack opens downwards
    # into the second cut-away (see geometry.POCKET_X / POCKET_Y), so its plug stays inside the outline.
    put('J102', 8.05, 97.3, 90)    # barrel jack
    put('J103', 16.7, 100.2, 0)    # DC terminal, wires enter from below at 40 degrees; + on the left
    # fuse, reverse-polarity diode, input filter and TVS next to the converter, in the left column behind
    # the display. From the bottom up: fuse, diode, filter (inductor on the left, its capacitor on the
    # right), TVS, converter.
    put('F102', 5.5, 85.5, 0)
    put('D105', 5.5, 81.4, 0)
    put('L103', 3.3, 78.5, 90)     # VDC_R below (at the diode's cathode), VDC on top
    put('C117', 7.0, 78.5, 0)      # VDC_R on the left
    put('D106', 5.5, 75.6, 0)

    # ===================================================== Ethernet and PoE (right)
    put('J401', 76.8, G.JACK_Y, 90)  # opens downwards into the cut-away; all its pins are below the display
    put('U102', 76.5, 45.4, 270)   # secondary pins on the left, 48 V pins on the right
    # The two beads and everything else at 48 V stay clear of the jack's metal shell, which ends at
    # y = 71.3 at most (geometry.JACK_REAR_CLEAR_Y).
    put('D103', 82.6, 62.0, 90)    # PoE TVS, cathode at the bottom
    put('FB102', 81.24, 67.15, 90)  # straight above jack pin 9
    put('FB103', 83.9, 67.15, 90)
    put('C102', 80.6, 32.4, 180)   # 1 nF / 2 kV across the barrier
    put('C103', 72.6, 30.7, 0)     # 100u PoE output (+ pad above the module output pins)
    put('C104', 72.6, 25.4, 0)
    put('D104', 64.4, 31.4, 0)     # PoE OR diode, +5V on the left
    e = rel(PHY)
    e('U401', 0, 0, 180)           # MDI pins face right (jack), crystal pins up
    # above the PHY: crystal, RMII strap, TXER pull-down
    e('Y401', 4.3, -5.2, 180)
    e('C407', 1.5, -4.35, 180)     # X2
    e('C406', 7.2, -6.05, 0)       # X1
    e('R402', 0.0, -4.6, 270)      # RMII strap
    e('R406', 4.4, -2.3, 0)        # TXER pull-down
    e('C402', 4.4, -1.2, 0)        # AVDD33 (pin 31)
    # right of the PHY, between the two pairs: regulator output capacitors
    e('C405', 6.2, 0.6, 0)
    e('C404', 6.5, 2.0, 0)
    e('R401', 2.4, 3.6, 270)       # ISET
    # left of the PHY
    # 1.3 mm apart, so a track can leave between two of them
    e('R404', -4.6, -1.95, 0)      # address bit 0 (pin 11)
    e('R405', -4.6, -0.65, 180)    # address bit 3 (pin 12)
    e('C403', -4.6, 0.65, 180)     # VDDIO (pin 13)
    e('R407', -4.6, 1.95, 180)     # 50 MHz series (pin 14)
    e('FB401', -4.6, 6.8, 90)
    e('C401', -3.3, 6.8, 270)
    # below the PHY, in pin order: series resistors of the receive signals, LED mode strap
    e('R409', -2.7, 4.3, 270)
    e('R408', -1.6, 4.3, 270)
    e('R410', -0.5, 4.3, 270)
    e('R403', 0.6, 4.3, 90)
    yj = G.JACK_Y - 6.49                # first pin row of the jack
    put('C408', 73.63, yj - 4.06, 90)  # RX centre tap, straight above jack pin 3, clear of the jack's shell
    put('C409', 74.89, yj - 4.06, 90)  # TX centre tap, above jack pin 4
    put('R411', 64.6, 83.6, 90)        # yellow LED: at the PHY's side of the long run to the jack
    put('R412', 67.0, 107.2, 180)      # green LED to ground: left of the jack, level with its LED pins
    put('C410', 69.05, 86.6, 90)       # shield to ground, straight above the jack's left shield tab
    put('R413', 66.6, 86.6, 90)

    # ================================================= NFC (tongue, left margin)
    put('ANT501', G.ANT_C[0], G.ANT_C[1], 0)
    n = rel(NFC)
    # The PN532 block is a column between the DC cut-away and the antenna. The chip is turned so that
    # its transmitter pins face up, the crystal pins left, the host pins down and reset/VBAT right.
    n('U501', 0, 0, 180)
    # transmitter chains, straight up to the antenna feeds: TX2 on the left, TX1 on the right
    n('L502', -1.5, -6.2, 90)
    n('C516', -3.4, -7.7, 180)
    n('C517', -1.5, -9.2, 90)
    n('C518', -3.4, -10.3, 180)
    n('C519', -3.4, -11.4, 180)
    n('R505', -1.5, -12.0, 90)
    n('L501', 1.5, -6.2, 90)
    n('C512', 3.4, -7.7, 0)
    n('C513', 1.5, -9.2, 90)
    n('C514', 3.4, -10.3, 0)
    n('C515', 3.4, -11.4, 0)
    n('R504', 1.5, -12.0, 90)
    n('C508', 0.0, -5.3, 90)       # TVDD, between the two chains
    n('C507', 5.1, -9.5, 90)
    n('FB503', 5.1, -6.2, 90)
    # left strip, top to bottom: AVDD supply, receive path
    n('FB502', -5.4, -12.6, 0)
    n('C505', -5.4, -11.4, 180)
    n('C506', -5.4, -10.3, 180)
    n('C521', -5.4, -9.2, 180)
    n('R507', -5.4, -8.1, 0)
    n('C520', -5.4, -7.0, 0)
    n('R506', -5.4, -5.9, 180)
    # crystal on the left of the chip
    n('Y501', -5.4, -0.5, 270)
    n('C510', -6.25, -3.3, 90)
    n('C511', -4.55, 2.3, 270)
    # right strip: VBAT, DVDD, reset
    n('C502', 4.7, -2.8, 0)
    n('C504', 4.7, -1.7, 0)
    n('R503', 4.7, -0.6, 0)
    # below the chip: host interface, bulk capacitors
    n('C509', -1.25, 4.8, 270)
    n('R501', 0.75, 5.0, 90)
    n('R502', 1.85, 5.0, 90)
    n('C503', 4.4, 4.6, 0)
    n('C501', 4.4, 6.2, 0)
    n('FB501', 4.4, 7.8, 0)

    # ========================================================= LEDs and buzzer
    # level shifter for the LED data line, in the left column behind the display
    put('U701', 9.0, 61.2, 180)
    put('C701', 6.0, 61.6, 90)
    put('R701', 12.0, 60.2, 0)
    put('C702', 3.0, 61.2, 0)
    xs = G.LED_X
    for i, x in enumerate(xs):                       # top row, left to right
        put('D%d' % (701 + i), x, G.LED_Y_TOP, 0)
        put('C%d' % (703 + i), x + 4.6, G.LED_Y_TOP - 0.6, 270)   # +5V pad on top, at the supply bus
    for i, x in enumerate(reversed(xs)):             # bottom row, right to left
        put('D%d' % (701 + len(xs) + i), x, G.LED_Y_BOT, 180)
        put('C%d' % (703 + len(xs) + i), x - 4.6, G.LED_Y_BOT + 0.6, 90)
    put('BZ701', 6.4, 52.0, 180)
    put('R702', 13.2, 48.4, 0)
    put('D%d' % (701 + 2 * len(G.LED_X)), 13.6, 52.0, 90)    # flyback diode: the D number after the LEDs
    put('Q701', 13.2, 56.6, 0)
    put('R703', 16.6, 55.6, 0)
    put('R704', 16.6, 57.6, 0)
    put('R705', 8.85, 63.75, 270)  # LED data pull-down, signal on top, below the level shifter

    # ============================================================ test points
    tps = {
        'TP801': (26.0, 24.6), 'TP802': (26.0, 27.8), 'TP803': (26.0, 31.0), 'TP804': (22.6, 27.8),
        'TP805': (57.0, 37.0), 'TP806': (14.6, 21.0), 'TP807': (14.6, 24.2), 'TP808': (14.6, 27.4),
        'TP809': (14.6, 30.6), 'TP810': (3.0, 9.6), 'TP811': (3.0, 12.8), 'TP812': (7.6, 9.6),
        'TP813': (7.6, 12.8),               # 4.6 mm apart: the labels C6_BOOT and C6_RX need that much
    }
    for ref, (x, y) in tps.items():
        put(ref, x, y, 0)
    for ref, (x, y) in zip(('H801', 'H802', 'H803', 'H804'), G.MOUNT_HOLES):
        put(ref, x, y, 0)
    put('FID801', 9.4, 2.4, 0)
    put('FID802', 76.6, 2.4, 0)
    put('FID803', 67.0, 141.0, 0)
