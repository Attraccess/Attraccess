// NFC keychain card — Attraccess
//
// Parameters are supplied from the UI with -D. Rendering requires:
//   --enable textmetrics --backend Manifold
//
// PART        "body" | "letters"
// LABEL       the configurable label (line 2)
// POCKET_OPEN false = sealed cavity (insert sticker at a print pause)
//             true  = cut through the bottom face (drop sticker in afterwards)

PART = "body";
LABEL = "Tobias J.";
POCKET_OPEN = false;
FONT = "Sansation";

/* ---- fixed geometry ---------------------------------------------------- */

W = 60;             // overall width
H = 40;             // overall height
T = 2;              // thickness
CORNER_R = 4;       // outline corner radius
EDGE_R = 1;         // bullnose radius (== T/2, so the edge is a full half-round)

HOLE_D = 4;         // keyring bore
HOLE_X = 4;
HOLE_Y = 4;

POCKET_D = 25;      // NFC sticker pocket
POCKET_H = 0.25;

LETTER_DEPTH = 0.4; // capped by the 0.875 mm wall above the pocket
TEXT_MARGIN = 2;    // measured from the FLAT FACE, not the nominal outline

BRAND = "Attraccess";
BRAND_CAP_H = 4;
LABEL_CAP_MAX = 10;
LABEL_CAP_MIN = 3;

STEPS = 12;         // bullnose tessellation
$fn = 64;

/* ---- derived ----------------------------------------------------------- */

// The flat top face is the outline inset by the bullnose radius.
FLAT_X0 = EDGE_R;
FLAT_X1 = W - EDGE_R;
FLAT_Y0 = EDGE_R;
FLAT_Y1 = H - EDGE_R;

TEXT_X0 = FLAT_X0 + TEXT_MARGIN;   //  3
TEXT_X1 = FLAT_X1 - TEXT_MARGIN;   // 57
TEXT_Y1 = FLAT_Y1 - TEXT_MARGIN;   // 37
TEXT_W  = TEXT_X1 - TEXT_X0;       // 54

POCKET_Z0 = (T - POCKET_H) / 2;    // 0.875
POCKET_Z1 = POCKET_Z0 + POCKET_H;  // 1.125

// Cap height per unit font size, so sizing does not depend on whether the
// string happens to contain a descender.
CAP_RATIO = textmetrics("H", size = 10, font = FONT).size[1] / 10;

BRAND_SIZE = BRAND_CAP_H / CAP_RATIO;

HAS_LABEL = len(LABEL) > 0;
LABEL_UNIT_W = HAS_LABEL ? textmetrics(LABEL, size = 10, font = FONT).size[0] / 10 : 1;
LABEL_FIT = TEXT_W / LABEL_UNIT_W;                 // size that exactly fills the width
LABEL_SIZE = min(LABEL_FIT, LABEL_CAP_MAX / CAP_RATIO);

assert(!HAS_LABEL || LABEL_SIZE >= LABEL_CAP_MIN / CAP_RATIO,
       str("Label too long: \"", LABEL, "\" does not fit in ", TEXT_W,
           " mm at the minimum ", LABEL_CAP_MIN, " mm cap height."));

/* ---- 2D outline -------------------------------------------------------- */

module outline_2d() {
  offset(r = CORNER_R)
    translate([CORNER_R, CORNER_R])
      square([W - 2 * CORNER_R, H - 2 * CORNER_R]);
}

/* ---- bullnose plate ----------------------------------------------------
   T == 2 * EDGE_R, so sweeping a sphere of radius EDGE_R over the flat
   outline gives a continuous half-round edge with no straight band.
   Built as hulled offset slabs — same surface as minkowski(), far faster. */

module bullnose_half() {
  for (i = [0 : STEPS - 1]) {
    z1 = i / STEPS;
    z2 = (i + 1) / STEPS;
    hull() {
      translate([0, 0, EDGE_R * z1])
        linear_extrude(0.001) offset(-EDGE_R + EDGE_R * sqrt(1 - z1 * z1)) outline_2d();
      translate([0, 0, EDGE_R * z2])
        linear_extrude(0.001) offset(-EDGE_R + EDGE_R * sqrt(1 - z2 * z2)) outline_2d();
    }
  }
}

module plate() {
  // The slab sweep overshoots each pole by one slab height (0.001 mm), so clamp
  // to exactly T. At the poles the surface is already horizontal, so this
  // removes a sliver rather than introducing a flat band.
  intersection() {
    translate([0, 0, T / 2]) {
      bullnose_half();
      mirror([0, 0, 1]) bullnose_half();
    }
    translate([-1, -1, 0]) cube([W + 2, H + 2, T]);
  }
}

/* ---- keyring hole ------------------------------------------------------
   Straight bore plus a rounded flare at each face, so the mouth opens from
   HOLE_D to HOLE_D + 2*EDGE_R. */

module hole_flare() {
  for (i = [0 : STEPS - 1]) {
    z1 = i / STEPS;
    z2 = (i + 1) / STEPS;
    hull() {
      translate([0, 0, T / 2 - EDGE_R + EDGE_R * z1])
        cylinder(h = 0.001, r = HOLE_D / 2 + EDGE_R - EDGE_R * sqrt(1 - z1 * z1));
      translate([0, 0, T / 2 - EDGE_R + EDGE_R * z2])
        cylinder(h = 0.001, r = HOLE_D / 2 + EDGE_R - EDGE_R * sqrt(1 - z2 * z2));
    }
  }
}

module keyring_hole() {
  translate([HOLE_X, HOLE_Y, 0]) {
    translate([0, 0, -0.5]) cylinder(h = T + 1, r = HOLE_D / 2);
    translate([0, 0, T / 2]) {
      hole_flare();
      mirror([0, 0, 1]) hole_flare();
    }
  }
}

/* ---- NFC pocket -------------------------------------------------------- */

module nfc_pocket() {
  z0 = POCKET_OPEN ? 0 : POCKET_Z0;
  translate([W / 2, H / 2, z0])
    cylinder(h = POCKET_Z1 - z0, d = POCKET_D);
}

/* ---- text -------------------------------------------------------------- */

// Place `s` so that its tight bounding box lands exactly where asked.
// anchor_x: "right" pins the bbox right edge to px, "center" centres on px.
module place_text(s, size, px, py, anchor_x, anchor_y) {
  tm = textmetrics(s, size = size, font = FONT);
  ox = anchor_x == "right"
         ? px - tm.position[0] - tm.size[0]
         : px - tm.position[0] - tm.size[0] / 2;
  oy = anchor_y == "top"
         ? py - tm.position[1] - tm.size[1]
         : py - tm.position[1] - tm.size[1] / 2;
  translate([ox, oy]) text(s, size = size, font = FONT);
}

module text_2d() {
  place_text(BRAND, BRAND_SIZE, TEXT_X1, TEXT_Y1, "right", "top");
  if (HAS_LABEL)
    place_text(LABEL, LABEL_SIZE, W / 2, H / 2, "center", "center");
}

module letters() {
  translate([0, 0, T - LETTER_DEPTH])
    linear_extrude(LETTER_DEPTH) text_2d();
}

/* ---- parts ------------------------------------------------------------- */

module body() {
  difference() {
    plate();
    keyring_hole();
    nfc_pocket();
    letters();
  }
}

if (PART == "letters") letters();
else body();
