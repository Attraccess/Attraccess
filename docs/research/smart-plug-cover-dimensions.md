# Smart-plug cover dimensions

- Date: 2026-08-24
- Scope: Nous A1T/A1Z and comparable Shelly Schuko smart plugs
- Purpose: establish which public dimensions are safe to use for the printable cover

## Conclusion

Public manufacturer data is sufficient to identify the products' overall retail
envelopes, but not to dimension a close-fitting cover. Nous publishes the A1T and
A1Z at the same `46 x 46 x 72 mm`; this supports treating them as one _nominal
envelope class_, but does not prove that every cover-contacting surface is
identical. Shelly Plus Plug S is smaller at `44 x 44 x 70 +/-0.5 mm`, while the
legacy Shelly Plug S is published as `46 x 69 mm`. None is proven mechanically
interchangeable with the Nous profile.

The plug standards identify mating interfaces, not a universal moulded plug-head,
strain-relief, or cable envelope. Consequently, `straight_schuko`,
`angled_schuko`, `straight_euro`, and `angled_euro` cannot have defensible
universal opening dimensions based on the connector name alone. Openings should
be derived from the actual appliance plug and cable measurements listed below.

## Published device envelopes

| Device             | Manufacturer identification          | Published size           | What the size establishes                                                                  | Source                                                                                            |
| ------------------ | ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Nous A1T           | Tasmota Wi-Fi socket                 | `46 x 46 x 72 mm`        | Overall product envelope only; no tolerance or dimensioned drawing                         | [Nous A1T product page](https://nous.technology/product/a1t.html)                                 |
| Nous A1Z           | Zigbee socket                        | `46 x 46 x 72 mm`        | Overall product envelope only; no tolerance or dimensioned drawing                         | [Nous A1Z product page](https://nous.technology/product/a1z-1.html)                               |
| Shelly Plus Plug S | Model `SNPL-00112EU`                 | `44 x 44 x 70 +/-0.5 mm` | Overall H/W/D; input is CEE 7/7 and output is CEE 7/3                                      | [Shelly Plus Plug S documentation](https://www.shelly.com/blogs/documentation/shelly-plus-plug-s) |
| Shelly Plug S      | Legacy Wi-Fi socket                  | `46 x 69 mm`             | Two-value overall size, conventionally diameter by depth; no tolerance or detailed drawing | [Shelly Plug S documentation](https://www.shelly.com/blogs/documentation/shelly-plug-s)           |
| Shelly Plug S Gen3 | Current-generation Schuko smart plug | `44 x 44 x 70 +/-0.5 mm` | Same published envelope as Plus Plug S, but no cover-critical drawing                      | [Shelly Plug S Gen3 product page](https://www.shelly.com/products/shelly-plug-s-gen3)             |

Dimensions above include features such as the mains pins and/or socket-side rim
unless the manufacturer says otherwise. They do not identify the cylindrical body
diameter at the cover engagement plane, usable axial body length, local tapers,
fillets, button protrusion, or production tolerance.

## A1T and A1Z interchangeability

The A1T and A1Z manufacturer pages publish the same dimensions and show the same
general enclosure form. This is reasonable evidence for offering one UI profile,
but not enough evidence for asserting mechanical identity:

- Nous supplies no dimensioned enclosure drawing, part number, or tolerance for
  either shell.
- Equal three-axis retail dimensions can hide different rims, tapers, buttons,
  seams, and manufacturing revisions.
- Product images are not metrology and should not be scaled for a press or slip
  fit.

**Decision:** keep one nominal `Nous A1T / A1Z` profile only if it is described as
sample-validated. Before release, measure at least one A1T and one A1Z at every
cover contact plane. Split the profile if any contact dimension differs by more
than the intended radial or axial clearance.

## Shelly interchangeability

No Shelly model is dimensionally interchangeable with the Nous profile on the
available evidence.

- Plus Plug S is nominally 2 mm narrower and 2 mm shorter overall than the Nous
  envelope. Its published `+/-0.5 mm` tolerance alone is significant for a
  close-fitting printed sleeve.
- Legacy Plug S shares a nominal `46 mm` first dimension with Nous, but its second
  dimension is `69 mm` instead of `72 mm`; matching one retail dimension does not
  establish a matching engagement surface.
- Plug S Gen3 publishes the same envelope as Plus Plug S, but must still be treated
  as a separate physical product until their cover-contacting surfaces are measured.

The SCAD's Shelly presets apply the published diameter and depth deltas to the
STEP-derived Nous profile. This is useful for prototyping, but it does not make the
unpublished Shelly contact geometry manufacturer-derived. The Nous values have
stronger evidence for that particular model, but still need validation against
physical production samples.

## Connector and cord implications

Shelly identifies Plus Plug S's wall-side input as CEE 7/7 and its output as CEE
7/3. MENNEKES likewise describes Schuko products as conforming to DIN VDE 0620
and related national standards. These standards constrain safe electrical mating
geometry. They do not impose one maximum envelope on the moulded body behind an
appliance's CEE 7/7, CEE 7/4, or CEE 7/16 pins.

The same limitation applies to cords. Conductor count and cross-section do not
uniquely determine the finished cable diameter: insulation system, jacket,
manufacturer, flexibility class, and flat versus round construction all matter.
A connector family therefore cannot safely select a single cable diameter.

Relevant primary references:

- [MENNEKES Schuko overview](https://www.mennekes.de/industry/produkte/produktspezifisch/steckvorrichtungen-internationaler-standards/schukor/)
- [Shelly Plus Plug S supported CEE interfaces](https://www.shelly.com/blogs/documentation/shelly-plus-plug-s)

## Representative manufacturer bounds

The following products are useful boundary examples, not a statistically complete
survey and not dimensions mandated by the connector standards:

| Product                                            | Relevant published dimensions                                   | Use in this design                                                                                          | Primary source                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bals `7371`, straight CEE 7/7-compatible plug      | `42 x 42 x 122 mm`; straight entry                              | An ordinary rewireable plug head can already be `42 mm` across                                              | [Bals 7371](https://catalogue.bals.com/de/Elektrotechnik-fuer-Industrie-und-Handwerk/Steckvorrichtungen/Schutzkontakt-Steckvorrichtungen/Schutzkontakt-Stecker/deutsch-und-belg-fr-System/p/7371)             |
| Bals `7371-1`, current replacement                 | `42 x 42 x 138 mm`; straight entry                              | Confirms the same cross-section with a substantially longer grip/relief assembly                            | [Bals 7371-1](https://catalogue.bals.com/de/Elektrotechnik-fuer-Industrie-und-Handwerk/Steckvorrichtungen/Schutzkontakt-Steckvorrichtungen/Schutzkontakt-Stecker/deutsch-und-belg-fr-System/p/7371-1)         |
| Bals `736`, sealed CEE 7/7-compatible plug         | `80 x 66 x 124 mm`; maximum cable diameter `14 mm`              | Outlier showing why neither head size nor cable size has a useful universal Schuko maximum                  | [Bals 736](https://catalogue.bals.com/de/Elektrotechnik-fuer-Industrie-und-Handwerk/Steckvorrichtungen/Schutzkontakt-Steckvorrichtungen/Schutzkontakt-Stecker/mit-Verschraubung%2C-mit-Verschlusshaube/p/736) |
| Schurter `4782`, rewireable IEC C13 cord connector | Recommended cable diameters `8.5 mm` and `10 mm`                | Independent primary evidence that common three-core appliance cords reach `10 mm`; not a wall-plug envelope | [Schurter 4782](https://www.schurter.com/en/datasheet/4782)                                                                                                                                                   |
| Schurter `4732` / `4735`, rewireable IEC E plugs   | Recommended cable diameter `8.1 mm` or `10 mm`, depending model | Additional cord-entry evidence only; IEC 60320 plug E is not CEE 7/7 or CEE 7/16                            | [Schurter 4732](https://www.schurter.com/en/datasheet/4732), [Schurter 4735](https://www.schurter.com/en/datasheet/4735)                                                                                      |

The Bals `736` includes a sealing cap and is intentionally not an ordinary
domestic-appliance target. Its size is still valuable negative evidence: defining a
large enough opening for every standards-compliant Schuko plug is not a sensible
product goal. Compatibility must name an appliance plug envelope or a bounded
consumer moulded-plug class.

## Opening recommendations

Do not encode `7 mm` as "Euro cable" or `10 mm` as "Schuko cable" without naming
and measuring the supported cord. Those values are plausible prototype defaults,
not standards-derived limits.

Use the following rules for a measured plug/cable combination:

| Variant           | Geometry to measure                                                                                                                            | Initial FDM opening rule                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `straight_schuko` | Maximum plug-head and strain-relief section that must pass through the split/open side; round cable diameter or flat cable width and thickness | Measured rigid overmould envelope `+1.0 mm` on each opening dimension; measured flexible cable envelope `+2.0 mm` diametrically or `+1.0 mm` per slot side |
| `angled_schuko`   | Maximum right-angle head width, height, depth, cable exit offset, relief envelope, and cable section                                           | Sweep the measured head/relief through the assembly path; apply the same clearances, then verify that the cable cannot be pinched at the bend              |
| `straight_euro`   | CEE 7/16 moulded head, relief, and actual two-core cable section                                                                               | Same measured-envelope rule; do not use pin geometry as the moulded-head envelope                                                                          |
| `angled_euro`     | Right-angle head, bend offset, relief, and actual cable section                                                                                | Same swept-envelope rule as angled Schuko                                                                                                                  |

The `1.0 mm` values are starting clearances for ordinary FDM prototypes, not a
universal production tolerance. Print a short fit coupon first. Increase clearance
for elephant-foot, rough support surfaces, flexible overmould drag, printer
variation, or users who must assemble the cover without tools. Do not make the
opening smaller than the cord merely to create retention: a hard printed edge must
not compress, abrade, or sharply bend mains insulation.

### Proposed configurable defaults

For the current prototype, use the following exact values as UI/CAD defaults. These
are bounded engineering defaults, not values supplied by CEE 7 or IEC 60884. The
`maximum` column is a control limit for this printable, not a claim that every plug
at or below that cord size will fit; head and relief fit remain separate checks.

| Variant           | Cord-section default | Cord-section control limit | Generated free opening       | Evidence and uncertainty                                                                                                                 |
| ----------------- | -------------------- | -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `straight_schuko` | round `10 mm`        | round `14 mm`              | default `12 mm`; max `16 mm` | `10 mm` is supported by Schurter appliance-cord entries; `14 mm` is the Bals 736 entry limit. Plug head and relief remain unbounded.     |
| `angled_schuko`   | round `10 mm`        | round `14 mm`              | original lateral profile     | Same cord evidence as straight Schuko. The SCAD retains its `30.9 mm` cover slot and `34.1727 mm` body mouth; height remains adjustable. |
| `straight_euro`   | round `7 mm`         | round `10 mm`              | default `9 mm`; max `12 mm`  | `7 mm` preserves the prototype assumption; `10 mm` is a conservative appliance-cord control bound, not a CEE 7/16 requirement.           |
| `angled_euro`     | round `7 mm`         | round `10 mm`              | original lateral profile     | Same cord evidence as straight Euro. The SCAD retains its original lateral profile because the right-angle head is not publicly bounded. |

Generate each round opening as `measured cord diameter + 2.0 mm`, which gives
`1.0 mm` nominal clearance per side. Let the user increase total diametral
clearance from `2.0 mm` to `4.0 mm` for printer variation, but do not let a preset
reduce it below `2.0 mm`. Treat these as nominal CAD dimensions with at least
`+/-0.5 mm` fit uncertainty until a printed coupon from the user's printer has been
measured.

Flat cords need two independent controls. Until a primary cable datasheet and a
physical target are selected, do not silently map a flat cord to one of the round
defaults. Require measured width and thickness, then generate
`(measured width + 2.0 mm) x (measured thickness + 2.0 mm)`. This means the four
named presets are usable defaults for round cords only; a separate `custom flat`
choice is required for honest compatibility.

No exact plug-head gate is proposed. The ordinary Bals example is `42 mm` across,
while the sealed example reaches `80 x 66 mm`; using the latter as a universal
maximum would defeat the compact cover. A head/strain-relief compatibility check
must therefore accept measured width, height, depth, and cable-exit offset and
reject combinations whose swept envelope intersects the device-specific shell.

For the existing SCAD specifically:

- Straight cable openings default to `12 mm` for Schuko and `9 mm` for Euro. Each
  value sizes the central opening and the matching cover slot.
- Straight presets leave the body cylinder closed. The cover remains a C-ring so
  the cable can be inserted laterally, with its slot equal to the central opening.
- Both angled presets retain the original `30.9 mm` cover opening and `34.1727 mm`
  body mouth. The configurable dimensions are the original `17.8 mm` height above
  the plug and `24.2 mm` body-cutout height. These dimensions must be checked
  against the maximum plug-head/relief section and actual assembly path.
- A round `CABLE_D` cannot represent common flat two-core cords. Add width and
  thickness parameters if a supported Europlug appliance uses flat cable.

## Measurements required before CAD release

Record values to `0.1 mm` with calipers where accessible, identify the exact
product/revision, and photograph each measurement orientation. Repeat critical
dimensions on multiple samples if the cover is intended for distribution.

For each A1T, A1Z, and Shelly model to be supported:

1. Maximum body diameter or width/height, including seam flash.
2. Body diameter at the lower bore, cover start, locating-skirt end, and top edge
   used by the current model (`z = 0`, `43`, `55`, and `60.8 mm` in SCAD terms).
3. Straight usable cylindrical length and the start/end of every taper or fillet.
4. Socket recess diameter, socket-side rim diameter/height, and any keying feature.
5. Overall depth both excluding and including mains pins, with the reference face
   stated explicitly.
6. Button/LED position, size, and maximum protrusion.
7. Shell seam and label positions if they affect friction or access.
8. Fit result with a printed radial-clearance coupon, including printer, material,
   layer height, and measured printed bore.

For every supported appliance plug, measured separately for all four UI variants:

1. Exact connector/cord make and model; connector class alone is insufficient.
2. Plug-head maximum width, height, diameter where applicable, and axial depth.
3. Strain-relief maximum width/height or diameter, length, taper, and minimum bend
   point.
4. Cable section at three positions beyond the relief: diameter for round cable,
   or width and thickness for flat cable; record the maximum.
5. For angled plugs, pin-axis-to-cable-axis offset, head projection from the socket
   face, cable exit angle, and swept envelope needed during cover assembly.
6. Required minimum bend radius from the cord or appliance manufacturer, if
   available; otherwise ensure the cover does not force a bend at the relief.

## Evidence boundary

The manufacturer pages were accessed on 2026-08-24. They are live product pages
and may change. Bals supplies whole-device dimensions and selected cable-entry
limits, and Schurter supplies recommended cable diameters, but no public source
located in this review supplied a complete set of fit-critical smart-plug contact
planes, consumer moulded-plug dimensions, strain-relief dimensions, or flat-cord
sections needed for final CAD. Those missing values should remain marked as
measured prototype data rather than manufacturer specifications.
