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
- **Faceplate**: a 1 mm cover over the whole front, stuck onto the cap; the display's glass lies flush
  with it. It is plain by default, with a white stripe from the tap tile down to the bottom edge. The
  logo is the faceplate's business: the printed one comes as a second file with the Attraccess wordmark
  inlaid, and other faceplates (aluminium, wood, a customer's logo) bring their own. Readers ship with
  the Attraccess wordmark unless a customer asks otherwise.
- **Tap tile**: the card target over the NFC antenna, 36 mm square and 1.8 mm proud of the faceplate:
  a black top with a white keyhole on a white body. Its flange sits behind the cap's front wall, so it
  cannot be pried off from outside. The board's eight LEDs shine into it from behind and light up the
  white rim round the black top.
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
| Mock board: [3MF](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.3mf), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.step), [STL](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.stl) | Printable stand-in for the board, to check the fit before the real board is at hand. |
| Mock display: [3MF](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.3mf), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.step), [STL](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.stl) | Stand-in for the display, with the assumed display dimensions (see [Not yet verified](#not-yet-verified)). |
| [`board/attractap-touch-p4.step`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/board/attractap-touch-p4.step) | The bare board (no parts) exported from the current layout. The design embeds the board as it was when the case was drawn; check it against this file after a change to the board outline. |
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
  board are not exported by it. In SolidCraft 0.45.0 the option that lays parts on their print face
  has no effect, so the script turns each part with a temporary move before the export.
- **Manual scenes**: `manual/attractap-manual-scenes.sc` is a copy of the design with extra bodies
  for illustration; print files never come from it. It, the renders on this page and the manual's
  figures still show an earlier depth stack: a cap 0.64 mm deeper, with the display 2 mm off the board,
  and the display flex's earlier route through the board below the display. They also still show the
  old front with light windows, LED diffusers and inlays in the cap, from before the faceplate and the
  tap tile (27 November 2026).

The scripts are plain Python without dependencies; run them with `python3 -I`. They drive SolidCraft
through its command-line tool (the path at the top of each script is the macOS one) or write step
files for it, and use `rsvg-convert` for labels.

| Script | What it makes |
| --- | --- |
| `cad/tools/export_parts.py` | STEP, 3MF and STL files of cap, faceplate, tap tile, dock, display frame, mock display and assembly |
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
- **Inserts close to the front face.** Only 2.9 mm lie between the board and the front wall. The
  insert holes of the four PCB bosses are 3.2 mm deep (`pcb_ins_depth`), reaching 0.3 mm into the
  2.4 mm front wall and leaving 2.1 mm. Check on the first print that pressing the inserts in does
  not mark the front.
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
