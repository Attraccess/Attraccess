// Attraccess smart-plug security cover.
// Reconstructed from the Nous A1 Onshape model and its multi-angle part renders.
// PART: "body" | "cover"; DEVICE and CABLE are supplied by the web configurator.

PART = "body";
DEVICE = "nous_a1";
CABLE = "straight_schuko";
FONT = "Sansation";

$fn = 64;

WALL = 1.6;                 // original Onshape two-line shell
CLEARANCE = 0.3;
FLOOR = 0.8;
BODY_H = 33;
COVER_H = 10;
SEAL_W = 3;
SEAL_H = 5;
SOCKET_OPEN_D = 23;
COVER_SKIRT_D = 40;
CABLE_OPEN_W = 30.9;
CABLE_CUT_H = 13.2;
BRAND = "Attraccess";

// Original Nous source dimensions: Ø49.7 body OD, Ø46.5 body bore, Ø46.0 cover skirt.
// The Shelly profile keeps the same 1.6 mm wall while growing the complete enclosure.
PLUG_D = DEVICE == "shelly_plus" ? 47 : 46.5;
BODY_OUTER_D = PLUG_D + 2 * WALL;
BODY_INNER_D = PLUG_D;
COVER_INSERT_D = BODY_INNER_D - 2 * CLEARANCE;
COVER_FLANGE_D = BODY_OUTER_D - 0.5;
CABLE_D = CABLE == "straight_euro" || CABLE == "angled_euro" ? 7 : 10;
ANGLED = CABLE == "angled_schuko" || CABLE == "angled_euro";

module front_gap_2d(width = CABLE_OPEN_W, diameter = BODY_OUTER_D) {
  translate([-width / 2, -diameter / 2 - 1]) square([width, diameter / 2 + 2]);
}

module c_ring_2d(outer_d, inner_d) {
  difference() {
    circle(d = outer_d);
    circle(d = inner_d);
    front_gap_2d(CABLE_OPEN_W, outer_d);
  }
}

module socket_u_opening_2d() {
  union() {
    circle(d = SOCKET_OPEN_D);
    front_gap_2d(CABLE_OPEN_W, COVER_FLANGE_D);
  }
}

module seal_openings_2d() {
  // The two top passages match the two radial side holes used by plomben.
  for (a = [45, 135])
    rotate(a) translate([(SOCKET_OPEN_D / 2 + BODY_OUTER_D / 2) / 2, 0])
      square([SEAL_W, SEAL_H], center = true);
}

module radial_seal_holes(z) {
  // Each hole crosses the body wall and the inserted cover skirt on the same radial axis.
  for (a = [45, 135])
    rotate([0, 0, a])
      translate([0, -SEAL_H / 2, z])
        cube([BODY_OUTER_D / 2 + 2, SEAL_H, SEAL_W]);
}

module body_cable_cut() {
  // Unlike the prior C-ring approximation, the cable mouth only opens the upper section.
  translate([-CABLE_OPEN_W / 2, -BODY_OUTER_D / 2 - 1, BODY_H - CABLE_CUT_H])
    cube([CABLE_OPEN_W, BODY_OUTER_D / 2 + 2, CABLE_CUT_H + 1]);
  if (ANGLED)
    translate([0, -BODY_OUTER_D / 2, BODY_H - CABLE_CUT_H])
      rotate([90, 0, 0]) cylinder(d = CABLE_D + 2, h = WALL + 2);
}

module body_brand() {
  // Raised lettering intersects the wall by 0.3 mm, making it an emboss rather than a floater.
  for (word = [0 : 2])
    for (i = [0 : len(BRAND) - 1]) {
      a = word * 120 + 5 + i * 110 / (len(BRAND) - 1);
      rotate([0, 0, a])
        translate([BODY_OUTER_D / 2 - 0.3, 0, BODY_H / 2])
          rotate([0, 90, 0]) linear_extrude(0.5)
            text(BRAND[i], size = 3.1, font = FONT, halign = "center", valign = "center");
    }
}

module body() {
  union() {
    difference() {
      // Closed lower body; only its upper cable-side section is opened.
      difference() {
        cylinder(d = BODY_OUTER_D, h = BODY_H);
        translate([0, 0, FLOOR]) cylinder(d = BODY_INNER_D, h = BODY_H + 1);
      }
      body_cable_cut();
      radial_seal_holes(BODY_H - CLAMP_H + 1);
    }
    body_brand();
  }
}

module cover_brand() {
  // Back of the top face stays clear of the socket and cable-mouth cutout.
  translate([0, 13, BODY_H + WALL - 0.2]) linear_extrude(0.5)
    text(BRAND, size = 3.5, font = FONT, halign = "center", valign = "center");
}

module cover() {
  union() {
    difference() {
      union() {
        // Ø46.0 skirt slides into the Ø46.5 main-body bore with 0.3 mm radial clearance.
        translate([0, 0, BODY_H - COVER_H])
          linear_extrude(COVER_H)
            c_ring_2d(COVER_INSERT_D, COVER_SKIRT_D);
        // Ø49.2 flange rests on the main-body rim and retains the plugged-in cable.
        translate([0, 0, BODY_H]) linear_extrude(WALL)
          difference() {
            circle(d = COVER_FLANGE_D);
            socket_u_opening_2d();
          }
      }
      translate([0, 0, BODY_H - 1]) linear_extrude(WALL + 2) seal_openings_2d();
      radial_seal_holes(BODY_H - COVER_H / 2);
    }
    cover_brand();
  }
}

if (PART == "cover") cover();
else body();
