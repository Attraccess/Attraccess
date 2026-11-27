"""Component placement for the Attractap Touch P4 board.

``place(B)`` positions every footprint. ``B`` is the board helper from
build_pcb.py: ``B.put(ref, x, y, rot)`` places a part.
All coordinates are board millimetres (see geometry.py), rotations in degrees
counter-clockwise. Passive pad 1 is at -x for rotation 0, at +y (below) for 90.
"""
import math

import geometry as G

MCU = (43.0, 50.0)          # ESP32-P4 centre
FPC = (43.85, 67.7)         # display connector origin
PHY = (67.6, 64.6)          # Ethernet PHY centre
DCDC = (9.0, 70.0)          # DC input converter (U104) centre
NFC = (21.5, 80.1)          # PN532 centre: below the display, above the LED ring's upper left corner


def led_refs():
    """(LED, its capacitor) in the order of the data line: the first eight are D701 to D708 with C703 to C710,
    the eight added for the ring come after the tamper parts on the sheet, D710 to D717 with C716 to C723."""
    return [('D%d' % (701 + k), 'C%d' % (703 + k)) if k < 8 else ('D%d' % (702 + k), 'C%d' % (708 + k))
            for k in range(len(G.LEDS))]


# In an LED's own frame (led_frame): its capacitor in the gap after it, and the 5 V via beside that on the line
# of the 5 V rail; for the LED before the gap in the copper round the loop, outside the ring instead
LED_CAP, LED_VIA = (4.6, -0.6), (4.6, -2.6)
LED_CAP_OUT, LED_VIA_OUT = (2.9, -2.45), (1.6, -2.6)
# The data line's carrier filter where it crosses that gap (circuit_io.GAP_LED): its resistor and capacitor, and
# the capacitor's place in the frame of the LED after the gap, beside that LED's data input (pin 2)
LED_FILTER = ('R709', 'C727')
LED_FILTER_C = (-2.775, -3.0)
# The second bulk capacitor of +5V_LED, beside the ring's left side, its + pad level with the rail's via line
LED_BULK_2 = (15.9, 113.3)


def led_gap_index():
    """The LED before the gap in the copper round the loop (geometry.NFC_GAP lies between it and the next)."""
    gy = (G.NFC_GAP[1] + G.NFC_GAP[3]) / 2
    for k, (x, y, rot) in enumerate(G.LEDS):
        _nx, ny, _r = G.LEDS[(k + 1) % len(G.LEDS)]
        if rot == 270 and x > G.NFC_GAP[0] and y < gy < ny:
            return k
    raise ValueError('no LED next to the gap')


def led_frame(k):
    """Board position of a point given in LED k's own frame: x along the ring in the data's direction, y
    towards the loop (negative: outside the ring)."""
    x, y, rot = G.LEDS[k]
    c, s = round(math.cos(math.radians(rot))), round(math.sin(math.radians(rot)))
    return lambda lx, ly: (x + lx * c + ly * s, y - lx * s + ly * c)


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
    # VDD_DCDCC 10u: in the corner beside pin 77, the row's last pin, 2 mm of track away; ground through a
    # via in the pad (filled and capped). There is room for one part there, between the regulator caps,
    # the converter's enable pull-down and the pad row.
    m('C208', -5.1, -6.75, 180)
    m('C211', -3.3, -10.8, 90)     # VDD_LDO 100n
    m('C227', -2.2, -10.8, 90)     # VDD_PSRAM 1u
    m('C229', -1.1, -10.8, 90)     # VDD_PSRAM_1
    m('C228', 0.0, -10.8, 90)      # VDD_PSRAM_0
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
    m('R204', -11.9, -5.65, 0)     # 499k VDD_HP - FB
    m('C236', -11.9, -4.65, 0)     # 22p feed-forward
    m('R205', -9.7, -4.65, 0)      # 499k FB - GND

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
    # 40 MHz crystal, 2.0 x 1.6 mm, turned 45 degrees: pad 3 (XTAL_N) faces the upper pin, pad 1 (XTAL_P) the
    # lower one, and the two lines pass either side of ground pad 2 (routes_mcu.crystal). The NFC lines' vias
    # above and the VDD_BAT parts below fix the spot; the body stands 4.75 mm from the package edge (Espressif's
    # layout guide asks for 4.5 mm at least). The load capacitors at the far ends of the lines, their ground
    # pads beside the crystal's ground pad 4.
    m('Y201', -11.02, 2.78, 45)
    m('C239', -12.75, 1.2, 270)    # XTAL_N, pad 1 above
    m('C238', -13.0, 4.4, 90)      # XTAL_P, pad 1 below
    # bottom-left corner: VDD_BAT, reset
    m('C214', -7.9, 5.0, 270)
    m('R201', -9.6, 4.6, 0)
    m('C213', -10.1, 6.0, 180)
    # reset pull-up and capacitor: left of the passage that TP_RST, TP_INT and the touch I2C lines need
    # between here and the first resistor array
    m('U204', -10.6, 11.2, 0)      # supervisor below the reset RC
    m('C241', -13.4, 11.2, 90)
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
    for ref, x in (('RN601', 38.15), ('RN602', 40.75), ('RN603', 43.35), ('RN604', 45.95), ('RN605', 48.55)):
        put(ref, x, FPC[1] - 6.0, 270)
    f('C601', 9.9, -3.8, 90)       # panel VCI
    f('C602', 11.0, -3.8, 90)
    f('C603', -11.1, -3.8, 90)     # touch VCI
    f('C604', -12.2, -3.8, 90)
    f('R601', -13.8, -3.6, 90)     # I2C0 pull-ups
    f('R602', -14.9, -3.6, 90)
    # ESD protection of the touch lines: left of the connector and its mounting tab, outside the area the
    # folded flex covers
    put('U603', 28.6, 68.4, 0)
    put('U604', 30.2, 74.2, 0)
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
    wx, wy = G.WIFI_MODULE
    put('U301', wx, wy, 0)         # antenna up, over the cut in the top edge (geometry.WIFI_NOTCH)
    # Its own 3.3 V converter in the column left of it, built like U103 (TI SLVSDG1C 10.2) and turned so that
    # the output ends at the module's 3V3 pin (pin 3, left side). The inductor's output pad and C301 (22 uF,
    # the converter's output capacitor and the module's at once) lie level with pin 3; C301's ground pad
    # faces the module's ground pins 1 and 2. The converter below the inductor, its switch pin straight under
    # the inductor's switch pad (turned 90 degrees: SW, GND, EN face up, VIN and FB down); the input
    # capacitors below VIN, the feedback divider below FB, away from the switch node.
    put('C301', wx - 8.8, wy - 5.3, 90)     # 22 uF: + pad down, level with pin 3; ground pad up, at pins 1 and 2
    put('L301', wx - 11.9, wy - 3.5, 90)    # output pad up, level with C301's + pad; switch pad down
    put('C302', wx - 8.8, wy - 2.3, 270)    # 100 nF under C301, + pad up
    put('U302', wx - 12.3, wy + 1.3, 90)
    put('R310', wx - 9.8, wy + 0.0, 180)    # EN pull-up beside the EN pin, the 5 V pad outwards
    put('C305', wx - 13.25, wy + 4.5, 270)  # 100 nF straight below VIN
    put('C304', wx - 15.6, wy + 3.7, 270)   # 10 uF beside it
    put('R311', wx - 9.8, wy + 2.1, 180)    # feedback divider beside and below FB, on the side away from SW
    put('C306', wx - 9.8, wy + 3.1, 180)
    put('R312', wx - 11.3, wy + 4.5, 270)
    # enable: RC and the host's series resistor right of the EN pin (right side, top, pin 45), in a column
    put('C303', wx + 9.3, wy - 5.95, 0)
    put('R301', wx + 9.3, wy - 4.7, 180)
    put('R302', wx + 9.3, wy - 3.45, 180)
    put('R303', wx + 9.3, wy - 2.2, 180)   # IO28 pull-up, on the way to the boot test point beside it
    # SDIO pull-ups in a column below the module's lower right corner, signal pad (2) on the left, 1 mm apart:
    # each sits at the end of its line's front-layer stub (routes_sdio.py), D2 at the top, D1 at the bottom
    for ref, dy in (('R308', 8.5), ('R309', 9.5), ('R305', 10.5), ('R306', 11.5), ('R307', 12.5)):
        put(ref, wx + 3.46, wy + dy, 180)

    # ================================================ supply: 3.3 V buck (top centre)
    # TI's layout (SLVSDG1C, 10.2): input capacitor at VIN and GND, the inductor right at SW, the feedback
    # divider at FB and away from SW. Turned 0 degrees the converter has VIN (4) and FB (5) on the left,
    # SW (3), GND (2) and EN (1) on the right, top to bottom.
    put('C105', 43.2, 24.6, 90)    # 22 uF on the 5 V rail
    put('C106', 46.2, 23.65, 180)  # input capacitor, its 5 V pad against VIN
    put('C107', 48.5, 22.15, 90)    # 100 nF straight above VIN
    put('U103', 49.8, 24.6, 0)
    put('R106', 52.4, 27.35, 180)  # EN pull-up below the inductor
    put('R112', 48.5, 27.1, 270)   # feedback divider below FB, on the side away from SW
    put('R111', 47.0, 26.59, 0)
    put('C108', 47.0, 27.6, 0)     # feed-forward capacitor across R111
    put('L101', 54.6, 24.6, 0)
    put('C109', 58.2, 24.4, 90)
    put('C111', 58.6, 27.4, 0)

    # ====================== supply: DC input converter (left column, away from the NFC loop)
    c = rel(DCDC)
    c('U104', 0, 0, 180)
    c('C112', -5.9, 0, 270)        # input capacitors, VDC on top
    c('C113', -3.3, 0, 270)
    c('R103', -3.0, 3.2, 0)        # EN divider, upper resistor
    c('R113', 3.6, 3.2, 0)         # EN divider, lower resistor (below the inductor)
    c('C114', 0, 2.8, 0)           # bootstrap
    c('L102', 4.6, 0, 0)
    c('C115', 8.6, -0.2, 90)
    c('C116', 10.8, -0.2, 90)
    c('R105', 10.8, 2.55, 270)     # bleed resistor, +5V_DC on top, straight below C116
    c('Q102', 15.4, 0, 90)         # ideal diode: MOSFET where the OR diode was, its controller below
    put('R116', 27.1, 72.2, 0)     # DC present: divider from the converter's output to the IO expander
    put('R117', 27.1, 73.8, 0)
    c('U107', 15.4, 4.0, 0)
    c('C121', 12.8, 4.0, 90)

    # ========= USB-C: service port only, at the right board edge next to the MCU's USB pins
    u = rel((82.3, 18.0))
    u('J101', 0, 0, 90)            # opens to the right
    u('R101', -4.5, 2.2, 90)
    u('R102', -4.5, -2.2, 90)
    u('U101', -7.4, 0, 90)
    u('F101', -9.2, -4.2, 180)
    u('D101', -14.0, 0.8, 180)      # (0.8 mm left of where it was: the USB pair's via beside the ESD part)
    u('FB101', -14.2, -2.8, 180)
    u('C101', -18.2, -2.6, 90)
    u('R104', -18.2, 0.1, 270)     # bleed resistor, +5V_USB on top, straight below C101
    u('U105', -21.7, -1.6, 180)    # USB eFuse where the OR diode was: IN on the right, OUT on the left
    u('R107', -20.1, -6.0, 90)     # UVLO/OVLO divider above it
    u('R108', -21.4, -6.0, 90)
    u('R109', -22.7, -6.0, 90)
    u('C118', -24.3, -3.0, 90)     # slew rate and current limit on its left
    u('R110', -24.3, -0.8, 90)

    # ===== DC input: both connectors at the top of the tongue's left margin. The jack opens downwards
    # into the second cut-away (see geometry.POCKET_X / POCKET_Y), so its plug stays inside the outline.
    # Both sit 1.0 and 1.2 mm further left than in the first layout: the LED ring's upper left LED needs the room.
    put('J102', 7.05, 97.3, 90)    # barrel jack
    put('J103', 15.5, 100.2, 0)    # DC terminal, wires enter from below at 40 degrees; + on the left
    # fuse, reverse-polarity diode, input filter and TVS next to the converter, in the left column behind
    # the display. From the bottom up: fuse, diode, filter (inductor on the left, its capacitor on the
    # right), TVS, converter.
    put('F102', 4.3, 86.7, 0)
    put('D105', 5.5, 83.0, 0)
    put('L103', 3.3, 79.8, 90)     # VDC_R below (at the diode's cathode), VDC on top
    put('C117', 7.0, 79.8, 0)      # VDC_R on the left
    # bidirectional TVS right of the fuse, below the diode, its body clear of the flex area (x < 11.5):
    # VDC_F at the top, ground below
    put('D107', 9.2, 88.4, 270)     # (its silkscreen clear of the slot's end and of F102's)
    put('D106', 5.5, 76.0, 0)      # SMB package: its outline ends right below the converter's enable pull-up
    # 47 uF electrolytic (7.7 mm high): above the flex area, between the converter and the proximity sensor
    put('C120', 17.8, 64.0, 0)

    # ===================================================== Ethernet and PoE (right)
    put('J401', G.JACK_X, G.JACK_Y, 90)  # opens downwards into the cut-away
    put('U102', 76.5, 45.4, 270)   # secondary pins on the left, 48 V pins on the right
    # The two beads and everything else at 48 V stay clear of the jack's metal shell, which ends at
    # y = 71.0 at most (geometry.JACK_REAR_CLEAR_Y).
    put('D103', 82.6, 62.0, 90)    # PoE TVS, cathode at the bottom
    put('FB102', 81.24, 67.15, 90)  # straight above jack pin 9
    put('FB103', 83.9, 67.15, 90)
    put('C102', 81.2, 32.4, 180)   # 1 nF Y2 across the barrier, 48 V pad on the right
    put('C103', 72.6, 30.7, 0)     # 100u PoE output (+ pad above the module output pins)
    put('C104', 72.6, 25.4, 0)
    put('Q101', 64.4, 31.4, 90)    # PoE ideal diode where the OR diode was, its controller below
    put('R118', 66.5, 28.6, 0)     # PoE present: divider from the module's output to the IO expander
    put('R119', 64.4, 28.2, 0)
    put('U106', 64.4, 35.2, 0)
    put('C119', 61.8, 35.2, 90)
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
    put('R411', 64.6, 83.6, 90)
    put('R412', 66.2, 83.6, 90)
    put('C410', 66.6, 76.6, 90)        # shield to ground, 1 nF 3 kV
    put('R413', 63.9, 76.6, 90)

    # ================================================= NFC (below the display, left of the flex)
    put('ANT501', G.ANT_C[0], G.ANT_C[1], 0)
    n = rel(NFC)
    # The PN532 block sits in the free strip between the display's lower part and the LED ring, its
    # transmitter pins facing down to the antenna feeds at the ring's upper left corner: the crystal pins
    # right, the host pins up, reset/VBAT left. (Until the LED ring it sat beside the loop, the same block
    # turned by 180 degrees.)
    n('U501', 0, 0, 0)
    # transmitter chains, straight down to the antenna feeds: TX1 on the left, TX2 on the right
    n('L501', -1.5, 6.2, 270)
    n('C512', -3.4, 7.7, 180)
    n('C513', -1.5, 9.2, 270)
    n('C514', -3.4, 10.3, 180)
    n('C515', -3.4, 11.4, 180)
    n('R504', -1.5, 12.0, 270)
    n('L502', 1.5, 6.2, 270)
    n('C516', 3.4, 7.7, 0)
    n('C517', 1.5, 9.2, 270)
    n('C518', 3.4, 10.3, 0)
    n('C519', 3.4, 11.4, 0)
    n('R505', 1.5, 12.0, 270)
    n('C508', 0.0, 5.3, 270)       # TVDD, between the two chains
    n('C507', -5.1, 9.5, 270)
    n('FB503', -5.1, 6.2, 270)
    # right strip, top to bottom: AVDD supply, receive path
    n('FB502', 5.4, 12.6, 180)
    n('C505', 5.4, 11.4, 0)
    # AVDD 100 nF: at the head of the strip, 4 mm from the chip's AVDD pin (pin 8). The band right below
    # that pin is taken by the transmitter's vias and the VMID and TVDD tracks.
    n('C506', 5.4, 4.8, 0)
    n('C521', 5.4, 9.2, 0)
    n('R507', 5.4, 8.1, 180)
    n('C520', 5.4, 7.0, 180)
    n('R506', 5.4, 5.9, 0)
    # crystal on the right of the chip
    n('Y501', 5.4, 0.5, 90)
    n('C510', 6.25, 3.3, 270)
    n('C511', 4.55, -2.3, 90)
    # left strip: VBAT, DVDD, reset
    n('C502', -4.7, 2.8, 180)
    n('C504', -4.7, 1.7, 180)
    n('R503', -4.7, 0.6, 180)
    # above the chip: the host lines' pull-ups and the PVDD capacitor (beside them: the 3.3 V converter's
    # parts above leave no room for it in the row)
    n('R501', -0.75, -5.0, 270)
    n('R502', -1.85, -5.0, 270)
    n('C509', 2.4, -3.85, 0)
    # bulk capacitors and the supply's ferrite in a column on the left
    n('C501', -7.9, 1.9, 90)
    n('C503', -7.9, 5.1, 90)
    n('FB501', -7.9, 8.3, 90)

    # ========================================================= LEDs and buzzer
    # The LED supply: level shifter and current-limited switch in a row in the strip between the display's flex
    # slot and the ring's top side, the bulk capacitor right above the ring's 5 V vias there. The level shifter
    # (pins up: input; down: output and supply) on the left, towards LED 0's data input, right of the labels of
    # the NFC supplies' test points.
    put('U701', 37.6, 88.0, 90)
    put('C701', 38.55, 90.85, 270)  # supply pad straight below the supply pin
    put('R701', 36.65, 90.85, 270)  # series resistor below the output, on to LED 0
    put('R705', 37.6, 85.15, 90)   # LED data pull-down above the input
    # switch turned so its input faces left and its output right: input capacitor beside the input (the enable
    # pin, two below, is tied to it), the limit resistor beside ILIM
    put('U705', 43.4, 88.6, 270)
    put('C724', 40.4, 87.65, 180)
    put('R708', 46.4, 88.6, 0)
    put('C725', 52.6, 89.2, 0)     # 100 uF, + on the left towards the switch's output
    # the second 100 uF in the free strip between the DC cut-away and the ring's left side (5.4 mm tall under the
    # dock plate's 13.9), between two of the ring's 5 V vias, + down
    put('C726', *LED_BULK_2, 90)
    put('C702', 3.0, 61.2, 0)      # 5 V rail at the buzzer
    # the ring (geometry.LEDS) in the data line's order, each capacitor in the gap after its LED, across the
    # ring, its 5 V pad outside; the LED before the gap in the copper round the loop has it outside the ring
    gap = led_gap_index()
    for k, ((ref, cref), (x, y, rot)) in enumerate(zip(led_refs(), G.LEDS)):
        put(ref, x, y, rot)
        if k == gap:
            put(cref, *led_frame(k)(*LED_CAP_OUT), rot)
        else:
            put(cref, *led_frame(k)(*LED_CAP), (rot + 270) % 360)
    # the carrier filter of the data line across the gap: the resistor in the gap, in line with the data output
    # of the LED before it (pin 1 towards it), the capacitor beside the next LED's data input, pin 1 towards it
    x, y, rot = G.LEDS[gap]
    put(LED_FILTER[0], *led_frame(gap)(G.LED_PITCH / 2, 0.75), rot)
    put(LED_FILTER[1], *led_frame(gap + 1)(*LED_FILTER_C), (rot + 90) % 360)
    put('BZ701', 6.4, 52.0, 180)
    put('R702', 13.2, 48.4, 0)
    put('D709', 13.6, 52.0, 90)    # flyback diode
    put('Q701', 13.2, 56.6, 0)
    put('R703', 16.6, 55.6, 0)
    put('R704', 16.6, 57.6, 0)

    # ================================== tamper detection, in the free area left of the MCU
    hx, hy = G.HALL
    put('U703', hx, hy, 0)                 # hall switch, facing the magnet in the dock
    put('C713', hx - 3.1, hy - 0.95, 180)  # 3.3 V pad towards the switch's supply pin
    put('U702', 6.0, 41.6, 0)              # accelerometer: supply pins on the right, bus pins on the left
    put('C711', 8.3, 41.35, 0)             # 100 nF straight beside the supply pins
    put('C712', 6.9, 43.85, 180)           # 10 uF below, ground pad under the accelerometer's ground pins
    put('R706', 2.75, 41.85, 0)            # address pull-up, level with the accelerometer's SA0 pin
    px, py = G.PROX
    put('U704', px, py, 90)                # proximity sensor: emitter end up, bus pins lower left
    put('C714', px + 2.9, py - 0.54, 0)    # 100 nF beside the supply pin
    put('C715', px + 1.2, py - 3.5, 180)   # 10 uF above the emitter's anode pin, 3.3 V pad on the right
    put('R707', px - 1.0, py - 5.65, 0)    # interrupt pull-up above the test point

    # ============================================================ test points
    tps = {
        'TP801': (22.6, 24.4), 'TP802': (26.0, 27.8), 'TP803': (26.0, 31.0), 'TP804': (22.6, 27.8),
        'TP805': (57.0, 37.0), 'TP806': (14.6, 21.0), 'TP807': (14.6, 24.2), 'TP808': (14.6, 27.4),
        'TP809': (14.6, 30.6),
        # the Wi-Fi module's, right of it: EN and BOOT above, TX and RX below, ground beside them
        'TP810': (41.1, 9.6), 'TP811': (45.7, 9.6), 'TP812': (41.1, 12.8),
        'TP813': (45.7, 12.8),              # 4.6 mm apart: the labels C5_BOOT and C5_RX need that much
        'TP832': (50.3, 11.2),
        'TP814': (5.75, 38.6),              # accelerometer INT1, straight above its pin 12
        'TP815': (G.PROX[0] - 1.7, G.PROX[1] - 3.8),   # proximity sensor INT, up and left of its pin 6
        # 1 mm pads on every rail, both I2C buses and the RMII clock, each next to its circuit
        'TP816': (13.0, 75.5), 'TP817': (16.0, 75.5), 'TP818': (66.5, 11.0), 'TP819': (66.5, 26.2),
        'TP820': (59.0, 46.5), 'TP821': (30.2, 86.0), 'TP822': (30.2, 88.6), 'TP823': (30.2, 83.4),
        'TP824': (61.0, 78.0), 'TP825': (26.5, 63.0), 'TP826': (26.5, 65.5), 'TP827': (58.6, 87.6),
        'TP828': (58.6, 90.2), 'TP829': (57.0, 84.5), 'TP830': (61.2, 80.8),
        'TP831': (G.WIFI_MODULE[0] - 17.2, 9.0),          # the Wi-Fi module's rail, left of its inductor
    }
    for ref, (x, y) in tps.items():
        put(ref, x, y, 0)
    for ref, (x, y) in zip(('H801', 'H802', 'H803', 'H804'), G.MOUNT_HOLES):
        put(ref, x, y, 0)
    put('FID801', 3.0, 9.6, 0)     # below the upper left hole: the cut under the Wi-Fi antenna takes the corner
    put('FID802', 76.6, 2.4, 0)
    put('FID803', 67.0, 141.0, 0)
    # local fiducials for the 0.35 mm pitch MCU, at two opposite corners of its package
    put('FID804', 29.9, 47.4, 0)
    put('FID805', 51.2, 59.8, 0)


# Parts low enough to lie under the folded display flex (0.35 to 0.9 mm high). J601 is where the flex ends.
FLEX_LOW = ('R_0201', 'C_0201', 'R_0402', 'C_0402', 'R_0603', 'C_0603', 'L0603', 'R_1206', 'R_Array_Convex_4x0402',
            'TestPoint', 'Fiducial')


def check_flex_area(board):
    """Parts whose body (fabrication outline, else courtyard) reaches into geometry.FLEX_KEEPOUT and are not on
    the FLEX_LOW list: the folded flex lies on whatever stands there. Returns [(ref, footprint)]."""
    import pcbnew
    bad = []
    for fp in board.GetFootprints():
        if fp.GetLayer() != pcbnew.F_Cu or fp.GetReference() == 'J601':
            continue
        name = fp.GetFPID().GetLibItemName().wx_str()
        fab = [g.GetBoundingBox() for g in fp.GraphicalItems() if g.GetLayer() == pcbnew.F_Fab and g.GetClass() == 'PCB_SHAPE']
        cy = fp.GetCourtyard(pcbnew.F_CrtYd)
        bb = fab[0] if fab else cy.BBox() if cy.OutlineCount() else fp.GetBoundingBox(False)
        for f in fab[1:]:
            bb.Merge(f)
        x1, y1 = pcbnew.ToMM(bb.GetLeft()) - G.ORIGIN[0], pcbnew.ToMM(bb.GetTop()) - G.ORIGIN[1]
        x2, y2 = pcbnew.ToMM(bb.GetRight()) - G.ORIGIN[0], pcbnew.ToMM(bb.GetBottom()) - G.ORIGIN[1]
        if any(x1 < kx2 and x2 > kx1 and y1 < ky2 and y2 > ky1 for kx1, ky1, kx2, ky2 in G.FLEX_KEEPOUT) and \
                not name.startswith(FLEX_LOW):
            bad.append((fp.GetReference(), name))
    return bad

