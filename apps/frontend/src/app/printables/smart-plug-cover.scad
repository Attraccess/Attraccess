// Attraccess smart-plug security cover: a body that sleeves the plug and a cover that
// closes over the plug face, held together by two disposable security seals.
//
// PART selects "body" or "cover". The web configurator passes the other parameters with -D.
//
// Geometry source: the Nous A1 cover in reference/nous-a1-bottom.step (body) and
// reference/nous-a1-top.step (cover). Only the nous_a1 profile is STEP-derived.
// Manufacturer envelopes (overall size only; no tolerances or drawings are published):
//   Nous A1T / A1Z      46 x 46 x 72 mm  https://nous.technology/product/a1t.html
//                                         https://nous.technology/product/a1z-1.html
//   Shelly Plus Plug S  44 x 44 x 70 mm  https://www.shelly.com/blogs/documentation/shelly-plus-plug-s
//   Shelly Plug S Gen3  44 x 44 x 70 mm  https://www.shelly.com/products/shelly-plug-s-gen3
//   Shelly Plug S       46 x 69 mm       https://www.shelly.com/blogs/documentation/shelly-plug-s
// The Shelly profiles are estimates: they apply these diameter and depth differences to the
// Nous profile. Plug heads, strain reliefs and cords are not standardised either, so check
// every opening against the real plug and cable before relying on a print.

PART = "body";
// "nous_a1" | "shelly_plus_gen3" | "shelly_legacy"
DEVICE = "nous_a1";
// "straight_schuko" | "straight_euro" | "angled_schuko" | "angled_euro"
CABLE = "straight_schuko";
// Extra diametral clearance on top of the 0.5 mm nominal fit, 0-4 mm.
DEVICE_EXTRA_D = 0;
// Straight cables only: central cord opening and cover slot, 5-16 mm (Schuko) or 5-12 mm (Euro).
CORD_OPEN_D = 12;
// Cover height above the plug face: 14-40 mm for angled cables, 17.8-80 mm for straight ones,
// whose plug sits inside the cover. Angled cables only: height of the body's cable cutout.
HEIGHT_ABOVE_PLUG = 50;
CABLE_CUT_H = 24.2;
FONT = "Sansation";
BRAND = "Attraccess";

$fn = 64;

ANGLED = CABLE == "angled_schuko" || CABLE == "angled_euro";
EURO = CABLE == "straight_euro" || CABLE == "angled_euro";

// STEP profile values that the angled variants keep and the straight ones fall back to.
STEP_HEIGHT_ABOVE_PLUG = 17.8;
STEP_CABLE_CUT_H = 24.2;
ANGLED_COVER_SLOT_W = 30.9;
ANGLED_BODY_MOUTH_EXTRA = 3.2727272727272; // 30.9 mm slot -> 34.17 mm body mouth
// The cover's lower skirt locates it in the body bore; above it sits the retaining ring.
COVER_SKIRT_H = 12;
MIN_RETAINING_RING_H = 2;
MIN_HEIGHT_ABOVE_PLUG = COVER_SKIRT_H + MIN_RETAINING_RING_H;

assert(DEVICE == "nous_a1" || DEVICE == "shelly_plus_gen3" || DEVICE == "shelly_legacy", str("Unknown DEVICE ", DEVICE));
assert(ANGLED || CABLE == "straight_schuko" || CABLE == "straight_euro", str("Unknown CABLE ", CABLE));
assert(DEVICE_EXTRA_D >= 0 && DEVICE_EXTRA_D <= 4, "Extra device clearance must be 0-4 mm.");
assert(ANGLED || (CORD_OPEN_D >= 5 && CORD_OPEN_D <= (EURO ? 12 : 16)),
  str("Cable opening must be 5-", EURO ? 12 : 16, " mm."));
assert(!ANGLED || (HEIGHT_ABOVE_PLUG >= MIN_HEIGHT_ABOVE_PLUG && HEIGHT_ABOVE_PLUG <= 40),
  str("Height above plug must be ", MIN_HEIGHT_ABOVE_PLUG, "-40 mm."));
assert(ANGLED || (HEIGHT_ABOVE_PLUG >= STEP_HEIGHT_ABOVE_PLUG && HEIGHT_ABOVE_PLUG <= 80),
  str("Height above plug must be ", STEP_HEIGHT_ABOVE_PLUG, "-80 mm."));
assert(!ANGLED || (CABLE_CUT_H >= 10 && CABLE_CUT_H <= 40), "Cable cutout height must be 10-40 mm.");

// Straight cables ignore the angled-only heights, and angled ones the straight opening.
HEIGHT = HEIGHT_ABOVE_PLUG;
CUT_H = ANGLED ? CABLE_CUT_H : STEP_CABLE_CUT_H;
COVER_CABLE_OPEN_W = ANGLED ? ANGLED_COVER_SLOT_W : CORD_OPEN_D;

PROFILE_DEVICE_D = DEVICE == "shelly_plus_gen3" ? 44 : 46;
PROFILE_DEPTH = DEVICE == "shelly_plus_gen3" ? 70 : DEVICE == "shelly_legacy" ? 69 : 72;
BODY_INSERT_D = PROFILE_DEVICE_D + 0.5 + DEVICE_EXTRA_D;
BODY_OUTER_D = BODY_INSERT_D + 7.2;
BODY_SOCKET_D = BODY_INSERT_D - 9;
BASE_BODY_H = 60.8 + PROFILE_DEPTH - 72;
BODY_BOTTOM_Z = -0.8;
BODY_TOP_FILLET_R = 1;
COVER_START_Z = BASE_BODY_H - STEP_HEIGHT_ABOVE_PLUG;
BODY_H = COVER_START_Z + HEIGHT;
COVER_H = BODY_H - COVER_START_Z;
COVER_INSERT_D = BODY_INSERT_D - 0.6;
COVER_SKIRT_INNER_D = BODY_INSERT_D - 6;
// A straight plug sticks out of the smart plug, so its cover is a hollow cap: the STEP's 5.8 mm
// top ring over a cavity the whole plug fits in. Pulled out of the socket, the plug stays
// trapped under the ring, because only the cable fits through the opening.
STRAIGHT_TOP_RING_H = STEP_HEIGHT_ABOVE_PLUG - COVER_SKIRT_H;
COVER_SKIRT_END_Z = COVER_START_Z + (ANGLED ? COVER_SKIRT_H : HEIGHT - STRAIGHT_TOP_RING_H);
BODY_CABLE_OPEN_W = COVER_CABLE_OPEN_W + ANGLED_BODY_MOUTH_EXTRA;
CABLE_CUT_START_Z = BODY_H - CUT_H;
CABLE_OUTER_BLEND_Y = -sqrt(pow(BODY_OUTER_D / 2, 2) - pow(BODY_CABLE_OPEN_W / 2, 2)) - 0.2292;
CABLE_INNER_BLEND_Y = CABLE_OUTER_BLEND_Y + 1.001;
SEAL_SLOT_W = 5;
SEAL_PASSAGE_H = 3;
SEAL_PASSAGE_R = 18.55;
SEAL_PASSAGE_LEN = BODY_OUTER_D;
SEAL_PASSAGE_ANGLE = 45;
SEAL_PASSAGE_NORMAL_H = SEAL_PASSAGE_H / sqrt(2);
BRAND_SIZE = 3.2;
BRAND_DEPTH = 1.4;
BRAND_ROW_PITCH = 10;
// Half the wordmark's length (21.24 mm in Sansation at size 3.2, from textmetrics) plus 1 mm, so
// the vertical text never runs into the bottom face or the rounded rim. A constant rather than
// textmetrics() so the downloaded file opens in OpenSCAD without the experimental feature.
BRAND_VERTICAL_MARGIN = 11.7;
BRAND_REPEAT_ANGLE = 360 / 7;
BRAND_ROW_SHIFT = 18;

module front_gap_2d(width, diameter) {
  translate([-width / 2, -diameter / 2 - 1]) square([width, diameter / 2 + 2]);
}

module c_ring_2d(outer_d, inner_d) {
  difference() {
    circle(d = outer_d);
    circle(d = inner_d);
    front_gap_2d(COVER_CABLE_OPEN_W, outer_d);
  }
}

module angled_seal_passages() {
  // Each 45-degree passage projects to a 3 x 5 mm opening on the top and on the outer wall.
  // Its centre crosses the top at the STEP's x = 18.55 mm.
  for (a = [0, 180])
    rotate([0, 0, a])
      translate([SEAL_PASSAGE_R, 0, BODY_H])
        rotate([0, SEAL_PASSAGE_ANGLE, 0])
          cube([SEAL_PASSAGE_LEN, SEAL_SLOT_W, SEAL_PASSAGE_NORMAL_H], center = true);
}

module body_cable_cut() {
  // The rounded mouth is 34.17 mm wide at the outer face and narrows to the cover's
  // 30.9 mm slot one millimetre higher at the inner bore.
  translate([-BODY_CABLE_OPEN_W / 2, -BODY_OUTER_D / 2 - 1, CABLE_CUT_START_Z])
    cube([BODY_CABLE_OPEN_W, BODY_OUTER_D / 2 + 1 + CABLE_OUTER_BLEND_Y, BODY_H - CABLE_CUT_START_Z + 1]);
  hull() {
    translate([-BODY_CABLE_OPEN_W / 2, CABLE_OUTER_BLEND_Y, CABLE_CUT_START_Z])
      cube([BODY_CABLE_OPEN_W, 0.01, BODY_H - CABLE_CUT_START_Z + 1]);
    translate([-COVER_CABLE_OPEN_W / 2, CABLE_INNER_BLEND_Y, CABLE_CUT_START_Z + 1])
      cube([COVER_CABLE_OPEN_W, 0.01, BODY_H - CABLE_CUT_START_Z]);
  }
  translate([-COVER_CABLE_OPEN_W / 2, CABLE_INNER_BLEND_Y, CABLE_CUT_START_Z + 1])
    cube([COVER_CABLE_OPEN_W, -CABLE_INNER_BLEND_Y + 1, BODY_H - CABLE_CUT_START_Z]);
}

module rounded_outer_body() {
  outer_r = BODY_OUTER_D / 2;
  fillet_center_r = outer_r - BODY_TOP_FILLET_R;
  fillet_center_z = BODY_H - BODY_TOP_FILLET_R;
  rotate_extrude()
    polygon(concat(
      [[0, BODY_BOTTOM_Z], [outer_r, BODY_BOTTOM_Z], [outer_r, fillet_center_z]],
      [for (a = [0 : 5 : 90])
        [fillet_center_r + BODY_TOP_FILLET_R * cos(a), fillet_center_z + BODY_TOP_FILLET_R * sin(a)]],
      [[0, BODY_H]]
    ));
}

module brand_engraving() {
  // Vertical "Attraccess" wordmarks, seven per row, each row rotated against the one below.
  outer_r = BODY_OUTER_D / 2;
  first_z = BODY_BOTTOM_Z + BRAND_VERTICAL_MARGIN;
  last_z = BODY_H - BODY_TOP_FILLET_R - BRAND_VERTICAL_MARGIN;
  row_count = floor((last_z - first_z) / BRAND_ROW_PITCH) + 1;
  // Centre the rows in the band so the spare height is split between top and bottom.
  start_z = first_z + (last_z - first_z - (row_count - 1) * BRAND_ROW_PITCH) / 2;
  for (row = [0 : row_count - 1])
    for (repeat = [0 : 6])
      rotate([0, 0, repeat * BRAND_REPEAT_ANGLE + row * BRAND_ROW_SHIFT])
        translate([0, -outer_r + BRAND_DEPTH, start_z + row * BRAND_ROW_PITCH])
          rotate([90, 0, 0])
            linear_extrude(BRAND_DEPTH + 0.01)
              rotate([0, 0, 90])
                text(BRAND, size = BRAND_SIZE, font = FONT, halign = "center", valign = "center", $fn = 16);
}

module body() {
  difference() {
    rounded_outer_body();
    translate([0, 0, BODY_BOTTOM_Z - 1])
      cylinder(d = BODY_SOCKET_D, h = -BODY_BOTTOM_Z + 1);
    cylinder(d = BODY_INSERT_D, h = BODY_H + 1);
    if (ANGLED) body_cable_cut();
    angled_seal_passages();
    brand_engraving();
  }
}

module cover() {
  difference() {
    translate([0, 0, COVER_START_Z])
      linear_extrude(COVER_H)
        c_ring_2d(COVER_INSERT_D, COVER_CABLE_OPEN_W);
    // The lower skirt is a thin locating sleeve; the ring above it retains the cable.
    translate([0, 0, COVER_START_Z])
      cylinder(d = COVER_SKIRT_INNER_D, h = COVER_SKIRT_END_Z - COVER_START_Z);
    angled_seal_passages();
  }
}

if (PART == "cover") cover();
else body();
