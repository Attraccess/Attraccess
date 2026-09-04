// Attraccess smart-plug security cover.
// Reconstructed from the Nous A1 Onshape model and its multi-angle part renders.
// PART: "body" | "cover"; DEVICE and CABLE are supplied by the web configurator.

PART = "body";
DEVICE = "nous_a1";
CABLE = "angled_schuko";
DEVICE_EXTRA_D = 0;
CORD_OPEN_D = 30.9;
HEIGHT_ABOVE_PLUG = 17.8;
CABLE_CUT_H = 24.2;
FONT = "Sansation";
BRAND = "Attraccess";

$fn = 64;

// The Nous profile is STEP-derived. Shelly only publishes overall envelopes, so
// those presets apply the published diameter/depth deltas to the proven profile.
PROFILE_DEVICE_D = DEVICE == "shelly_plus_gen3" ? 44 : 46;
PROFILE_DEPTH = DEVICE == "shelly_plus_gen3" ? 70 : DEVICE == "shelly_legacy" ? 69 : 72;
BODY_INSERT_D = PROFILE_DEVICE_D + 0.5 + DEVICE_EXTRA_D;
BODY_OUTER_D = BODY_INSERT_D + 7.2;
BODY_SOCKET_D = BODY_INSERT_D - 9;
BASE_BODY_H = 60.8 + PROFILE_DEPTH - 72;
BODY_BOTTOM_Z = -0.8;
BODY_TOP_FILLET_R = 1;
COVER_START_Z = BASE_BODY_H - 17.8;
BODY_H = COVER_START_Z + HEIGHT_ABOVE_PLUG;
COVER_H = BODY_H - COVER_START_Z;
COVER_INSERT_D = BODY_INSERT_D - 0.6;
COVER_SKIRT_INNER_D = BODY_INSERT_D - 6;
COVER_SKIRT_END_Z = COVER_START_Z + 12;
COVER_OPEN_D = CORD_OPEN_D;
COVER_CABLE_OPEN_W = CORD_OPEN_D;
BODY_CABLE_OPEN_W = COVER_CABLE_OPEN_W + 3.2727272727272;
CABLE_CUT_START_Z = BODY_H - CABLE_CUT_H;
CABLE_OUTER_BLEND_Y = -sqrt(pow(BODY_OUTER_D / 2, 2) - pow(BODY_CABLE_OPEN_W / 2, 2)) - 0.2292;
CABLE_INNER_BLEND_Y = CABLE_OUTER_BLEND_Y + 1.001;
SEAL_SLOT_W = 5;
SEAL_PASSAGE_H = 3;
SEAL_PASSAGE_R = 18.55;
SEAL_PASSAGE_LEN = BODY_OUTER_D;
SEAL_PASSAGE_ANGLE = 45;
SEAL_PASSAGE_NORMAL_H = SEAL_PASSAGE_H / sqrt(2);
ANGLED = CABLE == "angled_schuko" || CABLE == "angled_euro";
BRAND_SIZE = 3.2;
BRAND_DEPTH = 1.4;
BRAND_ROW_PITCH = 10;
BRAND_VERTICAL_MARGIN = 7;
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
  // The 45-degree passage projects to a 3 x 5 mm opening on both the top and
  // cylindrical faces. Its center crosses the top at the source x = 18.55 mm.
  for (a = [0, 180])
    rotate([0, 0, a])
      translate([SEAL_PASSAGE_R, 0, BODY_H])
        rotate([0, SEAL_PASSAGE_ANGLE, 0])
          cube([SEAL_PASSAGE_LEN, SEAL_SLOT_W, SEAL_PASSAGE_NORMAL_H], center = true);
}

module body_cable_cut() {
  // The rounded source mouth is 34.1727 mm wide at the outer face and blends
  // to the cover's 30.9 mm opening one millimeter higher at the inner bore.
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
  outer_r = BODY_OUTER_D / 2;
  row_count = floor((BODY_H - BODY_BOTTOM_Z - 2 * BRAND_VERTICAL_MARGIN) / BRAND_ROW_PITCH) + 1;
  for (row = [0 : row_count - 1])
    for (repeat = [0 : 6])
      rotate([0, 0, repeat * BRAND_REPEAT_ANGLE + row * BRAND_ROW_SHIFT])
        translate([0, -outer_r + BRAND_DEPTH, BODY_BOTTOM_Z + BRAND_VERTICAL_MARGIN + row * BRAND_ROW_PITCH])
          rotate([90, 0, 0])
            linear_extrude(BRAND_DEPTH + 0.01)
              rotate([0, 0, 90])
                text(BRAND, size = BRAND_SIZE, font = FONT, halign = "center", valign = "center");
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
        c_ring_2d(COVER_INSERT_D, COVER_OPEN_D);
    // The lower skirt is a thin Ø45.9/Ø40.5 locating sleeve; the upper ring
    // retains the Ø30.9 cable opening.
    translate([0, 0, COVER_START_Z])
      cylinder(d = COVER_SKIRT_INNER_D, h = COVER_SKIRT_END_Z - COVER_START_Z);
    angled_seal_passages();
  }
}

if (PART == "cover") cover();
else body();
