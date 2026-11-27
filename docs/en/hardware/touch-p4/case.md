# Case
<!-- llms-description: The 3D-printable wall and desk case of the Attractap Touch P4 reader: how it works, every print and CAD file, how to print and change it, and what is not yet verified. -->

A 3D-printable case for the [Attractap Touch P4 board](hardware/touch-p4/overview.md), for anyone
printing, assembling or changing it. It hangs on a wall or stands on a desk; the same reader fits
both. Nothing has been printed or test-fitted yet: see [Not yet verified](#not-yet-verified).

| On the wall | On the desk stand |
| --- | --- |
| ![Reader on a wall](../../../_media/hardware/touch-p4/case/01-wall-hero.png) | ![Reader on the desk stand](../../../_media/hardware/touch-p4/case/04-desk-front.png) |

## How it works

- **Cap**: the front shell. It carries the display and the board; its front is a plain 1.4 mm wall.
- **Faceplate**: a 1 mm cover over the whole front, held on the cap by five magnets without glue or
  tape; the display's glass lies flush with it. Five steel washers on its back sit over magnets hidden
  in the cap's front wall, so faceplates can be swapped by hand (see [Faceplate interface](#faceplate-interface)). It is plain by default, with a white stripe from the tap tile down to the bottom edge. The
  logo is the faceplate's business: the printed one comes as a second file with the Attraccess wordmark
  inlaid, and other faceplates (aluminium, wood, a customer's logo) bring their own. Readers ship with
  the Attraccess wordmark unless a customer asks otherwise.
- **Tap tile**: the card target over the NFC antenna, 40.8 mm square and 1.8 mm proud of the faceplate:
  a black top with a white keyhole on a white body. Its flange sits behind the cap's front wall, so it
  cannot be pried off from outside.
  - **Light.** The board's 16 LEDs form a square ring 21.4 mm from the tile's centre on every side, 10.7 mm
    apart. The white rim round the black top is 2 mm wide (21.4 ± 1 mm from the centre), right over them.
  - **Light channel.** The LEDs shine into a channel in the tile's back, 2.3 mm wide and 2.5 mm deep, that
    runs round the whole ring. Its white walls carry the light sideways between the LEDs, and only 2.8 mm
    of white plastic lie between the channel and the rim, about half of a solid tile.
  - **Core.** Inside the ring the tile stays white. In white plastic light scatters instead of being guided:
    a white core sends what strays inwards back towards the rim, while a black one would absorb it and
    dim the rim. The black top hides the core.
  - **Holding the board.** The tile is clamped between the cap's front wall and the board, its back flat
    on the board round the NFC loop. That holds the corner of the board that has no screw (lower left
    seen from the front). Of the two board screws right of the tile (seen from the front), the upper one
    sits in a notch in the flange and the lower one clears its rounded corner.
- **Dock**: the back plate, 13.9 mm from the board's component side. It is screwed to the wall (five
  holes; the lower pair matches the 60 mm spacing of a flush-mount box) or onto the stand. Under the
  Ethernet jack and the PoE module the plate has recesses 0.8 mm deep, and a window through it under
  the jack's two shield springs.
- **Dock sensing**: the board knows when it is taken off. A proximity sensor measures the infrared
  light the dock's plain inner face reflects, and a hall switch senses a 10 x 3 mm magnet held in a
  ring on that face.
- **Stand**: a hollow wedge for the desk. The reader leans back 35°.
- The cap hooks onto a 45° cleat at the top of the dock, swings shut and is locked by two M3 screws
  from below. Plugs and cables end up enclosed between cap and dock.
- A cable either goes into the wall behind the dock or leaves through a notch at the bottom, where a
  cable tie on a saddle inside the cap takes the pull off the jack.
- Screws go into heat-set inserts. The reader comes off the wall with two screws, the board out of
  the cap with four more.

## Faceplate interface

What any faceplate needs to fit (printed, aluminium, wood or other). Positions are in mm from the
centre of the display, seen from the front: X to the right, Y up. The logo or artwork is the
faceplate's own business.

| Feature | Size and position |
| --- | --- |
| Outline | 94.8 x 166.3 mm, corner radius 6 mm, centred at X 0, Y -26.1 (the cap's outline). A 0.4 mm chamfer on the front edge is optional |
| Thickness | 1.0 mm. The display's glass lies 0.1 mm below the front of a 1 mm plate; a thicker plate leaves the glass sunk |
| Screen window | 84.8 mm square, corner radius 1 mm, centred at X 0, Y 0 |
| Tile opening | 45.2 mm square, corner radius 6.2 mm, centred at X 0, Y -67.85. The tap tile stands 1.8 mm proud of the plate through it |
| Stripe slit | 2 mm wide (X -1 to 1), from the tile opening down through the bottom edge. Required on a metal plate (see below); a printed plate fills it with its white stripe |
| Steel discs | Five, centred at (-28.3, 48.8), (-39.5, -60), (39.5, -60), (-39.5, -88) and (39.5, -88). From the plate's edges: the top one 19.1 mm from the left edge and 8.25 mm from the top edge, the four side ones 7.9 mm from the left or right edge and 49.25 or 21.25 mm from the bottom edge |
| Disc size | At most 9.4 mm across (the cap's pockets are 9.6 mm wide and 0.7 mm deep). A disc may stand at most 0.6 mm proud of the plate's back, glue included; nothing else on the back may stand proud |
| Pry notch | In the cap's bottom face, X 6 to 18, right behind the plate's bottom edge. Keep the plate's bottom edge straight and whole there |

- **Discs.** They must be magnetic steel: zinc-plated or plain steel, not stainless (A2 and A4 stainless
  hardly react to a magnet). The printed plate takes DIN 125 / ISO 7089 M4 washers (9 mm across, 0.8 mm
  thick) in 9.4 mm recesses 0.4 mm deep, which leave 0.6 mm of plate in front of them. A plate without
  recesses can take ISO 7092 M4 washers (8 mm, 0.5 mm) glued flat, or M4 washers in recesses at least
  0.3 mm deep.
- **Gluing the discs on.** Superglue gel or two-part epoxy. On a plate without recesses, drop the washers
  into the cap's pockets (the magnets hold them), put a small drop of glue on each, press the plate on
  lined up with the cap's edges and let it cure. Keep glue off the cap.
- **Holding force.** The magnets are 10 x 3 mm neodymium discs (N42), the same as the dock's. Each sits
  behind 0.4 mm of the cap's front wall, so a washer in a 0.4 mm recess is about 0.65 mm away from it.
  At that gap one magnet would pull about 8 N on thick steel (the maker's 17.7 N at contact, scaled by a
  disc-magnet model). A thin washer smaller than the magnet takes an estimated 40 to 60 % of that: about
  3 to 5 N per magnet, 16 to 24 N for the plate. A printed plate weighs about 8 g, a 1 mm aluminium one
  about 18 g, so the pull is over 80 times the weight. The washers in their pockets also stop the plate
  from sliding. Lifted at the notch, the plate comes off one pair of magnets at a time, about 6 to 10 N.
  The estimate is not measured.
- **Metal plates.** Around the tile opening a metal plate is a closed ring right over the NFC loop. It
  would act as a shorted turn and take the reader's field, which is why the board's own copper round the
  loop is open in one place ([design notes](hardware/touch-p4/design-notes.md#nfc)). The stripe slit
  opens that ring; leave it open or fill it with something that does not conduct. A 1 mm aluminium
  plate over the whole front, with only the screen window and the tile opening, needs no window for the
  Wi-Fi antenna: in the full-wave model (27 November 2026, stand-in antenna, the case as built now) it
  costs nothing at 2.4 GHz and 0.1 to 1.1 dB at 5 GHz, and a window above the screen wins back 0.3 dB at
  most. Do not cut a notch open to the top edge over the antenna: that spoils the 2.4 GHz match. The
  1.5 to 1.9 dB in the [antenna](hardware/touch-p4/design-notes.md#antenna) notes are for an older, shorter
  plate on the old case. Check a metal plate with a range test on the real board. The discs
  stay clear of both: at least 17 mm from the NFC loop's copper and 30 mm from the antenna.
- **Where the magnets sit.** They avoid the NFC loop (35 x 37 mm round the tile's centre), the Wi-Fi
  antenna (top right behind the strip above the display), the buzzer (X 36.6, Y -2.85) and the hall switch
  U703 (X 30.5, Y 10.95), which senses the dock's magnet. All five together give at most about 0.24 mT at
  the switch (dipole estimate, every magnet the worst way round). The switch (DRV5032FA) operates at
  1.5 to 4.8 mT and releases at 0.5 mT at the least, so the faceplate magnets can neither trip it nor keep
  it on once the reader leaves the dock. The top right corner has no magnet: the antenna and a board screw
  leave no room there.

The [installation manual](hardware/touch-p4/installation-manual.md) ([PDF](_media/hardware/touch-p4/attractap-installation-manual-en.pdf ':ignore'))
shows every step with figures: parts and hardware list, inserts, assembly, drilling template, cable
routes, desk stand and service.

## Files

All files are in [`apps/attractap/hardware/touch-p4/case/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case). They are under the
[non-commercial hardware license](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/LICENSE.md): no selling the design or printed cases (see [License](hardware/touch-p4/overview.md#license)).

### Print files

Each 3MF already lies on its print face. Print them in ABS+ (see [Printing](#printing)).

| Part | Print file | CAD | Qty | Colour | Lies on |
| --- | --- | --- | --- | --- | --- |
| Cap | [`attractap-cap.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-cap.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-cap.step) | 1 | RAL 5021 | its front face |
| Faceplate | [`attractap-faceplate.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate.3mf), with the wordmark [`attractap-faceplate-logo.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate-logo.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate.step), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate-logo.step) | 1 | RAL 5021, stripe and wordmark white | its front face |
| Tap tile | [`attractap-tile.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-tile.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-tile.step) | 1 | Black top and keyhole, plain white body (it carries the LEDs' light) | its back |
| Dock | [`attractap-dock.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-dock.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-dock.step) | 1 | Marble white | its back |
| Display frame | [`attractap-display-frame.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-display-frame.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-display-frame.step) | 1 | Any | its board side |
| Stand (desk only) | [`attractap-stand.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-stand.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-stand.step) | 1 | Marble white | its desk face |

The hardware (heat-set inserts, screws, tape, cable ties) is listed in the
[installation manual](hardware/touch-p4/installation-manual.md).

### Design and reference files

| File | What it is |
| --- | --- |
| [`cad/attractap-touch-case.sc`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-touch-case.sc) | The design, a SolidCraft document (version 0.45.0). Every print file is exported from it. |
| [`cad/attractap-assembly.step`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-assembly.step) | The whole reader assembled, for other CAD tools. |
| Mock board: [3MF](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.3mf), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.step), [STL](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.stl) | Printable stand-in for the board, with the bodies of all its components, to check the fit by eye and by hand before the real board is at hand. It is the Ethernet and PoE build (`lan`), which fits every part; the Wi-Fi build only leaves parts out. Print it at full scale on its back face (the display side), components up, with supports from the build plate: the end of the Wi-Fi module over the antenna cut-out and the USB-C socket in its notch overhang the board. The openings of the RJ45 jack and the DC jack print as bridges. The 3MF and STL files have the shapes of the component models, with the pins cut off at the back face and the space under the PoE module filled; the STEP file has a box round each part instead, to stay small. Made from the KiCad board by `cad/tools/mock_board.py`. |
| Mock display: [3MF](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.3mf), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.step), [STL](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.stl) | Stand-in for the display, with the assumed display dimensions (see [Not yet verified](#not-yet-verified)). |
| [`board/attractap-touch-p4.step`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/board/attractap-touch-p4.step) | The bare board (no parts) exported from the current layout. The design embeds this file, re-imported on 27 November 2026 for the LED ring and the moved mounting holes; import it again after a change to the board outline or holes. |
| [`logo/attraccess-wordmark.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-wordmark.svg), [`attraccess-keyhole.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-keyhole.svg), [`attraccess-logo-mono.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-logo-mono.svg) | Logo outlines for the inlays of the faceplate and the tap tile; the board's silkscreen logo is drawn from the same folder. |
| [`manual/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case/manual) | The scene file the manual's figures are rendered from, and the scripts that make the figures and the PDF (see [Changing the design](#changing-the-design)). |

## Printing

- Material: ABS+ on a filament printer. For a reader that is sold, the filament needs a data sheet
  stating its flammability class; whether plain ABS+ is enough is in the
  [compliance checklist](hardware/touch-p4/compliance.md).
- Every part has one flat face to lie on and is meant to print without supports. None has been
  sliced yet, so that is unconfirmed.

## Changing the design

- **Coordinates**: the origin is the centre of the display seen from the front; Z is 0 at the wall
  and the front face is at Z = `D`. A board point (x, y) in the board's own coordinates is at case
  X = 43 − x, Y = 49.15 − y; in KiCad coordinates (board corner at (60, 30)) at X = 103 − x,
  Y = 79.15 − y.
- **Parameters**: the depth stack is parametric (`plate_t`, `cav`, `pcb_t`, `disp_gap`, `disp_t`,
  `lens_t`, `tape_t`, `lens_recess`, `wall`, `pcb_ins_depth`). X and Y positions are plain numbers
  taken from the board.
- **Export**: after a change, run `cad/tools/export_parts.py`. It writes cap,
  the faceplate (plain and with the wordmark), tap tile, dock, display frame, mock display and the assembly; stand and mock
  board are not exported by it. The mock board is made from the KiCad board: `bash tools/pcb.sh export-3d <folder>` where
  KiCad 10 is (or in the `kicad10-np` container), then `uv run case/cad/tools/mock_board.py <folder>`, both from
  `apps/attractap/hardware/touch-p4`. In SolidCraft 0.45.0 the option that lays parts on their print face
  has no effect, so the script turns each part with a temporary move before the export.
- **Manual scenes**: `manual/attractap-manual-scenes.sc` is a copy of the design with extra bodies
  for illustration; print files never come from it. It, the renders on this page and the manual's
  figures still show an earlier depth stack: a cap 0.64 mm deeper, with the display 2 mm off the board,
  and the display flex's earlier route through the board below the display. They also still show the
  old front with light windows, LED diffusers and inlays in the cap, from before the faceplate and the
  tap tile (27 November 2026).

The scripts are plain Python without dependencies; run them with `python3 -I`. The exception is
`cad/tools/mock_board.py`, which needs numpy, scipy and manifold3d; `uv run` fetches them. They drive SolidCraft
through its command-line tool (the path at the top of each script is the macOS one) or write step
files for it, and use `rsvg-convert` for labels.

| Script | What it makes |
| --- | --- |
| `cad/tools/export_parts.py` | STEP, 3MF and STL files of cap, faceplate, tap tile, dock, display frame, mock display and assembly |
| `cad/tools/mock_board.py` | STEP, 3MF and STL files of the mock board, from the board with its component models |
| `manual/tools/scenes.py`, `scenelib.py` | Scenes, cameras and labels of the manual's figures |
| `manual/tools/gen_hardware.py`, `gen_strain_relief.py`, `gen_wall_route.py` | Step files that add screws, inserts, cables and cable ties to the manual's scene file |
| `manual/tools/drill.py` | The drilling template |
| `manual/tools/build_pdf.py` | The manual PDFs (`docs/_media/hardware/touch-p4/attractap-installation-manual-en.pdf` and `-de.pdf`) from the English and German manual pages; needs a Chromium-based browser |

## Not yet verified

- **Nothing has been printed.** Fits, the swing-on motion and the strain relief are checked in CAD only.
- **Display dimensions.** Measured on a sample panel (26 November 2026): glass 84.23 x 84.25 mm, 3.5 mm
  from the front of the glass to the metal back (`disp_t`; the drawing on the display's product page,
  AliExpress item 1005005675144653, says 3.14 mm). The display frame printed from the drawing's LCD
  outline fits the sample. Not measured: the cover lens alone (`lens_t`, 0.55 mm by the drawing) and the
  corner radius (at least 1 mm assumed). They decide whether the screen sits flush. Measure the panel you
  buy; if it differs, set `disp_t` and `lens_t` and export the parts again.
  - First print (27 November 2026): with `tape_t` 0.3 mm the glass stood about 0.7 mm proud. `tape_t` is now
    1.1 mm, which lowers the frame's rim by 0.8 mm. It covers the tape and whatever the lens has beyond 0.55 mm;
    which of the two it is was not measured.
  - `lens_t` is the lens alone: the touch sensor (76.5 x 76.7 mm) is smaller than the lens, so the
    border the frame holds has no sensor behind it.
  - The sensor is 0.9 mm wider than the frame's opening for the LCD module (75.6 mm). The frame's rim
    reaches 0.4 mm under each side edge of the sensor. With the 0.3 mm tape it pressed on it by 0.05 mm;
    since the rim went 0.8 mm lower it clears it in CAD. An opening of 77.3 mm would clear it with any tape.
  - The sample's lens border carries its own tape (3M, with a liner; 0.175 mm 3M 9495 by the drawing,
    not measured). It can replace the manual's tape only with a frame exported for it: set `tape_t` from a test
    fit and widen the opening first.
- **Display distance to the board.** The case holds the display 1.7 mm off the board (`disp_gap`).
  Details in the [design notes](hardware/touch-p4/design-notes.md#display-mounting-and-flex).
  - The display's flex folds flat onto the LCD's metal back and goes through a slot behind the display.
    The touch controller on it faces the board, 1.3 mm high; the board allows 1.5 to 2.0 mm, and 1.7 mm
    leaves room for print tolerance. The frame is open along the display's lower edge, where the fold
    lies.
  - On the lan version the Ethernet jack J401 has its solder pins behind the display: 16 pins, two
    shield tabs and two plastic posts, 11 of them behind the LCD's metal back, standing at least
    1.45 mm out of the board. They are clipped to 1 mm and that corner of the LCD gets polyimide tape
    (both steps are in the manual). The USB-C socket has its shell tabs under the edge of the glass.
  - The jack's two 48 V pins come out 0.5 mm beside the LCD's metal edge, inside the frame's pocket
    for the pins. The frame cannot put a wall there (the nearer pin's pad ends 0.1 mm from the LCD's
    edge); the tape on the LCD is the insulation.
  - Turning the jack the other way does not work without a longer case: below the display its plug
    room shrinks from 51 to 32 mm, and a wall cable would need a plug ending 12 mm below the jack.
- **Tap tile and LED ring.** Changed on 27 November 2026 for the board's ring of 16 LEDs and checked in CAD
  only.
  - How evenly and how brightly the rim lights up. The light channel and the 2.8 mm of white over it are
    a first guess; LED spots on the rim would call for a deeper channel or small black masks over the
    LEDs, and a dim rim for a thinner roof.
  - Whether the tile's back holds the board's lower left corner (seen from the front) without play. It
    lies on the board with no gap in CAD. If the board then does not sit on all four bosses, sand the
    tile's back.
  - Backwards (towards the wall) nothing but the board itself supports that corner: the dock has its
    cable opening behind it. A card pressed on the tile bends it back elastically, by an estimated
    0.1 mm for 5 N on the tile's centre.
- **Faceplate magnets.** Five magnets glued into bosses behind the cap's front wall, 0.4 mm of it in
  front of them, and five washers on the faceplate. The magnets' backs clear the board's display side by
  0.2 mm; a magnet glued proud of its boss presses on the board. Check the holding force and that the
  plate lifts at the notch, and that the hall switch still reads "off" with the reader off the dock. The
  bridge over each front pocket is the first layer above it (the cap prints face down): check that it
  closes.
- **Inserts close to the front face.** Only 2.9 mm lie between the board and the front wall. The
  insert holes of the four PCB bosses are 3.2 mm deep (`pcb_ins_depth`), reaching 0.3 mm into the
  cap's 1.4 mm front wall (2.4 mm before the faceplate took its outer 1 mm) and leaving 1.1 mm. Check on
  the first print that pressing the inserts in does not mark the front or lift the faceplate.
- **Dock magnet.** The ring is at X 30.5, Y 10.95 (board point 12.5, 38.2); the magnet's face is
  10.3 mm from the hall switch, which by calculation gives 22 mT, four times what the switch needs.
  Check on the first board that the switch reads "on the dock" with the reader hung and "off" once it
  is lifted away. The pocket is 10.2 mm wide for a drop of glue; tune it for the magnets you buy.
- **Dock plate in front of the proximity sensor.** The sensor lights a patch of the dock's inner face
  around X 21.4, Y -2.1 (board point 21.6, 51.25), 9 mm left of and 13 mm below the magnet's ring
  seen from the front. Keep the plate flat there for 9 mm around and free of ribs, holes, cable clips
  and labels; a test checks that the dock's openings stay clear of it. The reading depends on the
  plate's colour: a reader has to store its reference again on a dock of another colour, and a black
  dock may reflect too little (not measured).
- **Ethernet jack and PoE module against the dock.** Checked against the board's 3D models only,
  at the makers' maximum heights: the jack body keeps 0.70 mm to its recess, its shield springs
  (15.21 ± 0.5 mm high) 1.14 mm to the wall behind the window and 1.0 mm to the window's sides, the
  PoE module (13.35 ± 0.5 mm, SDAPO's drawing) 0.80 mm, the DC terminal J103 0.70 mm to the plate.
  Check on the first print.
- **Outdoor use.** There are no seals, the buzzer holes and cable notches are open, and ABS+ ages
  in sunlight: an indoor case. The board's 5 GHz Wi-Fi is restricted to indoor use as well
  ([compliance checklist](hardware/touch-p4/compliance.md)).

The installation manual ends with the [full list](hardware/touch-p4/installation-manual.md) of what
is not yet verified.
