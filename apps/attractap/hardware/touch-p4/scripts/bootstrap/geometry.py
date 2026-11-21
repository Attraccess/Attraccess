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
LCD_GROUND_PADS = ((11.5, 38.0), (66.0, 38.0), (48.0, 17.0), (43.0, 80.0))
LCD_GROUND_PAD = 5.0

# Slot the display flex passes through, directly below the LCD module edge
SLOT = (11.5, 89.5, 62.0, 92.5)
# Cut-away corner that leaves room for the Ethernet plug and cable. The jack sits above it, below the
# display: its through-hole pins stand 1.5 to 2 mm out of the display side of the board, and the
# display's metal back lies at most 1 mm from the board. So every pin of the jack is below the lower
# edge of the cover lens (LENS), not behind the display.
NOTCH_X = 69.5
NOTCH_Y = 111.8
JACK_Y = 98.8                              # footprint origin of the Ethernet jack J401; its pin rows: 92.3 and 94.85
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
# (beside the module from x = 77.9; further down the strip is narrower, which leaves the ground plane
# under the Ethernet pair that runs down next to it)
POE_PRIMARY = [(77.9, 35.0, 86.0, 57.0), (78.4, 57.0, 86.0, 71.0), (78.9, 71.0, 86.0, 97.3), (79.0, 30.6, 86.0, 35.0)]
# Under the PoE module the isolation barrier does not run at the pin row but under the module body:
# 2.3 mm from the output pin row at the pin 1/2 end, 5.3 mm at the pin 3/4 end (Silvertel Ag9900
# datasheet, figure 23). No copper from that line to the 48 V pins. Corner points, clockwise.
POE_UNDER_MODULE = [(71.8, 34.0), (77.9, 34.0), (77.9, 57.0), (74.8, 57.0)]
# Behind the jack: its metal shell reaches up to y = 90.3 (longest body, furthest back). No 48 V
# copper, no part and no Ethernet pair on the component side beyond this line: those pass under the
# rear wall of the shell on the back layer. (The centre-tap, LED and shield tracks do run under the
# shell on the component side; a contact between them and the shell would do no harm.)
JACK_REAR_CLEAR_Y = 89.3
# Where the autorouter must not go (the hand-routed 48 V tracks live here)
POE_ROUTER_KEEPOUT = [(77.95, 35.0, 86.0, 71.0), (78.95, 71.0, 86.0, 90.7), (79.0, 30.6, 86.0, 35.0),
                      (79.6, 90.7, 86.0, 97.9)]
# The 3.3 V plane reaches down under the left part of the jack (not the 48 V side) for its LED supply
# pin and as the reference under the Ethernet pairs on the back layer: x1, x2, y2
PLANE_3V3_JACK = (67.0, 77.5, 108.5)

MOUNT_HOLES = ((4.0, 3.5), (82.0, 3.5), (17.9, 139.4), (66.3, 117.0))
MOUNT_KEEPOUT_R = 3.3                       # screw head / standoff: no tracks on the outer layers

# The 3.3 V plane (In2) covers the display area and reaches the NFC parts left of the antenna: (x, y) corner
PLANE_3V3_TONGUE = (25.3, 136.6)
