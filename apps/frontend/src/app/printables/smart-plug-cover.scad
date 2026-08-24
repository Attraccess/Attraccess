// Attraccess smart-plug security cover.
// Reconstructed from the Nous A1 Onshape model and its multi-angle part renders.
// PART: "body" | "cover"; DEVICE and CABLE are supplied by the web configurator.

PART = "body";
DEVICE = "nous_a1";
CABLE = "straight_schuko";
FONT = "Sansation";

$fn = 64;

// Nous A1 dimensions measured from the source STEP assembly.
// The top and bottom retain their assembly Z coordinates so their slots align.
BODY_OUTER_D = DEVICE == "shelly_plus" ? 54.2 : 53.7;
BODY_INSERT_D = DEVICE == "shelly_plus" ? 47 : 46.5;
BODY_SOCKET_D = DEVICE == "shelly_plus" ? 38 : 37.5;
BODY_H = 60.8;
INSERT_START_Z = 37.6;
COVER_START_Z = 43;
COVER_H = BODY_H - COVER_START_Z;
COVER_INSERT_D = BODY_INSERT_D - 0.6;
COVER_SKIRT_INNER_D = 40.5;
COVER_SKIRT_END_Z = 55;
COVER_OPEN_D = 30.9;
BODY_CABLE_OPEN_W = 34.1727272727272;
COVER_CABLE_OPEN_W = 30.9;
CABLE_CUT_START_Z = 36.6;
SEAL_SLOT_W = 5;
SEAL_PASSAGE_H = 3;
SEAL_PASSAGE_R = 18.55;
SEAL_PASSAGE_LEN = BODY_OUTER_D;
SEAL_PASSAGE_ANGLE = 30;
CABLE_D = CABLE == "straight_euro" || CABLE == "angled_euro" ? 7 : 10;
ANGLED = CABLE == "angled_schuko" || CABLE == "angled_euro";

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
  // An overlong cutter guarantees a full pierce through every body and cover
  // wall it intersects while preserving the source top-hole position.
  for (a = [0, 180])
    rotate([0, 0, a])
      translate([SEAL_PASSAGE_R, 0, BODY_H])
        rotate([0, -SEAL_PASSAGE_ANGLE, 0])
          translate([0, -SEAL_SLOT_W / 2, -SEAL_PASSAGE_H / 2])
            cube([SEAL_PASSAGE_LEN, SEAL_SLOT_W, SEAL_PASSAGE_H]);
}

module body_cable_cut() {
  // The source cable mouth opens only the upper 24.2 mm of the body.
  translate([-BODY_CABLE_OPEN_W / 2, -BODY_OUTER_D / 2 - 1, CABLE_CUT_START_Z])
    cube([BODY_CABLE_OPEN_W, BODY_OUTER_D / 2 + 2, BODY_H - CABLE_CUT_START_Z + 1]);
  if (ANGLED)
    translate([0, -BODY_OUTER_D / 2, CABLE_CUT_START_Z])
      rotate([90, 0, 0]) cylinder(d = CABLE_D + 2, h = 3);
}

module body() {
  difference() {
    cylinder(d = BODY_OUTER_D, h = BODY_H);
    cylinder(d = BODY_SOCKET_D, h = BODY_H + 1);
    translate([0, 0, INSERT_START_Z])
      cylinder(d = BODY_INSERT_D, h = BODY_H - INSERT_START_Z + 1);
    body_cable_cut();
    angled_seal_passages();
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
