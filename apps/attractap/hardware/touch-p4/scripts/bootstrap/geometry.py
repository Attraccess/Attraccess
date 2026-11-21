"""Board geometry shared by the placement and the board builder.

Coordinates are millimetres in KiCad's top view of F.Cu: x to the right, y down.
F.Cu is the component side and faces the wall (product back). B.Cu carries the
NFC loop and faces the user; the display is taped onto that side.
"""

BOARD_W = 86.0
BOARD_H = 143.5
ORIGIN = (60.0, 30.0)          # where the board's top-left corner sits on the KiCad sheet

# Display (cover lens 84.3 x 84.3, centred on the board width)
LENS = (0.85, 7.0, 85.15, 91.3)            # x1, y1, x2, y2
LCM = (5.6, 12.8, 80.4, 89.4)              # metal-backed LCD module behind the lens

# Bare ground pads on the display side, behind the LCD module: for conductive tape or foam that ties
# the LCD's metal back to ground (centre x, y; each LCD_GROUND_PAD mm square). They are openings in
# the solder mask over the ground fill, placed where that fill has no track and no via.
LCD_GROUND_PADS = ((13.5, 18.5), (66.0, 38.0), (48.0, 17.0), (43.0, 80.0))
LCD_GROUND_PAD = 5.0

# Slot the display flex passes through, directly below the LCD module edge
SLOT = (11.5, 89.5, 62.0, 92.5)
# Cut-away corner that leaves room for the Ethernet plug and cable: 51 mm from the jack to the lower
# board edge, for a plug with its boot (30 mm) and the cable's bend into the wall behind it. That
# length puts the jack behind the lower right corner of the display. Its through-hole pins stand out
# of the display side of the board there (JACK_PIN_OUT), so the display has to keep its distance:
# see DISPLAY_GAP.
NOTCH_X = 69.5
NOTCH_Y = 92.5
JACK_Y = 79.5                              # footprint origin of the Ethernet jack J401; its pin rows: 73.0 and 75.55
JACK_X = 76.8
# Pins of the jack as offsets from its origin (x across the jack, y towards its opening), from the
# footprint: the two 48 V pins and everything that sticks out of the display side of the board.
JACK_PINS_48V = ((4.44, -6.49), (5.72, -3.95))                       # pin 9 (+) and pin 10 (-)
JACK_PINS_OTHER = tuple((-5.72 + 1.27 * k, -6.49 if k % 2 == 0 else -3.95) for k in range(8)) + (
    (-6.63, 6.49), (-4.09, 6.49), (4.09, 6.49), (6.63, 6.49),        # LED pins 11 to 14
    (-7.75, -0.65), (7.75, -0.65), (-5.7, 2.4), (5.7, 2.4))          # shield tabs, plastic posts
JACK_PIN_OUT = (1.45, 1.9)     # how far they stand out of a 1.6 mm board: 3.05 mm is the datasheet's minimum length
# Distance between the display side of the board and the LCD module's metal back. The upper limit comes
# from the display's flex: it wraps round the upper slot edge onto the component side, and the stiff
# parts of its two tails (touch controller 6.4 mm, components 4.8 mm from the module edge) must lie
# flat behind the board after the turn. The lower limit comes from the jack's pins: clipped to 1 mm
# after soldering they clear the metal back at this distance; unclipped they may touch it.
DISPLAY_GAP = (1.5, 2.0)
JACK_PIN_CLIPPED = 1.0
# Second cut-away in the other bottom corner, for the DC plug: everything with x < POCKET_X and
# y > POCKET_Y is cut away. The DC jack sits above it and opens into it.
POCKET_X = 12.0
POCKET_Y = 107.5

# Area on the component side covered by the folded display flex: no tall parts here
FLEX_KEEPOUT = [(11.5, 76.0, 62.0, 89.5), (32.5, 66.0, 55.5, 76.0)]

# NFC loop antenna centre (footprint ANT501)
ANT_C = (44.5, 117.0)
ANT_W, ANT_H = 35.0, 37.0

# Addressable LEDs (reverse mount, shine through the board): centre x positions and the two rows
LED_X = (29.5, 39.5, 49.5, 59.5)
LED_Y_TOP = 95.6
LED_Y_BOT = 139.0
LED_WINDOW = (3.4, 3.0)                     # cut-out per LED; it is part of the LED footprint
LED_CUTOUT = (3.64, 3.24)                   # the same including the corner reliefs: what is really milled away

# Wi-Fi module antenna: no copper on any layer in this rectangle. The module (x 15.4 to 28.6) should
# have 15 mm free of copper on each side of its antenna; to the left the board ends before that.
C6_KEEPOUT = (0.0, 0.0, 44.0, 6.0)
# The board is cut away under the module's antenna (13.2 x 5.4 mm), as Espressif asks for when the
# antenna cannot stand out over the board edge: x1, x2 and depth of the cut in the top edge.
C6_NOTCH = (14.9, 29.1, 5.65)

# PoE primary side (48 V, isolated from everything else): no secondary copper in here
POE_PRIMARY = [(77.9, 35.0, 86.0, 78.0), (79.0, 30.6, 86.0, 35.0)]
# Under the PoE module the isolation barrier does not run at the pin row but under the module body:
# 2.3 mm from the output pin row at the pin 1/2 end, 5.3 mm at the pin 3/4 end (Silvertel Ag9900
# datasheet, figure 23). No copper from that line to the 48 V pins. Corner points, clockwise.
POE_UNDER_MODULE = [(71.8, 34.0), (77.9, 34.0), (77.9, 57.0), (74.8, 57.0)]
# Behind the jack: its metal shell reaches up to y = 71.0 (longest body, furthest back). No 48 V
# copper, no part and no Ethernet pair on the component side beyond this line: the 48 V nets pass
# under the rear wall of the shell on an inner layer, the Ethernet pairs on the back layer. (The
# centre-tap, LED and shield tracks do run under the shell on the component side; a contact between
# them and the shell would do no harm.)
JACK_REAR_CLEAR_Y = 70.0
# Where the autorouter must not go (the hand-routed 48 V tracks live here)
POE_ROUTER_KEEPOUT = [(77.95, 35.0, 86.0, 71.4), (79.0, 30.6, 86.0, 35.0), (79.6, 71.4, 86.0, 78.6)]

MOUNT_HOLES = ((4.0, 3.5), (82.0, 3.5), (17.9, 139.4), (66.3, 117.0))
# Hall switch U703 that senses the magnet in the dock: the magnet sits in front of this point, on the
# component side. Free board area away from the buzzer (15 mm) and the inductors (22 mm and more).
HALL = (12.5, 38.2)
MOUNT_KEEPOUT_R = 3.3                       # screw head / standoff: no tracks on the outer layers

# The 3.3 V plane (In2) covers the display area and reaches the NFC parts left of the antenna: (x, y) corner
PLANE_3V3_TONGUE = (25.3, 136.6)
