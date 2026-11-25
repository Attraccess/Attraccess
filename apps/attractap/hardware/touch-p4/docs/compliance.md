# CE and market checklist

A PCB cannot be "CE conform" on its own: the CE mark applies to the finished
reader (board, display, enclosure, power supply, firmware and documents). This
page lists what applies in Germany and the EU, what the board design already
does for it, and what is still open.

It is a working checklist with the state of November 2026, not legal advice.
The legal texts and the lists of harmonised standards were read at their
sources (links at the end). Standards that are not free to read (EN 18031,
EN 55032, EN 55035 and the current editions of EN IEC 62368-1) were not; what
this page says about their content is marked "confirm with the lab". The
exception is the fire clause of EN 62368-1: it was read in the 2014 edition,
with UL's published answers on the 2018 edition and two published test reports
(see "Enclosure plastic").

## Will it be easy?

Radio, EMC and safety are ordinary work for a test lab, and the certified
Wi-Fi module takes part of it away. Registrations and paperwork are small.
Cybersecurity is the hard part, and it does not depend on the board:

1. **Cyber Resilience Act.** An access control reader is an "important
   product, class I". From 11 December 2027 the manufacturer may declare
   conformity himself only if a harmonised standard for this product class is
   published and applied in full. The standard (prEN 40000-10) is a draft.
   Without it a notified body has to examine the product.
2. **EN 18031 until then.** Since 1 August 2025 the reader needs EN 18031-1 and
   -2 applied in full, with no way to use it without a password or PIN.
   Otherwise a notified body is needed already now.
3. **First visit to the lab.** The reader's own NFC transmitter, two cable
   ports and discharges onto a glass display are where a first run usually
   fails. Measuring beforehand decides whether the lab is visited once or
   three times.
4. **What exactly is sold.** Enclosure material, a supply in the box or not,
   allowed cable lengths, business customers only or private buyers too, and
   the number of versions each add or remove tests.

## Which rules apply

| Rule | Applies | What the manufacturer has to do |
|---|---|---|
| Radio Equipment Directive 2014/53/EU (RED) | yes | The reader contains radios: Wi-Fi and Bluetooth, and the 13.56 MHz NFC reader. Assess safety, EMC, radio and cybersecurity, keep a technical file for ten years, issue one EU declaration of conformity, put the CE mark on the device and its packaging, and name, postal address, type and serial number on the device. German instructions with frequency bands and maximum transmit power. |
| Low Voltage and EMC Directives | not separately | For radio equipment the RED covers both. The declaration names the RED. |
| RED cybersecurity, Delegated Regulation (EU) 2022/30 | yes, until 10 December 2027 | Applies since 1 August 2025: network protection, because the reader is connected to the internet, and protection of personal data, because it processes card numbers and names. Repealed from 11 December 2027 by Delegated Regulation (EU) 2026/339, when the Cyber Resilience Act takes over. |
| Cyber Resilience Act (EU) 2024/2847 | yes | Since 11 September 2026: report exploited vulnerabilities and severe incidents within 24 and 72 hours. That already covers readers sold today. From 11 December 2027: full conformity for every unit placed on the market, with at least five years of security updates. See "Cybersecurity". |
| RoHS 2011/65/EU | yes | Keep supplier declarations for all parts and the PCB. RoHS is named on the declaration of conformity. |
| REACH, Article 33, and the SCIP database | yes | Tell customers when a part contains a listed substance above 0.1 %, and notify it to ECHA. Lead in some components is the usual case. |
| WEEE / ElektroG | yes | Register brand and device type with stiftung ear before the first sale (two to four weeks; about 130 EUR a year). Decide between business and household device: a business device needs a take-back concept, a household device a guarantee. A wall reader for workshops has a good case for a business device; selling to private buyers weakens it. Crossed-out bin on the device, registration number on offers and invoices. Every other EU country needs its own registration. |
| Packaging: Regulation (EU) 2025/40 and the German VerpackDG | yes | Register in LUCID, take part in a dual system for packaging that ends up with private users, report quantities. This replaced the Verpackungsgesetz on 12 August 2026. |
| Batteries Regulation | no | The board has no battery. It applies as soon as one is added. |
| General Product Safety Regulation (EU) 2023/988 | only if consumers buy it | Rules for distance sales, accident reports and recalls. |
| Data Act (EU) 2023/2854 | in scope, main duties exempt | The reader is a "connected product". The duties to give access to its data do not apply to a micro or small enterprise. Check again when the company grows. |
| USB-C common charger rule | no | Only covers listed categories of rechargeable devices. |
| Funkanlagengesetz | yes | The German form of the RED. The Bundesnetzagentur supervises. |
| Product liability | yes | The new directive applies to products placed on the market after 9 December 2026 and names software and missing security updates as defects. Insure accordingly. |

## Standards a lab applies

"Cited" means published in the Official Journal: applying the standard in full
then counts as proof. For radio and cybersecurity only cited standards allow a
declaration without a notified body. For safety and EMC the manufacturer may
always declare himself.

| Aspect | Standard | State on 15 November 2026 |
|---|---|---|
| Radio, 2.4 GHz | EN 300 328 V2.2.2 | cited |
| Radio, 13.56 MHz | EN 300 330 V2.1.1 | cited |
| EMC | EN 301 489-1 V2.2.3, -3 V2.3.2 (NFC), -17 V3.3.1 (Wi-Fi, Bluetooth) | parts 3 and 17 cited; part 1 is their common base |
| EMC, Ethernet port | EN 55032 (emission), EN 55035 (immunity) | EN 55035:2017 cited |
| Safety | EN IEC 62368-1:2020 + A11, or the 2024 edition | not cited under the RED; ask the lab which edition it reports to |
| RF exposure | EN IEC 62311 with EN 50665; EN 50364 for the NFC reader | not cited under the RED |
| Cybersecurity | EN 18031-1 (network) and EN 18031-2 (personal data) | cited with restrictions, see below |

For NFC the carrier limit is no concern: a loop of this size stays about 50 dB
below it (estimate). The harmonics are. The PN532 drives the antenna with a
square wave, and several harmonics fall into bands where only 4 nW may be
radiated (54, 68, 95, 108 and 176 to 217 MHz). The small loop hardly radiates
them; the DC and Ethernet cables next to it do.

## What the certified Wi-Fi module saves

The reader uses the ESP32-C6-MINI-1U, the module with an antenna connector.
It has an EU-type examination certificate (Sporton, notified body 2907,
SN24C0053 of 6 March 2024); the MINI-1 with PCB antenna, which the board had
before, has its own (SN23C0148 of 28 September 2023). They cover safety, EMC
and radio, not cybersecurity. Espressif publishes the certificates only: ask
for the test reports before asking labs for quotes.

The certificates do not transfer to the reader. In practice (ETSI EG 203 367)
the lab reuses the module's conducted radio results if the module is used as
its datasheet says, and measures on the reader what depends on the reader:

- radiated power and spurious emissions, with NFC transmitting at the same
  time,
- EMC with all radios running,
- RF exposure. The module is certified on condition of 20 cm distance to
  persons. A reader that is touched does not keep that, so it needs its own
  assessment; a calculation is usually enough.

Points to watch:

- One German notified body (VDE) reads the rules more strictly and wants an
  examination whenever only module reports exist. Ask each lab how it sees
  this before it quotes.
- The module is certified up to 19.8 dBm against a limit of 20 dBm. Keep the
  transmit power a firmware setting.
- The antenna is not part of the module. The module's datasheet (v1.5,
  section 10.2) asks for 2.4 GHz, 50 ohm and a gain of 2.33 dBi at most, the
  gain of the antenna used for certification, a monopole. For an antenna "of
  a different type or gain, additional testing, such as EMC, may be required
  beyond the existing antenna test reports". An adhesive antenna is often
  another type: ask the lab what it reuses.
- Two antenna configurations are planned, and each one that is sold is a
  radio configuration in the test plan:
  - an adhesive antenna inside the case. It is fixed and out of reach: one
    named antenna, tested with the reader.
  - an antenna on an SMA bulkhead. The user can unscrew it, so the manual
    must name the permitted antenna or antennas, and the declaration covers
    only those.
- Neither antenna is chosen, and the case has no place for one yet
  ([design-notes.md](design-notes.md#wi-fi-antenna)). Where the antenna sits
  in the case decides the radiated results, not the board: keep it away from
  the display's metal back and from the cables.

## Cybersecurity

**Now, under the RED.** A declaration without a notified body needs EN 18031-1
and -2 applied in full. The standards are cited with a restriction: they do not
count if the user is allowed not to set and use a password. So every access to
settings, pairing and the service interface has to be authenticated, with
credentials that are unique per device or set at first use and cannot be
skipped. Then every requirement of both parts is documented with the
standard's decision trees. The firmware of the ESP32-C6 is part of the
product. (The standard's text was not read for this page: confirm with the lab.)

**From 11 December 2027, under the Cyber Resilience Act.**

- The reader is class I. Annex III of the Act lists "identity management
  systems and privileged access management software and hardware, including
  authentication and access control readers, including biometric readers";
  Implementing Regulation (EU) 2025/2392 describes the category.
- A class I product may be assessed by its manufacturer only where harmonised
  standards exist and are applied in full (Article 32(2)). Otherwise a
  notified body examines it. EN 18031 does not count here.
- The standard for this category, prEN 40000-10, was out for comment in
  summer 2026. No standard has been cited for the Act yet. Whether this one is
  cited before December 2027 is open: plan for both outcomes, and look again
  in the first half of 2027.
- Open source helps less than it seems. The Act lets "products qualifying as
  free and open-source software" in class I be self-assessed if their
  technical documentation is public. The definition covers software. Whether
  a hardware reader with open firmware qualifies is not settled; the BSI is
  the authority to ask. Publishing the documentation costs this project
  nothing in any case.
- There is no exemption for small companies, only smaller fees and a
  simplified documentation form that is not yet published.

What it needs in substance: secure boot and flash encryption on the ESP32-P4
(see [firmware-port.md](firmware-port.md) for an erratum that matters here),
signed firmware updates for both processors, no default credentials, a
written risk assessment, a software bill of materials, a stated support period
of at least five years, a contact address for vulnerability reports and a
written procedure for the 24-hour report. The reporting duty applies already.

## Safety

- Every supply of the reader is below 60 V DC: PoE, the 12 to 24 V input, USB.
  That is the limit below which a voltage may be touched (EN 62368-1:2014,
  table 4), and both published test reports named below class a PoE input
  that way. No insulation against electric shock is needed anywhere in the
  reader. The work is fire protection, heating, mechanics and marking.
- Limit the supplies in writing. The manual and the label must say that the DC
  input may only be connected to a supply limited to 100 W, or better to 15 W
  (the lab knows the wording its edition of the standard wants). Without a
  stated limit the lab counts the input as unlimited, and then the whole case
  must be flame-retardant. The board has a self-resetting fuse of 1.1 A at the
  DC input and of 2 A at USB; at USB the eFuse also limits the current to 1.8
  to 2.2 A.
- Enclosure: a plastic whose data sheet states HB at least. Flame-retardant
  plastic is needed only where the lab finds a part that could ignite. See
  "Enclosure plastic" below.
- PCB: FR-4 rated V-0 with a UL mark; the standard asks for V-1 or better
  (clause 6.4.5.2). Ask JLCPCB for it.
- A supply sold with the reader becomes part of the tested product. Buy one
  with its own report.
- The proximity sensor (U704) sends infrared light of 940 nm from an LED,
  not from a laser: the laser standard EN 60825-1 does not apply and the
  reader needs no laser label. The LED pulses with 200 mA at most, for a
  millisecond at most and for no more than 1/40 of the time, inside the
  closed case. Ask the lab whether its edition of the safety standard wants
  anything on record for it. (Not checked against the standard.)
- PoE isolation is asked for by the Ethernet standard (1500 V RMS for a
  minute), not by the safety standard, because both sides may be touched. A
  lab testing for CE may not test it; customers expect it. What the board does
  for it, and where it is weak, is in
  [design-notes.md](design-notes.md#poe-isolation).

### Enclosure plastic

The first version of this page asked for "UL 94 V-1 or better" for the whole
case. That is stricter than the standard. Checked on 24 November 2026 against
clause 6 of EN 62368-1 in the 2014 edition, UL's published answers on the 2018
edition and two published test reports of PoE devices. The 2018 and 2023
editions themselves were not read, and labs report to those: the lab has the
last word.

What the case plastic must be depends on the power a circuit can get from its
supply into a fault, not on what the reader uses:

| Power a circuit can get | Class | Case plastic |
|---|---|---|
| up to 15 W, three seconds into the fault | PS1 | HB, the lowest flammability class, shown by the material's data sheet (clause 6.3.1; the standard names it HB75 below 3 mm of wall and HB40 from 3 mm). Nothing more: no part of such a circuit counts as able to ignite. |
| up to 100 W | PS2 | HB, and no fire enclosure. If a part of the circuit counts as a potential ignition source, plastic closer than 13 mm beside it or 50 mm above it must be V-1, or pass a flame test (annex S), or lie behind a barrier of metal or V-1 material (clauses 6.4.5 and 6.4.7). |
| more, or a supply without a stated limit | PS3 | A fire enclosure: the whole case V-1 or better (clauses 6.4.6 and 6.4.8). |

A potential ignition source is

- a part that dissipates more than 15 W, in normal use or 30 seconds after a
  single fault (clause 6.2.3.2). The 2014 edition counted the power available
  to the part, which made nearly every part of a PS2 circuit one. The 2018
  edition counts what the part itself dissipates (UL).
- a contact or joint that can open at more than 50 V, if that voltage times
  the current is more than 15 (clause 6.2.3.1).

UL's answer to "could the product's polymeric enclosure be flame rated HB"
when its supply is power-limited: "If the proper PIS separation distances are
maintained, an HB rated casing may be fine. If not, a casing material with a
V-1 or V-0 rating typically would be required."

The reader's three inputs:

| Input | Power it can get | Class | Potential ignition source |
|---|---|---|---|
| USB-C | 15 W: the board asks for 5 V only, and a port gives 3 A at most. Behind the 2 A fuse 12.5 W, by the standard's rule of 125 % of a fuse's rating (clause 6.2.2.2). | PS1 | none |
| PoE (LAN version) | More than 15 W. A lab measured 33.6 W at the port of a comparable device. | PS2 | The voltage is above 50 V, but volts times amps is the power the reader takes from the port: 3 to 9 W against the threshold of 15. Whether a fault makes the PoE module or the parts before it dissipate more than 15 W is for the lab's fault test. |
| 12 to 24 V terminal | Behind the 1.1 A fuse 33 W at 24 V. Before the fuse, what the supply gives. | PS2 with a supply limited to 100 W, PS1 with one limited to 15 W, PS3 without a limit | Below 50 V, so only the 15 W rule applies. The fault test decides. |

The reader takes about 2.5 W in normal use (estimate), at most 4.5 W (0.90 A
at 5 V: the makers' highest consumption figures, with the firmware's limit on
the LEDs) and 8.3 W if every load drew what its maker asks the supply to
deliver, all at once (1.65 A; [design-notes.md](design-notes.md#power-budget)). Two published reports
show both outcomes for a PoE device:

- FLIR A50/A70 camera, PoE, 8.1 W (CTC advanced, Saarbrücken, 2021): the PoE
  port is PS2. 56 V x 0.125 A = 7.0, so no arcing ignition source, and none
  after the fault test either. Its case is metal all the same, because its
  second input, an external supply of 18 to 56 V, measured above 100 W: PS3.
- Airtame PoE adapter with a 5 V, 2 A output (EKTOS, Copenhagen, 2018): 57 V x
  0.28 A = 15.9, and 16.5 W in three parts. The lab found ignition sources at
  the jack, the rectifiers and the protection diodes. Its case is 5VB plastic
  and counts as fire enclosure.

What follows for the reader:

1. A data sheet that states the flammability class at the wall thickness is
   needed in every case, also for HB. A class on a data sheet comes from
   standard test bars and need not hold for a printed part. Where the class
   matters (V-1 or V-0), a flame test on the printed part settles it (annex S).
2. The limit for the DC supply in the manual and on the label decides the
   class of that input. A limit of 15 W takes the input out of the question,
   and the reader does not need more.
3. Ask the lab before the test how it settles ignition sources: by measurement
   and fault test, as in the FLIR report, or by assumption. A manufacturer may
   also declare one to save the measurement (UL calls that common practice);
   for this reader that would cost the HB case.
4. If the lab finds one at the PoE module or the DC input: print the case, or
   the part of it near that spot, from a filament rated V-0 at the wall
   thickness, or put a sheet of metal or V-1 material between the spot and the
   plastic. Distance alone will hardly do in a flat case: the dock plate lies
   14 mm behind the board, and the zone reaches 50 mm upwards.

Not done on the board: a fuse small enough to make the DC input PS1 by itself.
By the 125 % rule that is 0.5 A at 24 V. The reader takes 0.45 A at 12 V at
peak, and a fuse of this kind holds two thirds of its rating in a warm case
(the 1.1 A one: 0.7 A at 60 °C). So it would do for 24 V only. An electronic
current limiter would do for both voltages; that is a change to the board.

Filaments looked at on 24 November 2026:

| Filament | What its maker states |
|---|---|
| Filament Unger ABS+ | No flammability class and no RoHS or REACH statement on the material guide, the FAQ or the downloads page. Data sheets are published for PLA+, PETG and PA12 CF15, none for ABS+. The product pages could not be read. Ask for the data sheet. ABS without flame retardant is usually HB; that is not from their data. |
| FormFutura ABSpro Flame Retardant | "engineered to meet the UL 94 V-0 flammability standards"; a blend of polycarbonate and ABS, RoHS and REACH stated. The sheet names no thickness for the class. |
| BASF Ultrafuse PC/ABS FR Black | V-0 at 1.5 mm and 3.0 mm |
| ROSA "ABS FR V0" | HB at 1.5 mm and 3.0 mm, in spite of its name: read the sheet, not the product name. |

ABS suits the reader otherwise: Filament Unger gives about 95 °C for theirs,
and the warmest part reaches 79 °C in a room of 40 °C (estimate,
[design-notes.md](design-notes.md#simulation)).

## Tests on the ports

From EN 301 489-1, which was read:

| Test | Level | On this reader |
|---|---|---|
| Electrostatic discharge | 4 kV contact, 8 kV air, to everything that can be touched | display glass and its edges, LED windows, buzzer opening, screws, housing seams |
| Radiated immunity | 3 V/m, 80 MHz to 6 GHz | always |
| Fast transients, RF common mode | 0.5 kV; 3 V | Ethernet port; the DC input if its cable may be longer than 3 m |
| Surge | 0.5 kV | Ethernet port with indoor cables over 30 m. More if outdoor cabling is allowed: exclude that in the manual. |
| Conducted emission | class B, 150 kHz to 30 MHz | Ethernet port; the DC input if its cable may be longer than 3 m. Otherwise on the mains side of the supply sold with it. |

A terminal for wires "from an existing installation" means cables longer than
3 m: plan for the DC port tests.

Surge on the DC input. EN 301 489-1, the route the RED takes, asks no surge
test on DC power ports. On this reader only the Ethernet port gets one, 0.5 kV
line to ground, when its cable may be longer than 30 m indoors. Access control
has an EMC product standard of its own, EN 50130-4. It asks for line-to-earth
surges through 42 ohm on extra-low-voltage DC lines as well (not read for this
page: confirm with the lab). The DC input is protected and simulated for that
test; the details are in [design-notes.md](design-notes.md#power), "Power".
Optional cost before the lab: the standard itself, EN 50130-4:2011+A1:2014,
consolidated English text, 24.80 EUR incl. tax from the Estonian standards
body EVS (evs.ee, read 25 November 2026; DIN Media sells the German edition
for 79.96 EUR). A new edition, prEN 50130-4:2026, is in draft. A line-to-line
surge of 0.5 kV behind 2 ohm, IEC 61000-4-5's test for power ports, is not
asked of this DC port by any of these standards; meeting it would take a
converter rated for 60 V and a larger TVS (design notes, "Power").

## What the board design does

| Topic | Measure on the board |
|---|---|
| Wi-Fi antenna | None on the board: the module has a connector, and the antenna sits in or on the case. The strip without copper along the top edge (44 mm) and the cut in the board were made for a module with PCB antenna and remain on revision A. |
| Return paths | Six layers. Ground planes on In1 and In4 and a 3.3 V plane on In3, each in one piece and without tracks. Signals run on the two outer layers and on In2, with ground filled in between: every signal layer lies next to a plane that no track cuts. |
| Switching regulators | AP63205 at the DC input, with spread spectrum. Two TLV62569 for 3.3 V and the core, at 1.5 MHz without spread spectrum. Small loops, input and output capacitors next to the ICs. |
| DC input | Self-resetting fuse, a bidirectional TVS behind it at the connector, reverse-polarity diode, pi filter (2.2 uF, 2.2 uH, 2 x 2.2 uF; 100 V capacitors that keep 1.5 uF each at 24 V), a 47 uF electrolytic that damps the filter when a supply is plugged in live, and a TVS before the converter. The converter sits away from the NFC antenna, and the DC run does not go around the NFC loop. |
| Display bus | 33 ohm series resistors on all RGB and sync lines; reduce GPIO drive strength in firmware if needed. |
| Clocks | Series resistors on the 50 MHz RMII clock, the SDIO clock and the flash clock. |
| USB | TVS and ESD array at the connector, fuse, ferrite bead in the supply. |
| Ethernet / PoE | Isolated PD module, 48 V side in its own area with 2 mm clearance and no copper under the module's isolation barrier, ferrite beads and TVS at the PoE input, capacitor across the barrier, RC from jack shield to ground. The Ethernet pairs pass under the jack's shell on the back layer, the 48 V nets on the inner layer. |
| NFC | Low-pass (560 nH / 220 pF) between transmitter and antenna, damping resistors, no closed copper ring around the loop. |
| Supply faults | USB feeds the 5 V rail through an eFuse (soft start, current limit, cut-off above 5.53 to 5.74 V), DC and PoE through ideal diodes. All three block reverse current, so no source feeds another; bleed resistors keep unpowered inputs at 0 V. |
| LEDs | Capacitor at each LED, series resistor and pull-down in the data line. |
| Mounting | No tracks under screw heads on the outer layers. |

## Where the board may still fail in the lab

Measure these before the lab does. Most important first. The simulations in
`sim/` cover none of it: they check signals, supplies, heat and the two
antennas, not emissions and not discharges.

1. **NFC harmonics on the cables.** One filter stage, unshielded coils, and
   both cables leave the housing beside the loop. Measure the harmonics with
   the cables attached. Measure with the PN532 that will be sold (the second
   source or NXP's) and keep to it.
2. **Discharges on the user's side.** The usual failures: the display or the
   touch controller loses its settings, the PN532 hangs, the MCU resets. The
   test is failed if the reader does not recover by itself. In the housing:
   close the LED windows with a diffuser that overlaps the housing, cover or
   ground metal screws (the board's mounting holes are not connected to
   ground), and tie the display's metal back to ground: the board has four
   bare ground pads on the display side for conductive tape or foam. In
   firmware: a watchdog, and a periodic check that restarts display, touch and
   NFC.
3. **The display flex.** About twenty fast lines in an unshielded flex.
   Lowest drive strength and pixel clock that work.
4. **Common-mode noise on the cables.** The DC filter works between the two
   wires only, and the PoE input has beads but no common-mode choke. A clip-on
   ferrite on the cable is the first remedy; a choke needs a new board.

Useful before the lab: a line impedance network and a spectrum analyser for
the DC input, near-field probes, an ESD gun, and half a day in a pre-compliance
chamber. For the lab the firmware needs test modes: NFC carrier on
continuously, Wi-Fi and Bluetooth on a fixed channel at fixed power
(Espressif's RF test firmware), and a worst-case mode with everything active
that shows on the display whether the reader still works.

## Open points for the product

- Enclosure material, with a data sheet that states HB at least at the wall
  thickness. Whether it has to be flame-retardant is settled by the lab's
  fault test (see "Enclosure plastic").
- The limit for the DC supply in the manual and on the label: 15 W or 100 W.
- The Wi-Fi antenna or antennas: model and gain (2.33 dBi at most), and for
  one on an SMA connector its name in the manual.
- Supply in the box or not. If so, it is part of the tested product.
- Allowed cable lengths for the DC input and for Ethernet, and no outdoor
  cabling. They decide which port tests apply.
- Business customers only, or private buyers too. It decides the ElektroG
  registration, the packaging duties and whether the product safety
  regulation applies.
- One PN532 source, one PoE module, one display type. The test report covers
  what was tested.
- Type label: CE mark, model, serial number, manufacturer's name and postal
  address, crossed-out bin. CE mark on the packaging too.
- Technical file: schematics, layout, parts list, test reports, risk
  assessments, software bill of materials. Keep it for ten years.

## Test lab

Ask two or three accredited labs for a quote and name the exact configuration:
ESP32-C6-MINI-1U module with each antenna that will be sold (inside the case,
on an SMA bulkhead), NFC reader with PCB antenna, Ethernet with PoE, DC
supply, both assembly versions. Testing the Ethernet version with Wi-Fi fitted
usually covers the Wi-Fi version as the simpler case; the lab decides. Send
with the request: block diagram, list of ports with cable type and length,
operating modes, the module certificates and reports, and a list of the
safety-relevant parts (PoE module, fuses, enclosure material, PCB).

## Sources

- RED, consolidated: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0053-20260530>
- RED cybersecurity: <https://eur-lex.europa.eu/eli/reg_del/2022/30/oj>, its repeal: <https://eur-lex.europa.eu/eli/reg_del/2026/339/oj>
- Harmonised standards under the RED: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02022D2191-20261115>
- EN 18031 citation with its restrictions: <https://eur-lex.europa.eu/eli/dec_impl/2025/138/oj>
- Cyber Resilience Act: <https://eur-lex.europa.eu/eli/reg/2024/2847/oj>, product categories: <https://eur-lex.europa.eu/eli/reg_impl/2025/2392/oj>, state of the standards: <https://digital-strategy.ec.europa.eu/en/policies/cra-standardisation>
- EN 300 330: <https://www.etsi.org/deliver/etsi_en/300300_300399/300330/02.01.01_60/en_300330v020101p.pdf>
- EN 301 489-1: <https://www.etsi.org/deliver/etsi_en/301400_301499/30148901/02.02.03_60/en_30148901v020203p.pdf>
- Combined equipment, ETSI EG 203 367: <https://www.etsi.org/deliver/etsi_eg/203300_203399/203367/01.01.01_60/eg_203367v010101p.pdf>
- Module certificates: <https://www.espressif.com/en/support/documents/certificates?keys=ESP32-C6-MINI-1>
- stiftung ear: <https://www.stiftung-ear.de/anleitungen/weee-registrierung-beantragen/>
- Packaging register: <https://www.verpackungsregister.org/ich-moechte-wissen-was-seit-dem-12-august-2026-gilt>
- Data Act: <https://eur-lex.europa.eu/eli/reg/2023/2854/oj>
- Product liability directive: <https://eur-lex.europa.eu/eli/dir/2024/2853/oj>
- EN 62368-1:2014, clauses 5.2 (table 4) and 6.2 to 6.4: read in a copy of the BS EN edition. The standard is sold, not published; no link.
- UL Solutions, questions and answers on IEC 62368-1 (enclosure rated HB, fire enclosure for PS2 circuits, resistive ignition sources in the 2018 edition): <https://www.ul.com/resources/iec-62368-1-ask-engineers-question-and-answer-page>
- Test report FLIR A50/A70, CTC advanced 60429496-001: <https://support.flir.com/CertDownload/Assets/FLIR%20A50%20and%20A70%20series/IEC%2062368-1%20TEST%20REPORT.pdf>
- Test report Airtame AT-PoE, EKTOS P18-0060-1: <https://www.northamber.com/storage/uploads/Product%20Safety/Airtame/EU%20Safety%20Test%20Report%20(LVD)%20PoE%20_P18-0060-1_IEC62368-1.pdf>
- Filament Unger: <https://filament-unger.de/pages/material-guide>, <https://filament-unger.de/pages/downloads>
- Flame-retardant filaments, data sheets: FormFutura <https://cdn.shopify.com/s/files/1/0622/4181/files/ABSpro_Flame_Retardant_-_TDS_-_Formfutura.pdf>, BASF <https://cdn.shopify.com/s/files/1/0264/8791/4555/files/Ultrafuse_PC-ABS_FR_Black_TDS_DE_v1.1.pdf>, ROSA <https://www.lemona.lt/Files/Instrukcijos/TI/En/Pdf/TDS-ROSA-ABS-EN.pdf>
