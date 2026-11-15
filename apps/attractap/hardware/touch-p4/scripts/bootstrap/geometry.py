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

# Slot the display flex passes through, directly below the LCD module edge
SLOT = (11.5, 89.5, 62.0, 92.5)
# Cut-away corner that leaves room for the Ethernet plug and cable
NOTCH_X = 69.5
NOTCH_Y = 92.5
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
LED_WINDOW = (3.4, 3.0)                     # cut-out size per LED

# Wi-Fi module antenna: no copper on any layer in this rectangle
C6_KEEPOUT = (12.0, 0.0, 32.0, 6.0)

# PoE primary side (48 V, isolated from everything else): no secondary copper in here
POE_PRIMARY = [(77.9, 35.0, 86.0, 78.0), (79.0, 30.6, 86.0, 35.0)]
# Where the autorouter must not go (the hand-routed 48 V tracks live here)
POE_ROUTER_KEEPOUT = [(77.95, 35.0, 86.0, 71.4), (79.0, 30.6, 86.0, 35.0), (79.6, 71.4, 86.0, 78.6)]

MOUNT_HOLES = ((4.0, 3.5), (82.0, 3.5), (17.9, 139.4), (66.3, 117.0))
MOUNT_KEEPOUT_R = 3.3                       # screw head / standoff: no tracks on the outer layers

# The 3.3 V plane (In2) covers the display area and reaches the NFC parts left of the antenna: (x, y) corner
PLANE_3V3_TONGUE = (25.3, 136.6)
