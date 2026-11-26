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
LCD_GROUND_PADS = ((12.0, 23.5), (64.2, 37.2), (48.0, 17.0), (43.0, 80.0))
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

# Wi-Fi module ESP32-C5-MINI-1 (datasheet v1.4, fig. 11-1): 15.4 mm wide, 21.3 mm long; its pads centred
# 7.7 mm above its lower edge, its antenna area the 5.85 mm at the other end. Placed antenna up at the top
# edge: (x, y) of the pad centre, the body's top 0.3 mm inside the board edge.
WIFI_MODULE = (27.8, 13.9)
WIFI_W, WIFI_TOP, WIFI_BOTTOM, WIFI_ANT = 15.4, 13.6, 7.7, 7.75   # width; top, bottom, antenna boundary from the centre
# ESP32-C5 HDG 1.4.7: the antenna beyond the board edge, or, where it cannot be, the board cut away on both
# sides of the antenna and below it, the antenna's ground point (its right end) close to the board edge. The
# case keeps the antenna inside the board outline, so the board is cut: x1, x2 and depth of the cut in the
# top edge. Its floor lies 0.15 mm above the antenna's lower boundary (fig. 23: at most 1 mm away); it
# reaches 2 mm beyond the module on the right ("Max 2") and 11.5 mm on the left, the open end's side,
# where fig. 23 asks for 15 mm and the upper left mounting hole stops it.
WIFI_NOTCH = (8.6, 37.5, 6.0)
# No copper on any layer here: the antenna area and 15 mm beside it on both sides, down to 0.2 mm above
# the module's top row of pads (6.5).
WIFI_KEEPOUT = (0.0, 0.0, 50.5, 6.3)

# PoE primary side (48 V, isolated from everything else): no secondary copper in here, on any layer. The
# second rectangle ends 3.1 mm above the 48 V pad of C102, the first 3.1 mm left of the filtered 48 V track
# beside the module, as far as the 3 mm isolation rule keeps copper on one layer: the pours of the other
# layers lie above and below that copper, and the clearance rule only looks at copper on one layer.
POE_PRIMARY = [(77.3, 35.0, 86.0, 78.0), (79.0, 27.8, 86.0, 35.0),
               (77.3, 33.0, 79.0, 35.0)]       # the step between them, 3 mm from the module's pin 8 corner
# The barrier capacitor C102 is a Y2 safety capacitor in the 2211 case (Murata GA352, 5.7 x 2.8 mm, at
# least 4.0 mm between its terminations). Its land pattern keeps the 4.5 mm gap of Murata's test board:
# pads 1.2 x 3.0 mm, centres 2.85 mm either side of the part's origin.
BARRIER_CAP_PAD = (1.2, 3.0)
BARRIER_CAP_PAD_X = 2.85
# Under the PoE module the isolation barrier does not run at the pin row but under the module body:
# 2.3 mm from the output pin row at the pin 1/2 end, 5.3 mm at the pin 3/4 end (Silvertel Ag9900
# datasheet, figure 23). No copper from that line to the 48 V pins. Corner points, clockwise.
POE_UNDER_MODULE = [(71.8, 34.0), (77.9, 34.0), (77.9, 57.0), (74.8, 57.0)]
# Silvertel's keep-out for the module (Ag9900 datasheet V3.5, figure 23) is a 3 mm band that also dips
# into the output row between pins 2 and 3. No copper in that whole gap either: a superset of the band.
POE_BARRIER_DIP = (67.4, 39.3, 71.8, 51.5)
# Behind the jack: its metal shell reaches up to y = 71.0 (longest body, furthest back). No 48 V
# copper, no part and no Ethernet pair on the component side beyond this line: the 48 V nets pass
# under the rear wall of the shell on an inner layer, the Ethernet pairs on the back layer. (The
# centre-tap, LED and shield tracks do run under the shell on the component side; a contact between
# them and the shell would do no harm.)
JACK_REAR_CLEAR_Y = 70.0
# Where the autorouter must not go (the hand-routed 48 V tracks live here)
POE_ROUTER_KEEPOUT = [(77.35, 35.0, 86.0, 71.4), (79.0, 30.6, 86.0, 35.0), (79.6, 71.4, 86.0, 78.6)]

MOUNT_HOLES = ((4.0, 3.5), (82.0, 3.5), (17.9, 139.4), (66.3, 117.0))
# The last one stands in the gap of the copper around the NFC loop. Under its screw head and the insert
# on the other side the outer layers carry no copper: metal that cuts through the solder mask on both
# sides of the gap would close that copper into a shorted turn (simulated: 1.25 uH become 1.03 uH).
NFC_GAP_HOLE = MOUNT_HOLES[3]
# Hall switch U703 that senses the magnet in the dock: the magnet sits in front of this point, on the
# component side. Free board area away from the buzzer (15 mm) and the inductors (22 mm and more).
HALL = (12.5, 38.2)
MAGNET_RING_R = 6.5                         # the dock's holder around the magnet, 3.2 mm high
# Proximity sensor U704: centre of the part. It looks at the dock's plate, which is flat for 9 mm around this
# point: past the magnet's holder, the screw holes and the cables. Emitter and detector lie on the part's long
# axis, which runs up the board; the offsets are from the datasheet's package drawing.
PROX = (21.6, 52.4)
PROX_EMITTER_DY, PROX_DETECTOR_DY = -1.15, 1.45
PROX_BEAM_DEG = 30                          # the emitter's light ends about 30 degrees off its axis
DOCK_PLATE = 13.9                           # component side to the dock's plate, from the case design
# Where the dock's plate is cut back (board coordinates, from the case design): recesses 0.8 mm deep under the
# Ethernet jack and the PoE module, and a window through the plate for the jack's two shield springs
DOCK_OPENINGS = ((68.0, 70.4, 85.6, 93.6), (68.5, 33.8, 84.5, 57.0))
MOUNT_KEEPOUT_R = 3.3                       # screw head / standoff: no tracks on the outer layers

# The 3.3 V plane covers the display area and reaches the NFC parts left of the antenna: (x, y) corner
PLANE_3V3_TONGUE = (25.3, 136.6)

# Copper layers. With 6 every signal layer lies next to an unbroken plane:
#   F.Cu signals and parts / In1 ground / In2 signals / In3 3.3 V / In4 ground / B.Cu signals, core rail, antenna
# With 4 (the first layout) the 3.3 V pour shares In2 with the signal tracks, which cut it apart, and
# B.Cu has that cut pour as its reference:
#   F.Cu / In1 ground / In2 signals and 3.3 V / B.Cu
# The routing is the same in both: tracks only on F.Cu, In2 and B.Cu.
COPPER_LAYERS = 6
# Stack-ups to order, top to bottom: (kind, thickness mm, material, relative permittivity). The
# thicknesses of the six-layer stack-up are the ones JLCPCB's order form shows for it (November 2026);
# those of the four-layer stack-up are nominal values, not compared with the form.
STACKUP = {
    4: ('JLC04161H-7628', [('prepreg', 0.2104, '7628', 4.4), ('core', 1.065, 'FR4', 4.6), ('prepreg', 0.2104, '7628', 4.4)]),
    6: ('JLC06161H-3313', [('prepreg', 0.0994, '3313', 4.1), ('core', 0.55, 'FR4', 4.6), ('prepreg', 0.1088, '2116', 4.16),
                           ('core', 0.55, 'FR4', 4.6), ('prepreg', 0.0994, '3313', 4.1)]),
}
COPPER_OUTER, COPPER_INNER = 0.035, 0.0152
