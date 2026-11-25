# Sources of the CE and market checklist

This page records, for every claim in [compliance.md](compliance.md), the
result of the check against its primary source, and lists those sources.

Checked on 25 November 2026. EU acts were read in their official text. EUR-Lex
answers automated requests with an empty reply, so the texts were downloaded
by CELEX number from the EU Publications Office's document store
(`https://publications.europa.eu/resource/celex/<CELEX>`), which serves the
same documents; the list gives the usual EUR-Lex address. ETSI standards,
German federal law (gesetze-im-internet.de), the eCFR, Espressif's documents
and the other web pages were read at the addresses given. Paid standards
(EN 18031, EN 55032, EN 55035, EN 50130-4, EN 50419, IEC 61000-4-5 and every
edition of EN IEC 62368-1) were not read; only free previews, published test
reports and UL or TÜV material were. Sources marked "secondary" are not the
primary text.

How to read compliance.md: a reference such as [RED Art. 10(9)] names a
source key from the list below (RED) and the clause relied on (Art. 10(9)).

Verdicts, after the edit of 25 November 2026:

- **correct**: the source confirms the claim as it now stands.
- **corrected**: the claim was wrong, partly correct or incomplete, and the
  text now follows the source. "corrected (added)" marks a duty that was
  missing and has been added.
- **not checkable from free sources**: the claim rests on a paid standard,
  lab practice, an estimate or engineering judgement; compliance.md marks it
  "unverified".
- **module-specific, to be revisited with the module choice**: a claim about
  the ESP32-C6-MINI-1U and its antenna. The module may be replaced, so these
  were left unchanged in substance; the claim column gives the check result.
- **not checked (design figure)**: board, component or simulation figures
  from the design files, outside this check.

## Claims by section

### Introduction

| Claim (short) | Verdict | Source |
|---|---|---|
| The CE mark applies to the finished reader, not to a bare PCB | correct | RED Art. 2(1), 20(1) |
| Paid standards (EN 18031, EN 55032, EN 55035, EN 62368-1) were not read | correct | statement about this check |

### Will it be easy?

| Claim (short) | Verdict | Source |
|---|---|---|
| An access control reader is an important product, class I | correct | CRA Art. 7(1), Annex III class I no. 1 |
| Self-assessment from 11 December 2027 needs a cited harmonised standard (was: only a standard; now also common specifications or an EU certificate at level "substantial", and the standard must cover all risks of the core function) | corrected | CRA Art. 32(2); CRA guidance para 149 |
| prEN 40000-10 is a draft | correct | DIN Media prEN 40000-10; Genorma (secondary) |
| Without such a standard a notified body examines the product | correct | CRA Art. 32(2) |
| Since 1 August 2025 EN 18031 applies "with no way to use it without a password or PIN" (now: the OJ notices on the default-password clauses 6.2.5.1 and 6.2.5.2; PINs are not mentioned) | corrected | DR 2023/2444 Art. 1; RED Art. 17(3), (4); HS-RED no. 164, 165 |
| A first run usually fails at the NFC transmitter, the cable ports and discharges on the glass | not checkable from free sources (lab experience) | none; consistent with VDE RED modules p. 2 |
| What is sold adds or removes tests and duties | correct | EN 301 489-1 §9.4.1, §9.8.2.2; ElektroG §3 no. 5; GPSR Art. 3(1) |

### Which rules apply

| Claim (short) | Verdict | Source |
|---|---|---|
| RED applies: Wi-Fi, Bluetooth and NFC are radios | correct | RED Art. 2(1) |
| Assess safety, EMC, radio and cybersecurity | correct | RED Art. 3 |
| Keep the technical file (now: and the declaration) for ten years | correct | RED Art. 10(4); FuAG §9(3) |
| One EU declaration of conformity | correct | RED Art. 18(3) |
| A copy of the declaration, or a simplified one with the web address, with each unit (was missing) | corrected (added) | RED Art. 10(9); FuAG §20(2) |
| CE mark on the device and its packaging | correct | RED Art. 20(1) |
| Name, postal address, type and serial number on the device (a batch number would also do) | correct | RED Art. 10(6), (7) |
| Instructions with frequency bands and maximum power | correct | RED Art. 10(8); FuAG §20(3) |
| Instructions in German (was: always; now: required for non-commercial users only) | corrected | FuAG §20(1); RED Art. 10(8) |
| LVD and EMC Directive not separately; the RED covers both | correct | RED Art. 1(4), 3(1), 50; EMCD Art. 2(2)(a) |
| RED cybersecurity applies since 1 August 2025 | correct | DR 2023/2444 Art. 1; DR 2022/30 Art. 3 |
| Network protection: the reader can communicate over the internet, directly or through other equipment | correct | DR 2022/30 Art. 1(1) |
| Protection of personal data: card numbers linked to names (personal data in the GDPR sense is our inference) | correct | DR 2022/30 Art. 1(2) as amended by DR 2023/2444 |
| Repealed from 11 December 2027 by DR 2026/339 | correct | DR 2026/339 Art. 1, recital 4 |
| Readers placed on the market before then stay under RED market surveillance (added) | correct | DR 2026/339 recital 5 |
| CRA reporting since 11 September 2026: 24 hours and 72 hours (final report added) | correct | CRA Art. 14(2), (4), 71(2) |
| Reporting covers readers sold today | correct | CRA Art. 69(3) |
| Full conformity for every unit placed on the market from 11 December 2027 | correct | CRA Art. 69(2), 71(2) |
| "At least five years of security updates" (now: a support period matching the expected use, at least five years, end date stated at purchase) | corrected | CRA Art. 13(8), (19); CRA guidance para 126 |
| RoHS: supplier declarations for all parts and the PCB (usual evidence, not the Directive's wording) | correct | RoHS Art. 7(b), (d) |
| RoHS named on the declaration of conformity | correct | RoHS Annex VI; RED Art. 18(3) |
| REACH: tell customers above 0.1 % (consumers on request within 45 days added) | correct | REACH Art. 33(1), (2) |
| Notify to ECHA (was: under REACH; now: the SCIP duty of the Waste Framework Directive and ChemG §16f) | corrected | WFD Art. 9(1)(i); ChemG §16f(1) |
| Lead in some components is the usual case | correct (secondary source) | Sagentia (secondary) |
| Register brand and device type with stiftung ear before the first sale | correct | ElektroG §6(1) |
| Registration takes two to four weeks (for a complete application) | correct | ear reg |
| About 130 EUR a year (now: plus VAT, 32.80 EUR a quarter) | correct | GebV no. 1.2; ear fees |
| Business device: take-back concept; household device: guarantee (take-back offer and disposal information added) | correct | ElektroG §6(1), §7(1), (3), §7a, §19, §19a |
| Selling to private buyers "weakens" the business case (now: it rules the business registration out) | corrected | ElektroG §3 no. 5, §7(3); WEEE Art. 3(1)(h) |
| Crossed-out bin on the device (was incomplete; now also the producer's identity and the mark for "after 13 August 2005") | corrected | ElektroG §9(1), (2), §3 no. 4 |
| The usual mark for "after 13 August 2005" is a bar under the bin | not checkable from free sources (EN 50419, paid) | none |
| Registration number on offers and invoices | correct | ElektroG §6(3) |
| "Every other EU country needs its own registration" (now: direct sales to end users need a registration through an authorised representative there; a local importer registers otherwise) | corrected | WEEE Art. 3(1)(f), 16(1), 17(2); ElektroG §8(5) |
| PPWR applies from 12 August 2026 | correct | PPWR Art. 71 |
| PPWR and VerpackDG replaced the Verpackungsgesetz on 12 August 2026 | correct | ZSVR; VerpackDG |
| Register in LUCID | correct | VerpackDG §6(1), (6); ZSVR |
| System participation for packaging that ends up with private users (now: also comparable sources such as workshops and offices) | corrected | VerpackDG §3(6), (7), §7 |
| Report quantities | correct | VerpackDG §9(1), §10 |
| PPWR manufacturer duties for packaging made under one's own name (was missing) | corrected (added) | PPWR Art. 3, 15(1), (2) |
| Take-back of packaging outside system participation, ZSVR approval from 2028 (was missing) | corrected (added) | VerpackDG §39(1); ZSVR |
| Batteries Regulation: no battery; applies once one is added | correct | Batteries Reg Art. 1(3) |
| GPSR "only if consumers buy it" (now: also if consumers are likely to use it) | corrected | GPSR Art. 3(1), recital 17 |
| GPSR rules left for a CE product: distance sales, accidents, recalls | correct | GPSR Art. 2(1), 19, 20, 36, 37, 52 |
| The reader is a "connected product" | correct | Data Act Art. 2(5) |
| Data Act exemption for micro and small enterprises (now with its conditions and the one-year rule) | corrected | Data Act Art. 7(1) |
| USB-C common charger rule covers only listed categories | correct | RED Annex Ia Part I |
| Funkanlagengesetz is the German RED; the Bundesnetzagentur supervises | correct | FuAG footnote, §23(1) |
| New product liability directive for products placed on the market after 9 December 2026 | correct | PLD Art. 2(1), 22(1) |
| It "names software and missing security updates as defects" (now: the directive's own terms) | corrected | PLD Art. 4(1), 7(2)(f), 11(2) |

### Standards a lab applies

| Claim (short) | Verdict | Source |
|---|---|---|
| A cited standard "counts as proof" (now: presumption of conformity, within any notice) | corrected | RED Art. 16 |
| Radio and cybersecurity need cited standards for self-declaration; safety and EMC never need a notified body | correct | RED Art. 17(2), (3), (4) |
| EN 300 328 V2.2.2 cited | correct | HS-RED no. 16; EN 300 328 |
| EN 300 330 V2.1.1 cited | correct | HS-RED no. 17; EN 300 330 |
| EN 301 489-3 and -17 cited, part 1 their common base (the two notices were missing) | corrected | HS-RED no. 168, 169; EN 301 489-3 §2.1; EN 301 489-17 §2.1, §6 |
| Versions and scopes of EN 301 489-1, -3 (NFC) and -17 (Wi-Fi, Bluetooth) | correct | EN 301 489-3 §3.1; EN 301 489-17 §1, table 1 |
| EN 55035:2017 cited (EN 55032 only under the EMC Directive added) | correct | HS-RED no. 5; HS-EMC |
| EN 62368-1 not cited under the RED (LVD cites only the 2014 edition, added); a 2024 edition exists | correct | HS-RED; HS-LVD; SIQ (secondary) |
| EN 62311, EN 50665 and EN 50364 not cited under the RED | correct | HS-RED |
| EN 18031-1 and -2 cited with restrictions | correct | HS-RED no. 164, 165; ID 2025/138 |
| NFC carrier limit (now stated: 60 dBµA/m at 10 m, spectrum mask) | correct | EN 300 330 §4.3.4, table 2 |
| A loop of this size stays about 50 dB below the carrier limit | not checkable from free sources (estimate) | none |
| The PN532 drives the antenna with a square wave | not checked (design figure) | PN532 data sheet, not read for this check |
| Harmonics in the 4 nW bands (was missing 470 to 790 MHz and "e.r.p."; the 250 nW and the 27.12 MHz limits added) | corrected | EN 300 330 §4.3.8.3 table 5, §4.3.9.3 table 6, §6.2.9 |
| The cables, not the loop, radiate the harmonics | not checkable from free sources (engineering judgement) | EN 300 330 §5.4.1, annex C.2.3 for the test set-up |

### What the certified Wi-Fi module saves

| Claim (short) | Verdict | Source |
|---|---|---|
| The reader uses the ESP32-C6-MINI-1U, with an antenna connector (correct) | module-specific, to be revisited with the module choice | DS §1.2 |
| EU-type examination certificate SN24C0053, Sporton, notified body 2907, 6 March 2024 (correct; hardware version V1.2) | module-specific, to be revisited with the module choice | CE-1U p. 1 |
| MINI-1 certificate SN23C0148 of 28 September 2023 (correct) | module-specific, to be revisited with the module choice | CE-1 p. 1 |
| The certificates cover safety, EMC and radio, not cybersecurity (correct but incomplete: they also cover RF exposure under Art. 3(1)(a), and the EMC part was assessed against a draft EN 301 489-17 V3.2.6) | module-specific, to be revisited with the module choice | CE-1U pp. 1, 3 |
| Espressif publishes the certificates only: ask for the reports (correct for the EU reports L330804KS102-M1, EA330804, EW330804 and ER330804; the FCC reports are public, measured to FCC rules; the MINI-1U's FCC ID is 2AC7Z-ESPC6MINIU) | module-specific, to be revisited with the module choice | CERTS; FAQ; FCC-G; FCC exhibits |
| The certificates do not transfer to the reader | correct | CE-1U p. 2, note 2; EG 203 367 §6.1 |
| "The lab reuses the module's conducted radio results if used as its datasheet says" (now: what EG 203 367 says; the guide names neither modules nor conducted results, and calls an antenna outside the original assessment a deviation) | corrected | EG 203 367 §3.1, §6.1 notes 1 and 2 |
| Labs typically reuse the module's conducted results | not checkable from free sources (lab practice) | none |
| On the reader: radiated power and spurious emissions with NFC transmitting | correct | EG 203 367 §6.1 note 1, §6.2; EN 300 328 §4.3.2.2.3 |
| On the reader: EMC with all radios running | correct | EG 203 367 §5.1.1.3, §5.2.3 |
| RF exposure listed under EG 203 367 (now: separate, RED Art. 3(1)(a), outside the guide's scope) | corrected | EG 203 367 §1 |
| The module is certified on condition of 20 cm to persons (correct; the FCC grant has the same condition) | module-specific, to be revisited with the module choice | CE-1U p. 2, note 1; FCC-G |
| A reader that is touched needs its own RF exposure assessment | correct | CE-1U p. 2, note 1 |
| A calculation is usually enough for RF exposure | not checkable from free sources (lab practice) | none |
| VDE (0366) wants an EU-type examination when only module reports exist | correct (VDE's stated position) | VDE RED modules p. 2 |
| "Certified up to 19.8 dBm" (was the MINI-1's figure, 19.81 dBm; the MINI-1U certificate states 18.19 dBm EIRP for Wi-Fi and 17.96 dBm for Bluetooth LE) | corrected; module-specific, to be revisited with the module choice | CE-1U p. 2; CE-1 p. 2 |
| The limit is 20 dBm (now: e.i.r.p., for every antenna assembly) | correct | EN 300 328 §4.3.2.2.2, §4.3.2.2.3 |
| The antenna is not part of the module (correct) | module-specific, to be revisited with the module choice | DS §10.2 |
| The datasheet asks for 2.4 GHz, 50 ohm, at most 2.33 dBi, a monopole (partly correct: the datasheet recommends rather than asks, lists a matching connector as a fourth point, and the test antenna is a sleeve monopole, material code TFPD08H10060011) | module-specific, to be revisited with the module choice | DS §10.2; FCC exhibits (antenna specification) |
| Datasheet quote on an antenna of a different type or gain (correct, exact excerpt) | module-specific, to be revisited with the module choice | DS §10.2 |
| An adhesive antenna is often another type: ask the lab (correct as advice) | module-specific, to be revisited with the module choice | FAQ; eCFR 15.204(c) |
| Each antenna configuration sold is a radio configuration in the test plan | correct | EN 300 328 §4.2.4, §5.4.1 m) |
| Adhesive antenna inside the case: one named antenna, tested with the reader (correct; an "integral antenna" in EN 300 328 terms) | module-specific, to be revisited with the module choice | EN 300 328 §3.1; EG 203 367 §6.1 note 1 |
| SMA bulkhead antenna: manual names the permitted antennas, the declaration covers only those (correct; a "dedicated antenna", each must meet 20 dBm e.i.r.p.; a standard SMA jack is not allowed for a US version) | module-specific, to be revisited with the module choice | EN 300 328 §3.1, §4.2.4; RED Art. 10(8), Annex VI point 8; eCFR 15.203 |
| Neither antenna is chosen; the case has no place for one yet | correct | design-notes.md, "Wi-Fi antenna" |
| Where the antenna sits decides the radiated results | not checkable from free sources (engineering judgement) | none |

### Cybersecurity, under the RED

| Claim (short) | Verdict | Source |
|---|---|---|
| The reader must meet RED Art. 3(3)(d) and (e); point (f) does not apply (added) | correct | DR 2022/30 Art. 1(1), (2), (3) |
| A declaration without a notified body needs EN 18031-1 and -2 in full | correct | RED Art. 17(3), (4) |
| The standards "do not count if the user is allowed not to set and use a password" (now: tied to clauses 6.2.5.1 and 6.2.5.2; "rationale" and "guidance" never count) | corrected | HS-RED no. 164, 165; ID 2025/138 recital 6 |
| Authentication everywhere; credentials unique per device or set at first use; decision trees | not checkable from free sources (EN 18031, paid) | none |
| The ESP32-C6 firmware is part of the product | correct (our reading; no explicit text) | RED Art. 10(8) |

### Cybersecurity, under the Cyber Resilience Act

| Claim (short) | Verdict | Source |
|---|---|---|
| The reader is class I; Annex III wording | correct | CRA Annex III class I no. 1 |
| Implementing Regulation (EU) 2025/2392 describes the category | correct | IR 2025/2392 Annex I class I no. 1 |
| Self-assessment only with applied harmonised standards (now also common specifications or an EU certificate at level "substantial"; the standard must cover all core-function risks) | corrected | CRA Art. 32(2); CRA guidance paras 148, 149 |
| EN 18031 does not count under the CRA (the carry-over of notified-body certificates until 11 June 2028 added) | corrected | CRA Art. 27(1), 69(1); CRA guidance paras 251 to 254 |
| prEN 40000-10 was out for comment in summer 2026 | correct | DIN Media prEN 40000-10; Genorma (secondary) |
| No standard cited for the Act yet | correct (on 25 November 2026) | CRA std page |
| Citation before December 2027 is open (CEN's deadline of 31 January 2027 added) | corrected | C(2026) 7861 annex, line 16 |
| FOSS route "in class I" (now: class I or II, documentation public when placed on the market) | corrected | CRA Art. 32(5); CRA guidance para 137 |
| The FOSS definition covers software; open hardware unsettled (guidance para 25 added) | correct | CRA Art. 3(48); CRA guidance para 25 |
| The BSI is the authority to ask (state of the German act added) | correct | BT-Drs 21/6134 Art. 1, §65(1) BSIG; BR-Drs 621/26 |
| "No exemption for small companies" (now: lower fees, a simplified form not yet published, and no fine for a missed 24-hour early warning) | corrected | CRA Art. 32(6), 33(5), 64(10)(a); MSME page |
| Secure boot and flash encryption | correct (a means; the Act does not name it) | CRA Annex I Part I (2)(e), (f) |
| Signed firmware updates (automatic updates by default and free updates added) | corrected | CRA Annex I Part I (2)(c), Part II (7), (8) |
| No default credentials | correct (a means) | CRA Annex I Part I (2)(b), (d) |
| A written risk assessment | correct | CRA Art. 13(2), (3) |
| A software bill of materials | correct | CRA Annex I Part II (1) |
| A stated support period of at least five years | correct | CRA Art. 13(8), (19) |
| A contact address for vulnerability reports | correct | CRA Annex I Part II (6), Art. 13(17) |
| A written procedure for the 24-hour report (CVD policy, published fixes, updates kept ten years, documentation period and Annex II information added) | corrected | CRA Art. 13(9), (13), (18), 14(2)(a); CRA Annex I Part II (4), (5) |
| The reporting duty applies already | correct | CRA Art. 69(3), 71(2) |

### Safety

| Claim (short) | Verdict | Source |
|---|---|---|
| Every supply is below 60 V DC, the touchable limit ES1 (table 4 confirmed for the 2018 edition) | correct | ULQA; IEC18 contents |
| Both test reports class a PoE input as ES1 | correct | FLIR p. 8; AIR pp. 8, 9 |
| "No insulation needed anywhere" (now: at the inputs; internal converters may exceed 60 V) | corrected | ULQA |
| DC supply limited to 100 W, or better 15 W | correct | ULTB |
| "Without a stated limit the lab counts the input as unlimited" (now: lab practice, shown by the FLIR report) | corrected | FLIR pp. 10, 47 |
| Fuses of 1.1 A and 2 A; eFuse 1.8 to 2.2 A | not checked (design figure) | schematic |
| Enclosure HB at least (the 2018 glow-wire alternative added) | corrected | ULQA; TUV item 17 (secondary) |
| PCB V-1 or better under clause 6.4.5.2 | not checkable from free sources (EN 62368-1, paid) | FLIR p. 18 records "PCB: V-0"; JLCPCB UL |
| A supply sold with the reader becomes part of the tested product | not checkable from free sources (lab practice) | none |
| EN 60825-1 does not apply to the LED; no laser label | correct | BSI 60825-1; IEC18 contents (clause 10.4) |
| LED pulse figures (200 mA, 1 ms, 1/40) | not checked (design figure) | sensor data sheet |
| PoE isolation "1500 V RMS for a minute" (now: one of three alternative tests) | corrected | IEEEI; IEEEW (secondary) |
| Not asked by the safety standard "because both sides may be touched" (now: clause 5.4.11 applies only against earthed circuitry) | corrected | ULQA; FLIR p. 15 |
| A CE lab may not test PoE isolation; customers expect it | not checkable from free sources (opinion) | none |

### Enclosure plastic

| Claim (short) | Verdict | Source |
|---|---|---|
| V-1 for the whole case is stricter than the standard | correct | ULQA |
| PS1: up to 15 W, three seconds into the fault | correct | ULTB |
| PS1: HB (clause 6.3.1) | correct | ULQA |
| HB75 below 3 mm of wall, HB40 from 3 mm | not checkable from free sources (EN 62368-1, paid) | none |
| PS1: no part counts as able to ignite | correct | ULQA; ULTB |
| PS2: up to 100 W (after 5 s added) | correct | ULTB |
| PS2: 13 mm / 50 mm, V-1, annex S, or a barrier | correct | ULQA; FLIR p. 18 |
| The barrier must be metal or V-1 material | not checkable from free sources (EN 62368-1, paid) | none |
| PS3: "the whole case V-1 or better" (now: a fire enclosure around the PS3 circuit, in practice the whole case) | corrected | FLIR p. 18; ULQA |
| Resistive ignition source (the 100 W criterion where PTC devices or regulators limit the power added) | corrected | FLIR p. 48; AIR p. 52 |
| 2014 counted available power, 2018 counts dissipated power | correct | ULQA; TI 2018 TRF |
| Arcing ignition source: at least 50 V, volts times amps above 15 | correct | FLIR p. 48; AIR p. 51 |
| UL's answer on an HB casing | correct (verbatim) | ULQA |
| USB-C at most 15 W (5 V, 3 A) | not checked (design figure) | design-notes.md |
| The 125 % rule for fuses (12.5 W behind the 2 A fuse, 33 W at 24 V, a 0.5 A fuse) | not checkable from free sources (EN 62368-1, paid; UL describes measuring just below the trip point) | ULTB |
| PoE: more than 15 W; 33.6 W measured on a comparable device | correct | FLIR p. 47 |
| PoE: volts times amps uses the current drawn (the 3 to 9 W are design figures) | correct | FLIR p. 48; AIR p. 51 |
| 12 to 24 V: below 50 V, so only the 15 W rule | correct | FLIR p. 48 |
| 12 to 24 V: class follows the stated supply limit | correct | ULTB |
| Reader power 2.5, 4.5 and 8.3 W | not checked (design figure) | design-notes.md, "Power budget" |
| FLIR: 8.1 W, CTC advanced, 2021; PoE port PS2 | correct | FLIR pp. 1, 2, 8 |
| FLIR: 7.0 "so no arcing source" at the PoE port, none after the fault test (now: the check names no port; a resistive source was found on the external-supply side) | corrected | FLIR p. 48 |
| FLIR: metal case because the external input measured above 100 W | correct | FLIR pp. 2, 10, 47 |
| Airtame: 5 V, 2 A output; EKTOS, 2018 | correct | AIR pp. 1, 2 |
| Airtame: 15.9 and 16.5 W; sources at the jack, rectifiers and protection diodes | correct | AIR pp. 51, 52 |
| Airtame: 5VB case counts as fire enclosure | correct | AIR p. 21 |
| A data-sheet class from test bars need not hold for a printed part | not checkable from free sources (engineering judgement) | none |
| A flame test on the printed part settles it (annex S) | correct | ULQA |
| A manufacturer may declare an ignition source (common practice) | correct | ULQA |
| The zone reaches 50 mm upwards (the 14 mm dock distance is a design figure) | correct | ULQA |
| A fuse holds two thirds of its rating in a warm case | not checked (design figure) | fuse data sheet |
| Filament Unger ABS+: no class, no RoHS or REACH; data sheets for PLA+, PETG, PA12 CF15 only | correct | Unger guide; Unger downloads |
| ABS without flame retardant is usually HB | not checkable from free sources (general knowledge) | none |
| FormFutura ABSpro Flame Retardant | correct | FormFutura TDS |
| BASF Ultrafuse PC/ABS FR Black: V-0 at 1.5 and 3.0 mm | correct | BASF TDS |
| ROSA "ABS FR V0" is HB (now: the sheet is headed "ABS+" and is inconsistent) | corrected | ROSA TDS |
| Filament Unger ABS+ about 95 °C | correct | Unger guide |
| "The warmest part reaches 79 °C" (now: 79 °C is the Wi-Fi module; the warmest spot is about 80 °C; the LED rows) | corrected | design-notes.md, "Simulation" |
| The 2018 and 2023 editions were not read (two 2018 changes added) | correct | TUV items 16, 17 (secondary) |

### Tests on the ports

| Claim (short) | Verdict | Source |
|---|---|---|
| ESD 4 kV contact, 8 kV air, to all exposed surfaces | correct | EN 301 489-1 §9.3.2 |
| Radiated immunity 3 V/m, 80 MHz to 6 GHz | correct | EN 301 489-1 §9.2.2 |
| Fast transients 0.5 kV, RF common mode 3 V, if the cable may exceed 3 m (now stated for the Ethernet port too) | correct | EN 301 489-1 §9.4.1, §9.4.2, §9.5.1, §9.5.2 |
| Surge 0.5 kV for indoor cables over 30 m; more for outdoor cables (1 kV, 10/700 µs added) | correct | EN 301 489-1 §9.8.2.1, §9.8.2.2 |
| Conducted emission at "class B" on the DC input (now: EN 301 489-1 table 5; class B for Ethernet and for the AC port of a dedicated supply; NFC exclusion band) | corrected | EN 301 489-1 §8.3.1, §8.3.2, §8.3.3, §8.4.3.2, §8.7.3 |
| A terminal for installation wires means DC port tests (the quoted phrase is from design-notes, not a standard) | correct | EN 301 489-1 §9.4.1, §9.5.1, annex C.1 |
| No surge test on DC power ports (PoE arrives on a wired network port, added) | correct | EN 301 489-1 §3.1, §9.8.1 |
| Only the Ethernet port gets a surge, 0.5 kV, over 30 m | correct | EN 301 489-1 §9.8.2.2 |
| EN 50130-4 is the EMC (immunity) standard for access control | correct | EVS 50130-4; iTeh 50130-4 preview §1 |
| EN 50130-4 asks for surges through 42 ohm on ELV DC lines | not checkable from free sources (EN 50130-4, paid) | iTeh 50130-4 preview (clause 13 title only) |
| EN 50130-4 consolidated English text, 24.80 EUR at EVS | correct | EVS 50130-4 |
| German edition 79.96 EUR at DIN Media | correct | DIN Media 50130-4 |
| prEN 50130-4:2026 is in draft | correct | EVS 50130-4 |
| "0.5 kV line-to-line behind 2 ohm, IEC 61000-4-5's test for power ports" (now: IEC 61000-4-5 is a basic standard and sets no applicability; level and impedance marked unverified) | corrected | IEC 61000-4-5 preview §1 |

### What the board design does

| Claim (short) | Verdict | Source |
|---|---|---|
| Board measures (layers, regulators, filters, TVS, layout) | not checked (design figure) | schematic and layout; design-notes.md |

### Where the board may still fail in the lab

| Claim (short) | Verdict | Source |
|---|---|---|
| Failure points and remedies (items 1, 3 and 4; the pre-compliance kit) | not checkable from free sources (engineering judgement) | none |
| ESD and transients: failed if the reader does not recover by itself (now also: no loss of stored data the test plan names as critical) | corrected | EN 301 489-1 §6.2, annex C.1; EN 301 489-3 §6.1; EN 301 489-17 §6.4, table 2 |
| Espressif's RF test firmware (now named: EspRFTestTool, or the ESP-IDF example `cert_test`) | correct | RFT; FAQ; DS §7 |

### Open points for the product

| Claim (short) | Verdict | Source |
|---|---|---|
| Antenna gain 2.33 dBi at most (correct as the condition for reusing the module's reports; not a legal cap: any gain is allowed if the reader stays within 20 dBm e.i.r.p. and is tested with it) | module-specific, to be revisited with the module choice | DS §10.2; FAQ; EN 300 328 §4.3.2.2.3 |
| Type label: CE mark, model, serial number, name and postal address, crossed-out bin (producer identity and the post-2005 mark added) | correct | RED Art. 10(6), (7), 20(1); ElektroG §9 |
| A copy of the declaration of conformity in the box (was missing) | corrected (added) | RED Art. 10(9) |
| Technical file kept ten years (the declaration and the CRA's rule added) | correct | RED Art. 10(4); CRA Art. 13(13) |
| Business or private buyers decides ElektroG and GPSR (now also German instructions; packaging duties apply either way in most cases) | corrected | ElektroG §3 no. 5; FuAG §20(1); GPSR Art. 3(1); VerpackDG §3(7) |

### Test lab

| Claim (short) | Verdict | Source |
|---|---|---|
| Ask two or three accredited labs (now: also notified bodies where one is needed) | corrected | RED Art. 17(4); CRA Art. 32(2) |
| The Ethernet version with Wi-Fi fitted usually covers the Wi-Fi version | not checkable from free sources (lab practice) | consistent with EG 203 367 §6.1 note 3 |

### Sources

| Claim (short) | Verdict | Source |
|---|---|---|
| Link list (now moved to this page, with the sources the corrections rely on) | corrected | this page |

## Source list

### EU law and Commission documents

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| RED | Directive 2014/53/EU (Radio Equipment Directive) | consolidated version of 30 May 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0053-20260530> | Art. 1(4), 2(1), 3, 10(4), (6), (7), (8), (9), 16, 17(2), (3), (4), 18(3), 20(1), 50; Annex Ia Part I; Annex VI point 8 |
| DR 2022/30 | Commission Delegated Regulation (EU) 2022/30 (RED Art. 3(3)(d), (e), (f)) | original text | <https://eur-lex.europa.eu/eli/reg_del/2022/30/oj> | Art. 1(1), (2), (3), Art. 3 |
| DR 2023/2444 | Commission Delegated Regulation (EU) 2023/2444 amending 2022/30 | original text | <https://eur-lex.europa.eu/eli/reg_del/2023/2444/oj> | Art. 1 (application from 1 August 2025; new wording of Art. 1(2)) |
| DR 2026/339 | Commission Delegated Regulation (EU) 2026/339 repealing 2022/30 | adopted 16 February 2026, OJ L of 29 April 2026 | <https://eur-lex.europa.eu/eli/reg_del/2026/339/oj> | Art. 1; recitals 4, 5 |
| HS-RED | Commission Implementing Decision (EU) 2022/2191, harmonised standards for radio equipment | consolidated version of 15 November 2026 (last amended by 2026/2003) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02022D2191-20261115> | Annex I nos. 5, 16, 17, 164, 165, 168, 169 with their notices; no entry for EN 301 489-1, EN 55032, EN 62368-1, EN 62311, EN 50665, EN 50364 |
| ID 2025/138 | Commission Implementing Decision (EU) 2025/138 (citation of EN 18031) | original text | <https://eur-lex.europa.eu/eli/dec_impl/2025/138/oj> | recital 6; Annex |
| EMCD | Directive 2014/30/EU (EMC Directive) | original text | <https://eur-lex.europa.eu/eli/dir/2014/30/oj> | Art. 2(2)(a) |
| HS-EMC | Commission Implementing Decision (EU) 2019/1326, harmonised standards for EMC | consolidated version of 10 June 2022 (the latest listed) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02019D1326-20220610> | entries EN 55032:2015/A11:2020, EN 55035:2017/A11:2020 |
| HS-LVD | Commission Implementing Decision (EU) 2023/2723, harmonised standards for low-voltage equipment | consolidated versions of 30 April 2026 and 23 January 2027 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02023D2723-20260430> | entries EN 62368-1:2014, EN 62311:2008, EN 50364:2010 |
| CRA | Regulation (EU) 2024/2847 (Cyber Resilience Act) | OJ text of 20 November 2024 | <https://eur-lex.europa.eu/eli/reg/2024/2847/oj> | Art. 3(48), 7(1), 13(2), (3), (8), (9), (13), (17), (18), (19), 14(2), (4), 27(1), 32(2), (5), (6), 33(5), 64(10)(a), 69(1), (2), (3), 71(2); Annex I Parts I and II; Annex II; Annex III class I no. 1 |
| CRA guidance | Commission guidance on the Cyber Resilience Act, C/2026/6013 | OJ C of 17 November 2026 | <https://eur-lex.europa.eu/eli/C/2026/6013/oj> | paras 25, 126, 137, 148, 149, 251 to 254 |
| IR 2025/2392 | Commission Implementing Regulation (EU) 2025/2392, technical description of important and critical product categories | of 28 November 2025, OJ of 1 December 2025 | <https://eur-lex.europa.eu/eli/reg_impl/2025/2392/oj> | Annex I, class I, point 1 |
| C(2026) 7861 | Commission Implementing Decision C(2026) 7861 amending the CRA standardisation request, with annex | 10 November 2026 | <https://ec.europa.eu/transparency/documents-register/detail?ref=C(2026)7861&lang=en> | Annex, line 16 (deadline 31/01/2027) |
| CRA std page | European Commission, "Cyber Resilience Act - Standardisation" | updated 23 November 2026 | <https://digital-strategy.ec.europa.eu/en/policies/cra-standardisation> | state of the standards; amendment of 10 November 2026 |
| MSME page | European Commission, "Cyber Resilience Act - Microenterprises and Small and Medium-sized enterprises (MSMEs)" | read 25 November 2026 | <https://digital-strategy.ec.europa.eu/en/policies/cra-msmes> | the simplified documentation form is not yet established |
| RoHS | Directive 2011/65/EU (RoHS) | original text | <https://eur-lex.europa.eu/eli/dir/2011/65/oj> | Art. 7(b), (d); Annex VI |
| REACH | Regulation (EC) No 1907/2006 (REACH) | consolidated version of 23 June 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907-20250623> | Art. 33(1), (2) |
| WFD | Directive (EU) 2018/851 amending the Waste Framework Directive 2008/98/EC | original text | <https://eur-lex.europa.eu/eli/dir/2018/851/oj> | Art. 9(1)(i) of 2008/98/EC as inserted |
| Batteries Reg | Regulation (EU) 2023/1542 (Batteries Regulation) | original text | <https://eur-lex.europa.eu/eli/reg/2023/1542/oj> | Art. 1(3) |
| GPSR | Regulation (EU) 2023/988 (General Product Safety Regulation) | original text | <https://eur-lex.europa.eu/eli/reg/2023/988/oj> | Art. 2(1), 3(1), 19, 20, 36, 37, 52; recital 17 |
| Data Act | Regulation (EU) 2023/2854 (Data Act) | original text | <https://eur-lex.europa.eu/eli/reg/2023/2854/oj> | Art. 2(5), 7(1), 50 |
| PLD | Directive (EU) 2024/2853 (Product Liability Directive) | original text | <https://eur-lex.europa.eu/eli/dir/2024/2853/oj> | Art. 2(1), 4(1), 7(2)(f), 11(2), 22(1) |
| WEEE | Directive 2012/19/EU (WEEE Directive) | original text | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012L0019> | Art. 3(1)(f), (h), 16(1), 17(2) |
| PPWR | Regulation (EU) 2025/40 (Packaging and Packaging Waste Regulation) | original text | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R0040> | Art. 3 (definition of manufacturer), 15(1), (2), 71 |

### German law and authorities

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| FuAG | Funkanlagengesetz | as last amended by Art. 2 of the law of 20 July 2026 (BGBl. 2026 I Nr. 214) | <https://www.gesetze-im-internet.de/fuag/BJNR194710017.html> | footnote; §9(3), §20(1), (2), (3), §23(1) |
| ElektroG | Elektro- und Elektronikgerätegesetz | as last amended on 25 November 2025 (BGBl. 2025 I Nr. 286) | <https://www.gesetze-im-internet.de/elektrog_2015/BJNR173910015.html> | §3 no. 4, 5; §6(1), (3); §7(1), (3); §7a(1); §8(5); §9(1), (2); §19(1); §19a |
| GebV | ElektroG-, BattDG-Gebührenverordnung (ElektroGBattDGGebV) | as last amended on 30 September 2025 (BGBl. 2025 I Nr. 233) | <https://www.gesetze-im-internet.de/elektroggebv/BJNR177600015.html> | Gebührenverzeichnis no. 1.2 |
| VerpackDG | Verpackungsrecht-Durchführungsgesetz | of 13 July 2026 (BGBl. 2026 I Nr. 207), text from 12 August 2026 | <https://www.gesetze-im-internet.de/verpackdg/BJNR0CF0B0026.html> | §3(6), (7); §6(1), (6); §7; §9(1); §10; §39(1) |
| ChemG | Chemikaliengesetz, §16f | current text, read 25 November 2026 | <https://www.gesetze-im-internet.de/chemg/__16f.html> | §16f(1) |
| BT-Drs 21/6134 | Government bill implementing the CRA in Germany (amending the BSIG) | Bundestag printed paper 21/6134 | <https://dserver.bundestag.de/btd/21/061/2106134.pdf> | Art. 1, new §65(1) BSIG |
| BR-Drs 621/26 | Text adopted by the Bundestag, sent to the Bundesrat | adopted 15 October 2026 | <https://dserver.bundestag.de/brd/2026/0621-26.pdf> | cover note |
| ear reg | stiftung ear, "WEEE-Registrierung beantragen" | read 25 November 2026 | <https://www.stiftung-ear.de/anleitungen/weee-registrierung-beantragen/> | "Wie lange dauert die Erteilung der WEEE-Registrierung?" |
| ear fees | stiftung ear, "Kosten & Gebühren" | read 25 November 2026 | <https://www.stiftung-ear.de/anleitungen/kosten-und-gebuehren/> | "Beispiel 3 – Hersteller (b2b)"; amounts are net |
| ZSVR | Zentrale Stelle Verpackungsregister, "PPWR & VerpackDG: Das gilt seit dem 12. August 2026" | read 25 November 2026 | <https://www.verpackungsregister.org/ich-moechte-wissen-was-seit-dem-12-august-2026-gilt> | replacement of the VerpackG; LUCID; approval for packaging outside system participation from the end of 2027 |
| VDE RED modules | VDE Prüf- und Zertifizierungsinstitut (notified body 0366), "RED Information Radio Modules" | 24 November 2020 | <https://vde.com/resource/blob/2257746/305090fb24a3738e51dbe4a523c4be35/red-kundeninformation-en-data.pdf> (German: <https://vde.com/resource/blob/2257754/fc11b11d828ba03345ac6bc90681da68/red-kundeninformation-de-data.pdf>) | p. 2 |

### Standards, guides and their previews

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| EN 300 328 | ETSI EN 300 328, wideband transmission systems in the 2.4 GHz band | V2.2.2 (2019-07) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300328/02.02.02_60/en_300328v020202p.pdf> | §3.1, §4.2.4, §4.3.2.2.2, §4.3.2.2.3, §5.4.1 m) |
| EN 300 330 | ETSI EN 300 330, short range devices 9 kHz to 25 MHz | V2.1.1 (2017-02) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300330/02.01.01_60/en_300330v020101p.pdf> | §4.3.4 table 2 with notes 2, 3; §4.3.8.3 table 5; §4.3.9.3 table 6; §5.4.1; §6.2.9; annex C.2.3 |
| EN 301 489-1 | ETSI EN 301 489-1, EMC for radio equipment, part 1: common technical requirements | V2.2.3 (2019-11) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148901/02.02.03_60/en_30148901v020203p.pdf> | §3.1; §6.2; §8.3.1, §8.3.2, §8.3.3 table 5; §8.4.3.2; §8.7.3; §9.2.2; §9.3.2; §9.4.1, §9.4.2; §9.5.1, §9.5.2; §9.8.1, §9.8.2.1, §9.8.2.2; annex C.1 |
| EN 301 489-3 | ETSI EN 301 489-3, part 3: short range devices 9 kHz to 246 GHz | V2.3.2 (2023-01) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148903/02.03.02_60/en_30148903v020302p.pdf> | §2.1, §3.1, §6.1 |
| EN 301 489-17 | ETSI EN 301 489-17, part 17: broadband and wideband data transmission systems | V3.3.1 (2024-09) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148917/03.03.01_60/en_30148917v030301p.pdf> | §1 table 1, §2.1, §6, §6.4, table 2 |
| EG 203 367 | ETSI EG 203 367, guide to harmonised standards for multi-radio and combined equipment | V1.1.1 (2016-06), the only version | <https://www.etsi.org/deliver/etsi_eg/203300_203399/203367/01.01.01_60/eg_203367v010101p.pdf> | §1, §3.1, §5.1.1.3, §5.2.3, §6.1 notes 1 to 3, §6.2 |
| IEC18 | IEC 62368-1:2018, table of contents (VDE Verlag preview) | edition 3.0 | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec62368-1%7Bed3.0%7Db.pdf> | title of table 4; clauses 6.4.5, 10.4; table 40 |
| EVS 50130-4 | EVS product page, EVS-EN 50130-4:2011+A1:2014 (consolidated) | read 25 November 2026 | <https://www.evs.ee/en/evs-en-50130-4-2011-a1-2014-consolidated> | scope; price; "Directives or regulations: None"; standard history (prEN 50130-4:2026) |
| DIN Media 50130-4 | DIN Media, DIN EN 50130-4:2015-04; VDE 0830-1-4:2015-04 | read 25 November 2026 | <https://www.dinmedia.de/en/standard/din-en-50130-4/228662474> | price |
| iTeh 50130-4 preview | SIST EN 50130-4:2011, free sample | 2011 base text | <https://cdn.standards.iteh.ai/samples/22803/7e22d3a729bd42438ee0562acbfd0d9b/SIST-EN-50130-4-2011.pdf> | clause 1; table of contents (clause 13, table 7) |
| IEC 61000-4-5 preview | IEC 61000-4-5, surge immunity test (VDE Verlag preview) | edition 3.0 (2014) | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec61000-4-5%7Bed3.0%7Db.pdf> | clause 1, note; table of contents |
| DIN Media prEN 40000-10 | DIN Media, draft DIN EN 40000-10 (English version prEN 40000-10:2026) | drafts of 22 May 2026 and 6 November 2026 | <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/402331001>, <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/407570821> | dates of issue |
| Genorma | Genorma, listing of prEN 40000-10 (secondary) | read 25 November 2026 | <https://genorma.com/en/standards/pren-40000-10> | stage 40.60; close of voting 13 August 2026; CEN/TC 224 |
| BSI 60825-1 | BSI, scope of BS EN 60825-1:2014+A11:2021 | read 25 November 2026 | <https://knowledge.bsigroup.com/products/safety-of-laser-products-equipment-classification-and-requirements-3?version=standard> | scope: LEDs removed from part 1 |
| SIQ | SIQ, "Update on EN IEC 62368-1:2024 + A11:2024 and OJEU harmonization status" (secondary) | 16 December 2025 | <https://www.siq.si/en/news/update-on-en-iec-62368-12024-a112024-and-ojeu-harmonization-status/> | the 2024 edition exists and is unlikely to be cited |

### Espressif and FCC (module-specific)

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| DS | ESP32-C6-MINI-1 & MINI-1U Datasheet | v1.5 (16 June 2026) | <https://www.espressif.com/sites/default/files/documentation/esp32-c6-mini-1_mini-1u_datasheet_en.pdf> | §1.2 p. 3; §7 p. 30; §10.2 pp. 42, 43 |
| CE-1U | EU-type examination certificate SN24C0053, ESP32-C6-MINI-1U, Sporton International (USA) Inc., notified body 2907 | 6 March 2024, revision A | <https://www.espressif.com/sites/default/files/certificates/ESP32-C6-MINI-1U%20CE%20Certification.pdf> | pp. 1, 2 (notes 1, 2; maximum output power), 3 |
| CE-1 | EU-type examination certificate SN23C0148, ESP32-C6-MINI-1, same notified body | 28 September 2023 | <https://www.espressif.com/sites/default/files/certificates/ESP32-C6-MINI-1%20CE%20Certification.pdf> | pp. 1, 2 |
| CERTS | Espressif certificates page for the ESP32-C6-MINI-1 and -1U | read 25 November 2026 | <https://www.espressif.com/en/support/documents/certificates?keys=ESP32-C6-MINI-1> | list of certificates, no test reports |
| FAQ | ESP-FAQ, Hardware related, RF related | latest, read 25 November 2026 | <https://docs.espressif.com/projects/esp-faq/en/latest/hardware-related/RF-related.html> | antenna selection and report reuse; RF information via sales; `cert_test` example |
| RFT | ESP Test Tools, "EspRFTestTool Toolkit" (ESP32-C6) | latest, read 25 November 2026 | <https://docs.espressif.com/projects/esp-test-tools/en/latest/esp32c6/development_stage/rf_test_guide/rf_test_guide.html> | toolkit and test firmware |
| FCC-G | FCC grant, FCC ID 2AC7Z-ESPC6MINIU (ESP32-C6-MINI-1U) | granted 6 March 2024 | <https://www.espressif.com/sites/default/files/ESP32-C6-MINI-1U%20FCC%20Certification.pdf> | grant notes (20 cm; output power conducted) |
| FCC exhibits | FCC exhibit list for 2AC7Z-ESPC6MINIU (test reports, antenna specification TFPD08H10060011) | read 25 November 2026 | <https://fccid.io/2AC7Z-ESPC6MINIU> | public test reports; antenna specification pp. 2, 3 |
| eCFR 15.203 | 47 CFR 15.203, antenna requirement | current eCFR | <https://www.ecfr.gov/current/title-47/section-15.203> | full text |
| eCFR 15.204 | 47 CFR 15.204, external amplifiers and antenna modifications | current eCFR | <https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15/subpart-C/section-15.204> | (c)(1), (c)(4) |

### Test reports, UL, IEEE and other secondary sources

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| FLIR | CTC advanced, test report 60429496-001, FLIR A50/A70, IEC 62368-1:2014 | 30 April 2021 | <https://support.flir.com/CertDownload/Assets/FLIR%20A50%20and%20A70%20series/IEC%2062368-1%20TEST%20REPORT.pdf> | pp. 1, 2, 8, 10, 15, 17, 18, 47, 48 |
| AIR | EKTOS, test report P18-0060-1, Airtame AT-PoE, IEC 62368-1:2014 | 21 November 2018 | <https://www.northamber.com/storage/uploads/Product%20Safety/Airtame/EU%20Safety%20Test%20Report%20(LVD)%20PoE%20_P18-0060-1_IEC62368-1.pdf> | pp. 1, 2, 8, 9, 21, 51, 52 |
| TI 2018 TRF | Test report US-2558-MET EN 126343 M0A0, IEC 62368-1:2018 (hosted by TI) | read 25 November 2026 | <https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/US_2D00_2558_2D00_MET-EN-126343-M0A0.pdf> | table 6.2.3.2, column "Dissipate power (W)" |
| ULQA | UL Solutions, "IEC 62368-1 Ask the Engineers" questions and answers (secondary) | read 25 November 2026 | <https://www.ul.com/resources/iec-62368-1-ask-engineers-question-and-answer-page> | answers on ES1 and internal converters, HB casings, PS2 without fire enclosure, resistive ignition sources in editions 2 and 3, declaring an ignition source, 6.3.1, 6.4.8, 5.4.11 |
| ULTB | UL technical brief on power source classification and measurement (secondary) | 2011, for the first edition | <https://japan.ul.com/wp-content/uploads/sites/27/2014/06/1_techbrief_classandele_measurement.pdf> | table of PS1, PS2, PS3; pp. 2, 3 (measuring below the trip point) |
| TUV | TÜV Rheinland, IEC 62368-1 third edition technical product sheet (secondary) | 20 September 2019 | <https://media.go.tuv.com/Web/TUVRheinlandAG/%7B73d23bd3-a64c-4168-b067-832362b95455%7D_62368-1_Technical_Product_Sheet_AV-IT_9.20.19.pdf> | items 16, 17 |
| IEEEI | IEEE 802.3 interpretation 3-07/04 on clause 33.4.1 | read 25 November 2026 | <https://www.ieee802.org/3/interp/interp-3-0704.pdf> | quote of 33.4.1 |
| IEEEW | IEEE 802.3 isolation ad hoc, summary of isolation tests (working-group document, secondary) | 17 August 2017 | <https://www.ieee802.org/3/ad_hoc/isolation/public/Walker_1_08172017_rev_1.pdf> | table for 33.4.1 |
| Sagentia | Sagentia, "Lead is now on the REACH candidate list" (secondary) | read 25 November 2026 | <https://sagentia.com/news/lead-is-now-on-the-reach-candidate-list/> | lead added to the Candidate List on 27 June 2018 |
| JLCPCB UL | JLCPCB help, "UL Certification" | read 25 November 2026 | <https://jlcpcb.com/help/article/UL-Certification> | UL file E479892; UL marking added when the order asks for it |

### Filament makers

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| Unger guide | Filament Unger, material guide | read 25 November 2026 | <https://filament-unger.de/pages/material-guide> | ABS+ heat resistance about 95 °C; no flammability, RoHS or REACH statement |
| Unger downloads | Filament Unger, downloads | read 25 November 2026 | <https://filament-unger.de/pages/downloads> | list of data sheets |
| FormFutura TDS | FormFutura, ABSpro Flame Retardant technical data sheet | v3 | <https://cdn.shopify.com/s/files/1/0622/4181/files/ABSpro_Flame_Retardant_-_TDS_-_Formfutura.pdf> | flammability, composition, RoHS, REACH |
| BASF TDS | BASF Ultrafuse PC/ABS FR Black, technical data sheet (German) | v1.1, 9 February 2021 | <https://cdn.shopify.com/s/files/1/0264/8791/4555/files/Ultrafuse_PC-ABS_FR_Black_TDS_DE_v1.1.pdf> | "Flammschutzklasse V0 @ 1,5 mm and 3,0 mm" |
| ROSA TDS | ROSA 3D, technical data sheet "3D FILAMENT ABS+" (product name ABS FR V0) | read 25 November 2026 | <https://www.lemona.lt/Files/Instrukcijos/TI/En/Pdf/TDS-ROSA-ABS-EN.pdf> | header, product name, flame rating |

### Repository

| Key | Full title | Version / date | URL | Clause or page relied on |
|---|---|---|---|---|
| design-notes.md | Touch P4 design notes | this branch | [design-notes.md](design-notes.md) | "Wi-Fi antenna", "Power", "Power budget", "Simulation", "Decisions" (DC connectors) |
