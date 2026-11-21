# CE and market checklist

A PCB cannot be "CE conform" on its own: the CE mark applies to the finished
reader (board, display, enclosure, power supply, firmware and documents). This
page lists what applies in Germany and the EU, what the board design already
does for it, and what is still open.

It is a working checklist with the state of November 2026, not legal advice.
The legal texts and the lists of harmonised standards were read at their
sources (links at the end). Standards that are not free to read (EN 18031,
EN IEC 62368-1, EN 55032, EN 55035) were not; what this page says about their
content is marked "confirm with the lab".

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

An estimate, not a quote: 15,000 to 30,000 EUR of lab fees for both versions
with the cybersecurity assessment done in-house, and three to six months from
the first booking to a signed declaration. No accredited German lab publishes
prices; ask two or three.

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

The ESP32-C6-MINI-1 has an EU-type examination certificate (Sporton, notified
body 2907, SN23C0148 of 28 September 2023); the MINI-1U with antenna connector
has its own (SN24C0053 of 6 March 2024). They cover safety, EMC and radio,
not cybersecurity. Espressif publishes the certificates only: ask for the
test reports before asking labs for quotes.

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
- The MINI-1U may be used with an antenna of at most 2.33 dBi gain (module
  datasheet, section 10.2). It is a second radio configuration in the test
  plan. One fixed, named antenna sold with the reader is the cheap route; an
  antenna the user can swap needs a list of permitted antennas in the manual.
- The board follows Espressif's placement rules as far as it can: no copper
  for 44 mm along the board edge at the antenna, and the board cut away under
  it. The display's metal back is 7 mm from the antenna where Espressif asks
  for 15 mm.

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

- Every supply of the reader is below 60 V DC, which may be touched: PoE, the
  12 to 24 V input, USB. No insulation against electric shock is needed
  anywhere in it. The work is fire protection, heating, mechanics and marking.
  (Class limits: confirm with the lab.)
- Keep the supplies limited. State in the manual and on the label that the DC
  input must come from a supply with limited power (the lab knows the wording
  its edition of the standard wants). The board has a self-resetting fuse of
  1.1 A at the DC input and of 2 A at USB.
- Enclosure: a plastic with a documented flammability rating, UL 94 V-1 or
  better. A 3D-printed housing from filament without a rating is where small
  manufacturers usually stumble. Get the material's data sheet.
- PCB: FR-4 rated V-0 with a UL mark. Ask JLCPCB for it.
- A supply sold with the reader becomes part of the tested product. Buy one
  with its own report.
- PoE isolation is asked for by the Ethernet standard (1500 V RMS for a
  minute), not by the safety standard, because both sides may be touched. A
  lab testing for CE may not test it; customers expect it. What the board does
  for it, and where it is weak, is in
  [design-notes.md](design-notes.md#poe-isolation).

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

## What the board design does

| Topic | Measure on the board |
|---|---|
| Wi-Fi antenna | Module at the board edge above the display. No copper on any layer for 44 mm along the edge; the board is cut away under the antenna. |
| Return paths | Solid ground plane on layer 2 under all signals. Layer 3 is a 3.3 V pour that also carries signal tracks; it is kept free of tracks under the MCU. |
| Switching regulators | AP63203 and AP63205 with spread spectrum; small loops, input and output capacitors next to the ICs. |
| DC input | Self-resetting fuse, reverse-polarity diode, pi filter (10 uF, 2.2 uH, 2 x 10 uF) and TVS before the converter. The converter sits away from the NFC antenna, and the DC run does not go around the NFC loop. |
| Display bus | 33 ohm series resistors on all RGB and sync lines; reduce GPIO drive strength in firmware if needed. |
| Clocks | Series resistors on the 50 MHz RMII clock, the SDIO clock and the flash clock. |
| USB | TVS and ESD array at the connector, fuse, ferrite bead in the supply. |
| Ethernet / PoE | Isolated PD module, 48 V side in its own area with 2 mm clearance and no copper under the module's isolation barrier, ferrite beads and TVS at the PoE input, capacitor across the barrier, RC from jack shield to ground. The Ethernet pairs and the 48 V nets pass under the jack's shell on the back layer. |
| NFC | Low-pass (560 nH / 220 pF) between transmitter and antenna, damping resistors, no closed copper ring around the loop. |
| Supply faults | USB, DC and PoE are diode-ORed, so no source feeds another; bleed resistors keep unpowered inputs at 0 V. |
| LEDs | Capacitor at each LED, series resistor and pull-down in the data line. |
| Mounting | No tracks under screw heads on the outer layers. |

## Where the board may still fail in the lab

Measure these before the lab does. Most important first.

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
5. **Layer 3.** It mixes the 3.3 V pour with signals, and the routing is
   automatic. Radiated emission above 100 MHz would point here. It needs a
   new layout to change.

Useful before the lab: a line impedance network and a spectrum analyser for
the DC input, near-field probes, an ESD gun, and half a day in a pre-compliance
chamber. For the lab the firmware needs test modes: NFC carrier on
continuously, Wi-Fi and Bluetooth on a fixed channel at fixed power
(Espressif's RF test firmware), and a worst-case mode with everything active
that shows on the display whether the reader still works.

## Open points for the product

- Enclosure material and its flammability rating.
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
ESP32-C6-MINI-1 module (and the MINI-1U with the chosen external antenna, if
that version is sold), NFC reader with PCB antenna, Ethernet with PoE, DC
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
