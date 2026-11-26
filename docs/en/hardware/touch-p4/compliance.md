# CE and market checklist
<!-- llms-description: What CE marking and the EU market rules ask of the Touch P4 reader: radio (2.4 and 5 GHz), EMC, safety, cybersecurity, registrations, and what is still open. -->

A PCB cannot be "CE conform" on its own: the CE mark applies to the finished
reader (board, display, enclosure, power supply, firmware and documents)
[RED Art. 2(1), 20(1)]. This page lists what applies in Germany and the EU,
what the board design already does for it, and what is still open.

It is a working checklist with the state of 26 November 2026, not legal
advice. Every claim was checked against its source on 25 November 2026, those
on the ESP32-C5 module and on 5 GHz Wi-Fi on 26 November 2026. A reference
in square brackets names a source and the clause relied on, for example
[RED Art. 10(9)]. [compliance-sources.md](hardware/touch-p4/compliance-sources.md) lists every
source with its version and link, and the result of the check for each claim.

Standards that are not free to read (EN 18031, EN 55032, EN 55035,
EN 50130-4, IEC 61000-4-5 and every edition of EN IEC 62368-1) could not be
checked. Claims that rest on them, on lab practice or on an estimate are
marked "unverified", with the reason. For EN 62368-1 the check used UL's
published answers, the free table of contents of the 2018 edition and two
published test reports. An earlier revision of this page also read the fire
clauses in a copy of the 2014 edition (see "Enclosure plastic").

## Will it be easy?

Radio, EMC and safety are ordinary work for a test lab, and the certified
Wi-Fi module takes part of it away. Registrations and paperwork are small.
Cybersecurity is the hard part, and it does not depend on the board:

1. **Cyber Resilience Act.** An access control reader is an "important
   product, class I" [CRA Art. 7(1), Annex III class I no. 1]. From
   11 December 2027 the manufacturer may assess it himself only if he applies
   in full a harmonised standard cited under the Act (or common
   specifications, or an EU cybersecurity certificate at level
   "substantial"), and the standard covers all risks of the reader's core
   function [CRA Art. 32(2); CRA guidance para 149]. The standard for this
   product class (prEN 40000-10) is a draft [DIN Media prEN 40000-10].
   Without it a notified body has to examine the product [CRA Art. 32(2)].
2. **EN 18031 until then.** Since 1 August 2025 the reader must meet the
   RED's cybersecurity requirements [DR 2023/2444 Art. 1]. It can be declared
   without a notified body only if EN 18031-1 and -2 are applied in full,
   and their default-password clauses never let the user skip setting and
   using a password [RED Art. 17(3), (4); HS-RED no. 164, 165]. Otherwise a
   notified body is needed already now.
3. **First visit to the lab.** The reader's own NFC transmitter, two cable
   ports and discharges onto a glass display are where a first run usually
   fails (unverified: experience, no source). Measuring beforehand decides
   whether the lab is visited once or three times.
4. **What exactly is sold.** Enclosure material, a supply in the box or not,
   allowed cable lengths, business customers only or private buyers too, and
   the number of versions each add or remove tests and duties (see "Tests on
   the ports" and "Which rules apply").

## Which rules apply

| Rule | Applies | What the manufacturer has to do |
|---|---|---|
| Radio Equipment Directive 2014/53/EU (RED) | yes | The reader contains radios: Wi-Fi on 2.4 and 5 GHz and Bluetooth, and the 13.56 MHz NFC reader [RED Art. 2(1)]. Assess safety, EMC, radio and cybersecurity [RED Art. 3]. Keep the technical file and the declaration of conformity for ten years after the reader is placed on the market [RED Art. 10(4)]. Issue one EU declaration of conformity [RED Art. 18(3)], and ship each unit with a copy of it, or with a simplified declaration that gives the web address of the full text [RED Art. 10(9); FuAG §20(2)]. Put the CE mark on the device and its packaging [RED Art. 20(1)], and name, postal address, type and serial number on the device [RED Art. 10(6), (7)]. Instructions and safety information with the frequency bands and the maximum transmitted power [RED Art. 10(8); FuAG §20(3)], and for 5 GHz the indoor restriction on the packaging and in the instructions [RED Art. 10(10)] (see "5 GHz Wi-Fi"). They must be in German if the reader is sold for non-commercial users; for business-only sales the law asks for clear, understandable text [FuAG §20(1)]. German is advisable in any case. |
| Low Voltage and EMC Directives | not separately | For radio equipment the RED covers both [RED Art. 1(4), 3(1), 50; EMCD Art. 2(2)(a)]. Safety applies through RED Art. 3(1)(a) "with no voltage limit applying" [RED Art. 3(1)(a)]: the reader runs from 12 to 24 V and PoE, below the LVD's own range, and still has to be safe under the RED. The declaration names the RED. |
| RED cybersecurity, Delegated Regulation (EU) 2022/30 | yes, until 10 December 2027 | Applies since 1 August 2025 [DR 2023/2444 Art. 1]: network protection, because the reader can communicate over the internet, directly or through other equipment [DR 2022/30 Art. 1(1)], and protection of personal data, because it processes card numbers linked to names [DR 2022/30 Art. 1(2)]. Repealed from 11 December 2027 by Delegated Regulation (EU) 2026/339, when the Cyber Resilience Act applies in full [DR 2026/339 Art. 1, recital 4]. Readers placed on the market before then stay under RED market surveillance for these requirements [DR 2026/339 recital 5]. |
| Cyber Resilience Act (EU) 2024/2847 | yes | Since 11 September 2026: report exploited vulnerabilities and severe incidents, with an early warning within 24 hours, a notification within 72 hours and a final report later [CRA Art. 14(2), (4), 71(2)]. That already covers readers sold today [CRA Art. 69(3)]. From 11 December 2027: full conformity for every unit placed on the market [CRA Art. 69(2), 71(2)], with a support period that matches how long the reader is expected to be in use, at least five years, and its end date stated at purchase [CRA Art. 13(8), (19)]. See "Cybersecurity". |
| RoHS 2011/65/EU | yes | Keep supplier declarations for all parts and the PCB in the technical file. They are the usual evidence; the Directive asks for technical documentation and internal production control, not for this form [RoHS Art. 7(b), (d)]. RoHS is named on the declaration of conformity [RoHS Annex VI; RED Art. 18(3)]. |
| REACH Article 33; SCIP database | yes | Tell customers when a part contains a Candidate List substance above 0.1 %, and consumers on request within 45 days [REACH Art. 33(1), (2)]. Notify the same information to ECHA's SCIP database; this duty comes from the Waste Framework Directive, in Germany the Chemicals Act [WFD Art. 9(1)(i); ChemG §16f]. Lead in some components is the usual case: it has been on the Candidate List since June 2018 [Sagentia (secondary)]. |
| WEEE / ElektroG | yes | Register brand and device type with stiftung ear before the first sale [ElektroG §6(1)]: usually two to four weeks for a complete application [ear reg], and about 130 EUR a year plus VAT in fees, 32.80 EUR a quarter [GebV no. 1.2; ear fees]. A household device needs a yearly insolvency-proof guarantee. A business device needs a credible showing that it is used only or usually outside private households, a take-back concept, a take-back offer and written disposal information with each delivery [ElektroG §7(1), (3), §7a, §19, §19a]. A device that private buyers can also use counts as a household device [ElektroG §3 no. 5]: selling to private buyers rules out the business registration. A wall reader sold only to workshops can be a business device if that is credibly shown [ElektroG §7(3)]. On the device, permanently: crossed-out bin, the producer's identity, and a mark that it was placed on the market after 13 August 2005 [ElektroG §9(1), (2), §3 no. 4]; the usual mark is a bar under the bin (unverified: EN 50419, a paid standard). Registration number on offers and invoices [ElektroG §6(3)]. Selling directly to end users in another EU country needs a registration there through an authorised representative in that country. Where a local importer or distributor places the reader on that market, that company registers [WEEE Art. 3(1)(f), 16(1), 17(2); ElektroG §8(5)]. |
| Packaging: Regulation (EU) 2025/40 (PPWR) and the German VerpackDG | yes | Register in LUCID before the first supply [VerpackDG §6(1), (6); ZSVR]. Take part in a system for packaging that typically ends up in private households or at comparable sources. Workshops and offices with household-type bins count as such, so selling only to businesses does not by itself remove the duty [VerpackDG §3(6), (7), §7]. Report material and mass [VerpackDG §9(1)]. Whoever has packaging or a packaged product made under his own name or trademark is the packaging's manufacturer under the PPWR, with conformity assessment, technical documentation and an EU declaration of conformity for the packaging [PPWR Art. 3, 15(2)]. A micro-enterprise whose packaging supplier is in the same country is the exception [PPWR Art. 3]. Packaging outside system participation, such as shipping cartons to business customers, must be taken back free of charge [VerpackDG §39(1)]; from 2028 that needs an approval from the ZSVR [ZSVR]. The PPWR and the VerpackDG replaced the Verpackungsgesetz on 12 August 2026 [PPWR Art. 71; ZSVR; VerpackDG]. |
| Batteries Regulation (EU) 2023/1542 | no | The board has no battery. It applies as soon as one is added [Batteries Reg Art. 1(3)]. |
| General Product Safety Regulation (EU) 2023/988 | if consumers buy it or are likely to use it | A product counts if consumers are likely to use it, even when it is not meant for them [GPSR Art. 3(1), recital 17]. Members who badge in at a club or makerspace may count: check the use case. For a product under EU harmonisation law, such as the RED, what remains are the rules for distance sales, accident reports and recalls [GPSR Art. 2(1), 19, 20, 36, 37]. |
| Data Act (EU) 2023/2854 | in scope, main duties exempt | The reader is a "connected product" [Data Act Art. 2(5)]. The duties to give access to its data do not apply to a micro or small enterprise (as defined in Recommendation 2003/361/EC), provided it has no larger partner or linked enterprise and does not design or build the product as a subcontractor. A firm that becomes medium-sized keeps the exemption for one year [Data Act Art. 7(1)]. Check again when the company grows. |
| USB-C common charger rule | no | Only covers listed categories of rechargeable devices [RED Annex Ia Part I]. |
| Funkanlagengesetz | yes | The German form of the RED. The Bundesnetzagentur supervises [FuAG footnote, §23(1)]. |
| Product liability | yes | The new directive applies to products placed on the market after 9 December 2026 [PLD Art. 2(1)], through national law (the German transposition was not checked). It counts software as a product, judges defects against safety-relevant cybersecurity requirements, and keeps the manufacturer liable for a lack of software updates needed for safety while they are within his control [PLD Art. 4(1), 7(2)(f), 11(2)]. Insure accordingly. |

## Standards a lab applies

"Cited" means listed in the Official Journal. Applying a cited standard gives
a presumption of conformity with the essential requirements it covers, within
the limits of any notice printed with the citation [RED Art. 16]. It is not
proof. For radio and cybersecurity only cited standards, applied in full,
allow a declaration without a notified body [RED Art. 17(3), (4)]. For safety
and EMC the manufacturer may always declare himself [RED Art. 17(2)].

| Aspect | Standard | State on 25 November 2026 |
|---|---|---|
| Radio, 2.4 GHz | EN 300 328 V2.2.2 | cited [HS-RED no. 16] |
| Radio, 5 GHz | EN 301 893 V2.2.1 | cited since 15 May 2025; V2.1.1 until 15 May 2028 [HS-RED no. 65, 65a; HS-RED 2025/893 Art. 2] |
| Radio, 13.56 MHz | EN 300 330 V2.1.1 | cited [HS-RED no. 17] |
| EMC | EN 301 489-1 V2.2.3, -3 V2.3.2 (NFC), -17 V3.3.1 (Wi-Fi, Bluetooth) | parts 3 and 17 cited, each with two notices: no presumption for emissions below 9 kHz, and none "if its clause 6 is applied" (clause 6 holds the performance criteria) [HS-RED no. 168, 169; EN 301 489-17 §6]. In plain words: tested with their performance criteria as written, the reader gets **no presumption of conformity for RED Art. 3(1)(b)**; the Commission found that these criteria "lay down performance-based criteria on a subjective basis" [HS-RED 2025/893 recital]. EMC is then assessed by the manufacturer without that presumption [RED Art. 17(2), Annex II], so the test plan and the technical file have to define objective pass criteria, for example a Wi-Fi packet error rate of 10 % at most, NFC reads that succeed, display and touch that recover without a reset. Part 1 is not cited; parts 3 and 17 apply it [EN 301 489-3 §2.1; EN 301 489-17 §2.1]. |
| EMC, Ethernet port | EN 55032 (emission), EN 55035 (immunity) | EN 55035:2017 cited under the RED [HS-RED no. 5]; EN 55032 cited only under the EMC Directive [HS-EMC] |
| Safety | EN IEC 62368-1:2020 + A11, or the 2024 edition | not cited under the RED [HS-RED]; under the LVD only the 2014 edition is cited [HS-LVD]. Ask the lab which edition it reports to. |
| RF exposure | EN IEC 62311 with EN 50665; EN 50364 for the NFC reader | not cited under the RED [HS-RED] |
| Cybersecurity | EN 18031-1 (network) and EN 18031-2 (personal data) | cited with notices, see "Cybersecurity" [HS-RED no. 164, 165; ID 2025/138] |

For NFC the carrier limit is 60 dBµA/m at 10 m for RFID and NFC, under a
spectrum mask [EN 300 330 §4.3.4 table 2, notes 2 and 3]. It is no concern:
a loop of this size stays about 50 dB below it (unverified: our estimate).
The harmonics are. The PN532 drives the antenna with a square wave (PN532
data sheet, not checked here). Several harmonics fall into bands where only
4 nW e.r.p. may be radiated: 47 to 74, 87.5 to 118, 174 to 230 and 470 to
790 MHz. That catches the harmonics at 54, 68, 95, 108, 176 to 217 and 475
to 786 MHz [EN 300 330 §4.3.9.3 table 6, §6.2.9]. Elsewhere from 30 MHz to
1 GHz the limit is 250 nW. Below 30 MHz the second harmonic, 27.12 MHz, must
stay under -3.5 dBµA/m at 10 m [EN 300 330 §4.3.8.3 table 5]. The small loop
hardly radiates them; the DC and Ethernet cables next to it do (engineering
judgement). In the radio test the lab keeps power leads out of the
measurement, for example by routing them away or loading them with ferrite
beads [EN 300 330 §5.4.1, annex C.2.3]. Measure your own pre-test both with
and without such loading.

## What the certified Wi-Fi module saves

The reader uses the ESP32-C5-MINI-1, a module with its own PCB antenna for
2.4 and 5 GHz [DS-C5 §1]. It has an EU-type examination certificate for the
model with its internal antenna (Eurofins Electrical and Electronic Testing NA,
notified body 0980, 44024-05-2026-260268 of 27 May 2026) [CE-C5 pp. 1, 2]. It
covers safety (EN IEC 62368-1:2024 + A11), health (EN 50665, EN IEC 62311),
EMC (EN 55032, EN 301 489-1 V2.2.3, EN 301 489-17 V3.3.1) and radio
(EN 300 328 V2.2.2, EN 301 893 V2.2.1), not cybersecurity [CE-C5 pp. 2, 3].
Its EMC part was assessed on the module alone; Espressif says "Some data can
be reused, but EMC testing is still required for the final product" [FAQ].
Espressif publishes the certificate only: ask for the test reports it names
(EFTA26010030-IE-01-E1, -02-R1 to -R4, -03-M1V1 and -04-L1, Eurofins TA
Technology (Shanghai)) before asking labs for quotes [CE-C5 pp. 2, 3; FAQ].

ETSI EG 203 367 is a guide for the manufacturer, not a harmonised standard.
It lets the module's radio assessment be reused if the module sits in
equivalent assessment conditions and follows its installation instructions.
A different host, or an antenna that was not part of the module's assessment,
is a deviation: the reader is then re-assessed against the radio standard,
which need not mean testing [EG 203 367 §3.1, §6.1 notes 1 and 2]. Labs
typically reuse results that do not depend on the antenna, such as the
module's conducted measurements (unverified: lab practice, not stated in the
guide).

Here the antenna is the module's own, but the module does not sit where
Espressif's design guide puts it: it stands in the board's top left corner,
with its antenna over a cut in the top edge, not at the edge's middle
(design notes, "Wi-Fi antenna" and "Accepted deviations"). In the full-wave
model that place is within 3 dB of Espressif's position in every channel and
radiates up to 5.5 dB more in some 5 GHz channels. Whether that still counts
as equivalent conditions is the lab's judgement; plan for these measurements
on the reader:

- radiated power (e.i.r.p.) and spurious emissions on both bands, with NFC
  transmitting at the same time [EG 203 367 §6.1 note 1, §6.2;
  EN 300 328 §4.3.2.2.3; EN 301 893 §4.2.3],
- EMC with all radios running [EG 203 367 §5.1.1.3, §5.2.3].

Separately, RF exposure (RED Art. 3(1)(a), outside the guide's scope
[EG 203 367 §1]). The FCC grant asks for 20 cm between antenna and persons
[FCC-C5]; the EU certificate names EN 50665 and EN IEC 62311 but no distance
on its face [CE-C5 p. 2], so ask for the health report
(EFTA26010030-IE-03-M1V1) as well. A reader that is touched does not keep
20 cm, so it needs its own assessment; a calculation is usually enough
(unverified: lab practice).

Points to watch:

- One German notified body (VDE, 0366) reads the rules more strictly and
  wants an EU-type examination whenever only module reports exist (its
  customer information "RED Information Radio Modules" of 24 November 2020)
  [VDE RED modules p. 2]. Ask each lab how it sees this before it quotes, and
  reconfirm with VDE that the 2020 statement still holds (open point below).
- Transmit power. The certificate lists 19.85 dBm for Wi-Fi at 2.4 GHz,
  16.36 dBm for Bluetooth LE, 20.58, 20.74 and 20.77 dBm in the bands 5150 to
  5250, 5250 to 5350 and 5470 to 5725 MHz, and 13.97 dBm from 5725 to
  5850 MHz [CE-C5 p. 2]; it does not say whether those are conducted or
  radiated. The limits are e.i.r.p.: 20 dBm at 2.4 GHz [EN 300 328
  §4.3.2.2.3], and at 5 GHz those of "5 GHz Wi-Fi" below. Espressif's antenna
  peaks at 4.44 dBi at 2.4 GHz and 1.55 to 2.18 dBi at 5 GHz on its test
  board [ANT-C5 §3.1]. Where the reader's antenna has more gain than that,
  the transmit power has to come down by the difference. So the maximum
  transmit power is a firmware setting, capped by what the lab measures on
  the reader ([firmware-port.md](hardware/touch-p4/firmware-port.md), rule 24).
- The antenna is part of the module and cannot be changed: the reader has one
  radio configuration, no antenna choice and no antenna connector. Keep metal
  away from the top left corner: in the model a metal wall behind the reader
  costs 1.1 to 1.7 dB at 2.4 GHz (design notes, "Wi-Fi module").
- For a later US version: the FCC grant is a single modular approval, with
  20 cm to persons and co-located transmitters evaluated by the FCC's
  procedures [FCC-C5]. This page covers the EU only.

## 5 GHz Wi-Fi

The EU harmonises the bands 5150 to 5350 and 5470 to 5725 MHz for Wi-Fi by
Implementing Decision (EU) 2022/179, whose annex was replaced by Implementing
Decision (EU) 2022/2307; it repealed Decision 2005/513/EC [WAS Art. 1, 5;
WAS-A Art. 1(2)]. EN 301 893 V2.2.1 gives a presumption of conformity since
15 May 2025 [HS-RED no. 65a; HS-RED 2025/893]; V2.1.1 keeps it until 15 May 2028
[HS-RED 2025/893 Art. 2]. The module's certificate names V2.2.1 [CE-C5 p. 3].

| Band (channels) | Use allowed | Mean e.i.r.p. | On this reader |
|---|---|---|---|
| 5150 to 5250 MHz (36 to 48) | indoors, including road vehicles, trains and aircraft; limited outdoor use, not "attached to a fixed outdoor antenna, fixed infrastructure or to the external body of road vehicles" [WAS Annex table 1, note 1] | 200 mW (23 dBm), 10 mW/MHz [WAS Annex table 1] | used |
| 5250 to 5350 MHz (52 to 64) | "Indoor use: inside buildings only" [WAS Annex table 2] | 200 mW with transmit power control (TPC), otherwise 3 dB less, 100 mW (20 dBm); DFS [WAS Annex table 2] | used, as a station led by the access point's DFS |
| 5470 to 5725 MHz (100 to 140) | indoors and outdoors [WAS Annex table 3] | 1 W with TPC, otherwise 500 mW; DFS [WAS Annex table 3]. A secondary device without radar detection keeps to the limits of 5250 to 5350 MHz [EN 301 893 §4.2.3.2.2 table 2, note 1] | used, the same way |
| 5725 to 5875 MHz (149 to 165) | not in the Wi-Fi decision: a band for non-specific short-range devices at 25 mW e.i.r.p. [SRD Annex band 61] | 25 mW | not used |

What it means for the reader:

- **A station, no radar detection of its own.** EN 301 893 V2.2.1 calls the
  access point the primary device and the reader a secondary device
  [EN 301 893 §3.1]. "A secondary device shall not transmit before receiving
  an appropriate enabling signal from the primary device"
  [EN 301 893 §4.2.6.1.4.2 a)]; without radar detection it needs only channel
  shutdown, when the access point orders it [EN 301 893 §4.2.6.2.1 table 5].
  Up to 23 dBm e.i.r.p. a secondary device need not detect radar itself,
  unless used in a fixed outdoor point-to-point or point-to-multipoint link
  [EN 301 893 annex D, table D.2 note 2]. The C5 "only supports passive radar
  detection", "cannot operate as a DFS AP in SoftAP mode", and "In SoftAP
  mode, ESP32-C5 is not allowed to operate on DFS channels" [IDF-WIFI, DFS].
  In station plus SoftAP mode its access point follows the station onto a DFS
  channel [IDF-WIFI, DFS]. Firmware: a provisioning access point only on
  2.4 GHz or channels 36 to 48, and off while the station uses a DFS channel
  (firmware-port.md, rule 23).
- **Power.** Without TPC: 20 dBm e.i.r.p. from 5250 to 5725 MHz, 23 dBm from
  5150 to 5250 MHz [EN 301 893 §4.2.3.2.2 table 2]. The certificate's 20.74
  and 20.77 dBm lie above 20 dBm (see "What the certified Wi-Fi module
  saves"); keep the reader at 20 dBm e.i.r.p. there unless the lab confirms
  that the firmware does TPC (firmware-port.md, rule 24).
- **No country or band setting for the user.** "DFS settings shall not be
  accessible to the user", which includes "not allowing the user to change
  the country of operation and/or the operating frequency band if that
  results in the equipment no longer being compliant" [WAS Annex tables 2, 3].
  ESP-IDF starts in world mode ("01") with an automatic policy that takes the
  connected access point's country; under `WIFI_COUNTRY_POLICY_MANUAL` "the
  configured country info is used always", and only then does the 5 GHz
  channel mask (`wifi_5g_channel_mask`) take effect [IDF-API,
  `esp_wifi_set_country`, `wifi_country_t`]. Firmware: the manual policy with
  the EU rules and channels 36 to 64 and 100 to 140 only, fixed at build time
  (firmware-port.md, rule 22). Espressif's own table for Germany would allow
  channels 149 to 165 at 25 mW and still cites the repealed 2005/513/EC
  [IDF-REG]; the channel mask keeps them off.
- **Indoor use, on the packaging and in the manual.** Channels 36 to 64 are
  restricted to indoor use in every Member State (above), a restriction on
  putting into service. The packaging then shows either the pictogram of
  Implementing Regulation (EU) 2017/1354, a table with an exclamation mark on
  a book and the Member States' codes below or next to it, or the words
  "Restrictions or Requirements in" followed by those codes [RED Art. 10(10);
  IR 2017/1354 Art. 2(1), Annex I, II]. The instructions list the Member
  States and the kind of restriction: "5150 to 5350 MHz: indoor use only",
  in all of them [IR 2017/1354 Art. 2(2)]. They also name the frequency bands
  and the maximum power in each [RED Art. 10(8)]: 2400 to 2483.5 MHz, 5150 to
  5350 MHz and 5470 to 5725 MHz, with the e.i.r.p. the lab measured. The
  reader is an indoor device anyway ([spec.md](hardware/touch-p4/spec.md)), and its case is
  not made for outdoors ([case](hardware/touch-p4/case.md)).

## Cybersecurity

**Now, under the RED.** The reader must meet RED Art. 3(3)(d) and (e),
because it can communicate over the internet and processes personal data
[DR 2022/30 Art. 1(1), (2)]. Point (f), for equipment that transfers money,
does not apply [DR 2022/30 Art. 1(3)]. A declaration without a notified body
needs EN 18031-1 and -2 applied in full [RED Art. 17(3), (4)]. The standards
are cited with notices. They give no presumption if, under their clauses on
default passwords (6.2.5.1 and 6.2.5.2), the user is allowed not to set and
use any password. Their "rationale" and "guidance" sections never count
[HS-RED no. 164, 165; ID 2025/138 recital 6]. So every access to settings,
pairing and the service interface has to be authenticated, with credentials
that are unique per device or set at first use and cannot be skipped. Then
every requirement of both parts is documented with the standard's decision
trees. (Unverified: EN 18031 is a paid standard and was not read; confirm
with the lab.) The firmware of the ESP32-C5 is part of the product (our
reading: the RED counts software as a component [RED Art. 10(8)]).

**From 11 December 2027, under the Cyber Resilience Act.**

- The reader is class I. Annex III of the Act lists "identity management
  systems and privileged access management software and hardware, including
  authentication and access control readers, including biometric readers"
  [CRA Annex III class I no. 1]. Implementing Regulation (EU) 2025/2392
  describes the category, including "access management systems that control
  access ... to digital resources or physical locations" [IR 2025/2392
  Annex I class I no. 1].
- A class I product may be assessed by its manufacturer only where cited
  harmonised standards (or common specifications, or an EU cybersecurity
  certificate at level "substantial") exist, are applied in full and cover
  all risks of the reader's core function [CRA Art. 32(2); CRA guidance
  para 149]. Otherwise a notified body examines it.
- EN 18031 gives no presumption under the Act: it is cited under the RED
  only [CRA Art. 27(1)]. What carries over is a notified body's RED
  certificate for cybersecurity, for the risks it covers and not beyond
  11 June 2028 [CRA Art. 69(1); CRA guidance paras 251 to 254].
- The standard for this category, prEN 40000-10, is drafted by CEN/TC 224
  and was out for comment from late May to 13 August 2026 [DIN Media
  prEN 40000-10; Genorma (secondary)]. The Commission's deadline for CEN to
  adopt it is 31 January 2027 [C(2026) 7861 annex, line 16]; citation in the
  Official Journal follows later. No standard has been cited for the Act yet
  [CRA std page]. Whether this one is cited before December 2027 is open:
  plan for both outcomes, and look again in the first half of 2027.
- Open source helps less than it seems. The Act lets products "qualifying as
  free and open-source software" in Annex III (class I or II) use
  self-assessment if their technical documentation is public when they are
  placed on the market [CRA Art. 32(5); CRA guidance para 137]. The
  definition covers software [CRA Art. 3(48)]. Whether a hardware reader with
  open firmware qualifies is not settled. The Commission's guidance treats
  hardware and its firmware as one product, which argues against it
  [CRA guidance para 25]. The BSI is to be the German market surveillance
  authority and the one to ask [BT-Drs 21/6134 Art. 1, §65(1) BSIG]; the
  Bundestag adopted that law on 15 October 2026, and its promulgation was not
  found on 25 November 2026 [BR-Drs 621/26]. Publishing the documentation
  costs this project nothing in any case.
- There is no exemption from the requirements for small companies. They get
  lower notified-body fees [CRA Art. 32(6)], a simplified documentation form
  that is not yet published [CRA Art. 33(5); MSME page], and no fine for
  missing the 24-hour early warning; the 72-hour notification still applies
  [CRA Art. 64(10)(a)].

What it needs in substance. Required by the Act: a written risk assessment,
kept up to date [CRA Art. 13(2), (3)]; a software bill of materials
[CRA Annex I Part II (1)]; a stated support period that reflects the expected
use time, at least five years [CRA Art. 13(8), (19)]; a contact address for
vulnerability reports [CRA Annex I Part II (6), Art. 13(17)] and a policy on
coordinated vulnerability disclosure [CRA Annex I Part II (5)]; security
updates free of charge [CRA Annex I Part II (8)], installed automatically by
default with an easy opt-out where applicable [CRA Annex I Part I (2)(c)],
and each kept available for at least ten years or the rest of the support
period [CRA Art. 13(9)]; published information on fixed vulnerabilities
[CRA Annex I Part II (4)]; the user information of Annex II [CRA Art. 13(18)];
and the technical file and declaration kept for ten years or the support
period, whichever is longer [CRA Art. 13(13)]. The project's chosen means,
which the Act does not name: secure boot and flash encryption on the
ESP32-P4 (see [firmware-port.md](hardware/touch-p4/firmware-port.md) for an erratum that
matters here) [CRA Annex I Part I (2)(e), (f)], signed firmware updates for
both processors [CRA Annex I Part II (7)], no default credentials
[CRA Annex I Part I (2)(b), (d)], and a written procedure for the 24-hour
report [CRA Art. 14(2)(a)]. The reporting duty applies already
[CRA Art. 69(3), 71(2)].

## Safety

- Every supply of the reader is below 60 V DC: PoE, the 12 to 24 V input,
  USB. That is the ES1 limit, below which a voltage may be touched (table 4
  of EN 62368-1 in the 2018 edition) [ULQA; IEC18 contents], and both
  published test reports named below class a PoE input as ES1 [FLIR p. 8;
  AIR pp. 8, 9]. No insulation against electric shock is needed at the
  inputs. Converters inside can make more than 60 V DC (ES2 or ES3), which
  needs safeguarding; the lab classifies those points [ULQA]. The rest of
  the work is fire protection, heating, mechanics and marking.
- Limit the supplies in writing. The manual and the label must say that the
  DC input may only be connected to a supply limited to 100 W, or better to
  15 W [ULTB] (the lab knows the wording its edition of the standard wants).
  Without a stated limit the lab measures the input with a strong source. In
  the FLIR report below, such an input measured above 100 W and became PS3,
  and the case around it had to be a fire enclosure [FLIR pp. 10, 47]. The
  board has a self-resetting fuse of 1.1 A at the DC input and of 2 A at
  USB; at USB the eFuse also limits the current to 1.8 to 2.2 A (design
  values).
- Enclosure: a plastic whose data sheet states HB at least [ULQA, on
  clause 6.3.1 of the 2014 edition]. From the 2018 edition a glow-wire test
  at 550 °C is an alternative to HB [TUV item 17 (secondary)].
  Flame-retardant plastic is needed only where the lab finds a part that
  could ignite. See "Enclosure plastic" below.
- PCB: FR-4 rated V-0 with a UL mark; the standard asks for V-1 or better
  (clause 6.4.5.2; unverified: paid standard, but a published report records
  "PCB: V-0" under that clause [FLIR p. 18]). JLCPCB has UL file E479892 and
  adds its UL marking when the order asks for it [JLCPCB UL].
- A supply sold with the reader becomes part of the tested product
  (unverified: lab practice). Buy one with its own report.
- The proximity sensor (U704) sends infrared light of 940 nm from an LED,
  not from a laser. EN 60825-1 no longer covers LEDs [BSI 60825-1]: it does
  not apply and the reader needs no laser label. The LED pulses with 200 mA
  at most, for a millisecond at most and for no more than 1/40 of the time,
  inside the closed case (sensor data sheet, not checked here). Ask the lab
  whether clause 10.4 of the safety standard (optical radiation from LEDs,
  rated by the risk groups of IEC 62471) wants anything on record for it
  [IEC18 contents].
- PoE isolation is asked for by the Ethernet standard, not by the safety
  standard. IEEE 802.3 asks a powered device to isolate all its PoE leads
  from all external conductors [IEEEI]. The test is one of 1500 V RMS for
  60 s, 2250 V DC for 60 s, or ten 1500 V impulses of 10/700 µs, followed by
  an insulation resistance of at least 2 Mohm measured at 500 V DC [IEEEW
  (secondary)]. The interpretation 3-07/04 quotes the text of 802.3af-2003
  and confirms only the RMS test [IEEEI]; the current text, IEEE 802.3-2022,
  was not read. EN 62368-1 asks for separation of an Ethernet port
  only from earthed circuitry (clause 5.4.11) [ULQA; FLIR p. 15]; the reader
  has none, so the safety standard asks no isolation here. A lab testing for
  CE may not test it; customers expect it (our assessment). What the board
  does for it, and where it is weak, is in
  [design-notes.md](hardware/touch-p4/design-notes.md#poe-isolation).

### Enclosure plastic

The first version of this page asked for "UL 94 V-1 or better" for the whole
case. That is stricter than the standard for circuits up to 100 W [ULQA].
This part was worked out on 24 November 2026 from clause 6 of EN 62368-1 in
a copy of the 2014 edition, UL's published answers on the 2018 edition and
two published test reports of PoE devices. The check of 25 November 2026
could not re-read the 2014 text from a free source, so points that rest on
it alone are marked unverified. The 2018 and 2023 editions themselves were
not read, and labs report to those: the lab has the last word. Two changes
of the 2018 edition matter here: parts under 4 g or 1750 mm³ are exempt from
the rules for combustible material, and a glow-wire test at 550 °C may
replace HB [TUV items 16, 17 (secondary)].

What the case plastic must be depends on the power a circuit can get from its
supply into a fault, not on what the reader uses:

| Power a circuit can get | Class | Case plastic |
|---|---|---|
| up to 15 W, three seconds into the fault [ULTB] | PS1 | HB, the lowest flammability class, shown by the material's data sheet (clause 6.3.1) [ULQA]. The split into HB75 below 3 mm of wall and HB40 from 3 mm is unverified (read in the 2014 edition only). Nothing more: no part of such a circuit counts as able to ignite [ULQA; ULTB]. |
| up to 100 W, five seconds into the fault [ULTB] | PS2 | HB, and no fire enclosure [ULQA]. If a part of the circuit counts as a potential ignition source, plastic closer than 13 mm beside it or 50 mm above it must be V-1, or pass a flame test (annex S), or lie behind a barrier (clauses 6.4.5 and 6.4.7) [ULQA; FLIR p. 18]. That the barrier must be metal or V-1 material is unverified. |
| more, or a supply without a stated limit | PS3 | A fire enclosure around the PS3 circuit (clauses 6.4.6 and 6.4.8) [FLIR p. 18]. In a small case that is in practice the whole case, V-1 or better [ULQA] (confirm with the lab). |

A potential ignition source is

- a part that dissipates more than 15 W after 30 seconds of normal operation;
  or, under a single fault, one with more than 100 W right after the fault
  where electronic circuits, regulators or PTC devices limit the power, or
  more than 15 W 30 seconds after the fault otherwise (clause 6.2.3.2,
  wording of the 2014 test report form) [FLIR p. 48; AIR p. 52]. The board's
  inputs have PTC fuses, so the 100 W criterion can apply. The 2014 edition
  counted the power available to the part, which made nearly every part of a
  PS2 circuit one. The 2018 edition counts what the part itself dissipates
  [ULQA; TI 2018 TRF].
- a contact or joint with an open-circuit voltage of at least 50 V peak, if
  that voltage times the normal operating RMS current is more than 15
  (clause 6.2.3.1) [FLIR p. 48; AIR p. 51].

UL's answer to "could the product's polymeric enclosure be flame rated HB"
when its supply is power-limited: "If the proper PIS separation distances are
maintained, an HB rated casing may be fine. If not, a casing material with a
V-1 or V-0 rating typically would be required." [ULQA]

The reader's three inputs:

| Input | Power it can get | Class | Potential ignition source |
|---|---|---|---|
| USB-C | 15 W at most: the board asks for 5 V only, and a port gives 3 A at most; the eFuse limits the current to 2.2 A. An earlier revision credited the 2 A fuse with 12.5 W by a rule of 125 % of a fuse's rating (clause 6.2.2.2). That rule is unverified; UL describes measuring just below the trip point instead [ULTB]. | PS1 | none |
| PoE (LAN version) | More than 15 W. A lab measured 33.6 W at the port of a comparable device [FLIR p. 47]. | PS2 | The voltage is above 50 V, but volts times amps uses the current the reader takes from the port: 3 to 9 W against the threshold of 15 [FLIR p. 48; AIR p. 51] (the 3 to 9 W are design figures). Whether a fault makes the PoE module or the parts before it dissipate more than 15 W is for the lab's fault test. |
| 12 to 24 V terminal | Behind the 1.1 A fuse 26 W at 24 V at the fuse's rating, 33 W by the unverified 125 % rule. Before the fuse, what the supply gives. | PS2 with a supply limited to 100 W, PS1 with one limited to 15 W, PS3 without a limit [ULTB] | Below 50 V, so only the 15 W rule applies [FLIR p. 48]. The fault test decides. |

The reader takes about 2.5 W in normal use (estimate), at most 4.5 W (0.90 A
at 5 V: the makers' highest consumption figures, with the firmware's limit on
the LEDs) and 8.3 W if every load drew what its maker asks the supply to
deliver, all at once (1.65 A;
[design-notes.md](hardware/touch-p4/design-notes.md#power-budget)). Two published reports show
both outcomes for a PoE device:

- FLIR A50/A70 camera, PoE, 8.1 W (CTC advanced, Saarbrücken, 2021): the PoE
  port is PS2 [FLIR pp. 1, 2, 8]. One arcing check, 56 V x 0.125 A = 7.0 at
  R542, D1, Q3, Q4 and D4, found no arcing ignition source; the report does
  not name the port. The fault test found no resistive ignition source on the
  PoE side, but one on the external-supply side (R542) [FLIR p. 48]. Its case
  is metal, because that second input, an external supply of 18 to 56 V,
  measured above 100 W: PS3 [FLIR pp. 2, 10, 47].
- Airtame PoE adapter with a 5 V, 2 A output (EKTOS, Copenhagen, 2018)
  [AIR pp. 1, 2]: 57 V x 0.28 A = 15.9, and 16.5 W in three parts. The lab
  found ignition sources at the jack, the rectifiers and the protection
  diodes [AIR pp. 51, 52]. Its case is 5VB plastic and counts as fire
  enclosure [AIR p. 21].

What follows for the reader:

1. A data sheet that states the flammability class at the wall thickness is
   needed in every case, also for HB. A class on a data sheet comes from
   standard test bars and need not hold for a printed part (engineering
   judgement). Where the class matters (V-1 or V-0), a flame test on the
   printed part settles it (annex S) [ULQA].
2. The limit for the DC supply in the manual and on the label decides the
   class of that input [ULTB]. A limit of 15 W takes the input out of the
   question, and the reader does not need more.
3. Ask the lab before the test how it settles ignition sources: by measurement
   and fault test, as in the FLIR report, or by assumption. A manufacturer may
   also declare one to save the measurement (UL calls that common practice)
   [ULQA]; for this reader that would cost the HB case.
4. If the lab finds one at the PoE module or the DC input: print the case, or
   the part of it near that spot, from a filament rated V-0 at the wall
   thickness, or put a barrier between the spot and the plastic (a sheet of
   metal or V-1 material; the material rule is unverified). Distance alone
   will hardly do in a flat case: the dock plate lies 14 mm behind the board,
   and the zone reaches 50 mm upwards [ULQA].

Not done on the board: a fuse small enough to make the DC input PS1 by itself.
By the unverified 125 % rule that is 0.5 A at 24 V. The reader takes 0.45 A
at 12 V at peak, and a fuse of this kind holds two thirds of its rating in a
warm case (the 1.1 A one: 0.7 A at 60 °C; design figures). So it would do
for 24 V only. An electronic current limiter would do for both voltages;
that is a change to the board.

Filaments looked at on 24 November 2026 and checked again on 25 November:

| Filament | What its maker states |
|---|---|
| Filament Unger ABS+ | No flammability class and no RoHS or REACH statement on the material guide or the downloads page [Unger guide; Unger downloads]. Data sheets are published for PLA+, PETG and PA12 CF15, none for ABS+ [Unger downloads]. The product pages and the FAQ could not be read. Ask for the data sheet. ABS without flame retardant is usually HB (unverified: general knowledge, not from their data). |
| FormFutura ABSpro Flame Retardant | "engineered to meet the UL 94 V-0 flammability standards"; a blend of polycarbonate and ABS, RoHS and REACH stated. The sheet names no thickness for the class [FormFutura TDS]. |
| BASF Ultrafuse PC/ABS FR Black | V-0 at 1.5 mm and 3.0 mm [BASF TDS] |
| ROSA "ABS FR V0" | The sheet is headed "ABS+" and states HB at 1.5 mm and 3.0 mm [ROSA TDS]. Either the product is HB, or the maker reused the ABS+ sheet. Ask ROSA for evidence of V-0; do not rely on the product name. |

ABS suits the reader otherwise: Filament Unger gives about 95 °C for theirs
[Unger guide]. In typical use on PoE in a room of 40 °C the warmest spot
reaches about 80 °C and the Wi-Fi module 79 °C (estimate). With everything on
for a long time the LED rows would get 70 to 80 K warmer than the room; the
firmware limits the LEDs
([design-notes.md](hardware/touch-p4/design-notes.md#simulation)).

## Tests on the ports

From EN 301 489-1 V2.2.3, which was read:

| Test | Level | On this reader |
|---|---|---|
| Electrostatic discharge | 4 kV contact, 8 kV air, to all exposed surfaces [EN 301 489-1 §9.3.2] | display glass and its edges, LED windows, buzzer opening, screws, housing seams |
| Radiated immunity | 3 V/m, 80 MHz to 6 GHz [EN 301 489-1 §9.2.2] | always |
| Fast transients, RF common mode | 0.5 kV; 3 V [EN 301 489-1 §9.4.2, §9.5.2] | Ethernet port and DC input, each if its cable may be longer than 3 m [EN 301 489-1 §9.4.1, §9.5.1] |
| Surge | 0.5 kV line to ground [EN 301 489-1 §9.8.2.2] | Ethernet port with indoor cables over 30 m. With outdoor cables 1 kV with a 10/700 µs pulse [EN 301 489-1 §9.8.2.1]: exclude outdoor cabling in the manual. Where the coupling network would disturb a high-speed port, the 1.2/50 µs wave may be used instead of 10/700 µs [EN 301 489-17 table 6]. |
| Conducted emission, 150 kHz to 30 MHz | Ethernet: class B of EN 55032, table A.12 [EN 301 489-1 §8.7.3]. DC input: table 5 of EN 301 489-1, 79/66 dBµV (quasi-peak/average) up to 0.5 MHz and 73/60 dBµV above [EN 301 489-1 §8.3.3] | Ethernet port; the DC input if its cable may be longer than 3 m. With a DC cable of 3 m or less to a dedicated AC/DC supply, the supply's AC port instead, at class B [EN 301 489-1 §8.3.1, §8.4.3.2]. In transmit mode the NFC exclusion band applies [EN 301 489-1 §8.3.2]. |

EN 301 489-1 tests a port whose cable may be longer than 3 m
[EN 301 489-1 §9.4.1, §9.5.1, annex C.1]. The DC terminal takes bare wires
from an existing installation ([design-notes.md](hardware/touch-p4/design-notes.md)), which
cannot promise a shorter cable: plan for the DC port tests.

Surge on the DC input. EN 301 489-1, which the cited parts 3 and 17 apply,
asks no surge test on DC power ports [EN 301 489-1 §9.8.1]. On this reader
only the Ethernet port gets one, 0.5 kV line to ground, when its cable may be
longer than 30 m indoors [EN 301 489-1 §9.8.2.2]. The PoE supply arrives on
that port, which counts as a wired network port [EN 301 489-1 §3.1]. Access
control has an EMC product-family standard for immunity of its own,
EN 50130-4, which covers access control systems for security applications
[EVS 50130-4; iTeh 50130-4 preview §1]. It is cited under the EMC
Directive 2014/30/EU, in its base edition EN 50130-4:2011 (not with A1)
[OJ C 173 2016; EMC summary list 2022], and not under the RED [HS-RED]: for
this radio product it gives no presumption of conformity. Applying it is
voluntary, asked for by customers in access control. It asks for line-to-earth surges
through 42 ohm on extra-low-voltage DC lines as well (unverified: the free
preview shows only that clause 13, "Slow high energy voltage surge", exists
[iTeh 50130-4 preview]; confirm with the lab). The DC input is protected and
simulated for that test; the details are in
[design-notes.md](hardware/touch-p4/design-notes.md#power), "Power". Optional cost before the
lab: the standard itself, EN 50130-4:2011+A1:2014, consolidated English text,
24.80 EUR incl. tax from the Estonian standards body EVS [EVS 50130-4] (DIN
Media sells the German edition for 79.96 EUR [DIN Media 50130-4]). A new
edition, prEN 50130-4:2026, is in draft [EVS 50130-4]. IEC 61000-4-5 only
describes the surge test; product standards decide whether and at what level
it applies [IEC 61000-4-5 preview §1]. A line-to-line surge of 0.5 kV behind
2 ohm on this DC port is asked by none of the standards above, as far as
they could be read (the level and the 2 ohm of IEC 61000-4-5 are unverified:
paid standard). Meeting it would take a converter rated for 60 V and a
larger TVS (design notes, "Power").

## What the board design does

Board facts from the schematic and layout; the reasons are in
[design-notes.md](hardware/touch-p4/design-notes.md). They were not part of the source check.

| Topic | Measure on the board |
|---|---|
| Wi-Fi antenna | The module's own PCB antenna for 2.4 and 5 GHz, in the board's top left corner over a cut in the top edge, with no copper on any layer under it and 15 mm to each side; ground fill along the keep-out's edge, stitched every 2.5 mm ([design-notes.md](hardware/touch-p4/design-notes.md#wi-fi-antenna)). |
| Return paths | Six layers. Ground planes on In1 and In4 and a 3.3 V plane on In3, each in one piece and without tracks. Signals run on the two outer layers and on In2, with ground filled in between: every signal layer lies next to a plane that no track cuts. |
| Switching regulators | AP63205 at the DC input, with spread spectrum. Two TLV62569 for 3.3 V and the core, at 1.5 MHz without spread spectrum. Small loops, input and output capacitors next to the ICs. |
| DC input | Self-resetting fuse, a bidirectional TVS behind it at the connector, reverse-polarity diode, pi filter (2.2 uF, 2.2 uH, 2 x 2.2 uF; 100 V capacitors that keep 1.5 uF each at 24 V), a 47 uF electrolytic that damps the filter when a supply is plugged in live, and a TVS before the converter. The converter sits away from the NFC antenna, and the DC run does not go around the NFC loop. |
| Display bus | 33 ohm series resistors on all RGB and sync lines; reduce GPIO drive strength in firmware if needed. |
| Display edges and flex (ESD) | ESD arrays (U603, U604) on the four touch lines at the panel connector; the display's metal back tied to ground through conductive gaskets on four bare pads, and tape over the flex (installation manual). Per-port table: [design-notes.md](hardware/touch-p4/design-notes.md#esd-per-port). |
| Clocks | Series resistors on the 50 MHz RMII clock, the SDIO clock and the flash clock. |
| USB | TVS and ESD array at the connector, fuse, ferrite bead in the supply. |
| Ethernet / PoE | Isolated PD module, 48 V side in its own area with 2 mm clearance and no copper under the module's isolation barrier, ferrite beads and TVS at the PoE input, capacitor across the barrier, RC from jack shield to ground. The Ethernet pairs pass under the jack's shell on the back layer, the 48 V nets on the inner layer. |
| NFC | Low-pass (560 nH / 220 pF) between transmitter and antenna, damping resistors, no closed copper ring around the loop. |
| Supply faults | USB feeds the 5 V rail through an eFuse (soft start, current limit, cut-off above 5.53 to 5.74 V), DC and PoE through ideal diodes. All three block reverse current, so no source feeds another; bleed resistors keep unpowered inputs at 0 V. |
| LEDs | Capacitor at each LED, series resistor and pull-down in the data line. |
| Mounting | No tracks under screw heads on the outer layers. |

## Where the board may still fail in the lab

Measure these before the lab does. Most important first. This list is
engineering judgement, except where a source is cited. The simulations in
`sim/` cover none of it: they check signals, supplies, heat and the two
antennas, not emissions and not discharges.

1. **NFC harmonics on the cables.** One filter stage, unshielded coils, and
   both cables leave the housing beside the loop. Measure the harmonics with
   the cables attached. Measure with the PN532 that will be sold (the second
   source or NXP's) and keep to it.
2. **Discharges on the user's side.** The usual failures: the display or the
   touch controller loses its settings, the PN532 hangs, the MCU resets. The
   test is failed if the reader does not recover by itself
   [EN 301 489-17 §6.4, table 2; part 1's clause 6 "shall not apply",
   EN 301 489-17 §6.1], and, with the notice on clause 6 above, by the
   objective pass criteria of the test plan, among them no loss of settings
   it names as critical. In the housing: close the LED windows with
   a diffuser that overlaps the housing, cover or ground metal screws (the
   board's mounting holes are not connected to ground), and tie the
   display's metal back to ground: the board has four bare ground pads on
   the display side for conductive tape or foam. In firmware: a watchdog,
   and a periodic check that restarts display, touch and NFC.
3. **The display flex.** About twenty fast lines in an unshielded flex.
   Lowest drive strength and pixel clock that work.
4. **Common-mode noise on the cables.** The DC filter works between the two
   wires only, and the PoE input has beads but no common-mode choke. A clip-on
   ferrite on the cable is the first remedy; a choke needs a new board.
5. **Radiated power of the Wi-Fi module.** The certificate's 19.85 dBm at
   2.4 GHz is 0.15 dB below the limit, on Espressif's board, and the module
   stands in another place here (see "What the certified Wi-Fi module
   saves"). Measure the e.i.r.p. on both bands in the closed case before the
   lab does, and set the firmware's cap from it.

Useful before the lab: a line impedance network and a spectrum analyser for
the DC input, near-field probes, an ESD gun, and half a day in a pre-compliance
chamber. For the lab the firmware needs test modes: NFC carrier on
continuously, Wi-Fi and Bluetooth on a fixed channel at fixed power
(Espressif's EspRFTestTool and its test firmware, or the ESP-IDF example
`examples/phy/cert_test` built into the reader's own firmware [RFT; FAQ]),
and a worst-case mode with everything active that shows on the display
whether the reader still works.

## Open points for the product

- Enclosure material, with a data sheet that states HB at least at the wall
  thickness. Whether it has to be flame-retardant is settled by the lab's
  fault test (see "Enclosure plastic").
- The limit for the DC supply in the manual and on the label: 15 W or 100 W.
- The Wi-Fi transmit power per band, from the lab's e.i.r.p. measurement on
  the reader, as the firmware's cap (see "What the certified Wi-Fi module
  saves").
- Packaging and manual: the 5 GHz indoor restriction with the Member States'
  codes, and the frequency bands with their maximum power (see "5 GHz
  Wi-Fi").
- Supply in the box or not. If so, it is part of the tested product.
- Allowed cable lengths for the DC input and for Ethernet, and no outdoor
  cabling. They decide which port tests apply.
- Business customers only, or private buyers too. It decides the ElektroG
  registration, whether the instructions must be in German and whether the
  product safety regulation applies. The packaging duties apply in most cases
  either way (see "Which rules apply").
- One PN532 source, one PoE module, one display type. The test report covers
  what was tested.
- Type label: CE mark, model, serial number, manufacturer's name and postal
  address [RED Art. 10(6), (7), 20(1)]; crossed-out bin, the producer's
  identity and the mark for "placed on the market after 13 August 2005"
  [ElektroG §9]. CE mark on the packaging too [RED Art. 20(1)].
- In the box: a copy of the declaration of conformity, or a simplified one
  with the web address of the full text [RED Art. 10(9)].
- Technical file: schematics, layout, parts list, test reports, risk
  assessments, software bill of materials. Keep it, and the declaration of
  conformity, for ten years after the reader is placed on the market
  [RED Art. 10(4)]; under the Cyber Resilience Act for ten years or the
  support period, whichever is longer [CRA Art. 13(13)].

## Open points for revision B

- Reconfirm with VDE (notified body 0366) whether its 2020 statement on
  readers with pre-certified modules still holds.

## Test lab

Ask two or three accredited labs for a quote and name the exact configuration:
ESP32-C5-MINI-1 module with its PCB antenna, Wi-Fi on 2.4 and 5 GHz
(channels 36 to 64 and 100 to 140) and Bluetooth LE, NFC reader with PCB
antenna, Ethernet with PoE, DC
supply, both assembly versions. Where a notified body is needed (see "Will it
be easy?"), ask notified bodies for the RED, and from December 2027 for the
Cyber Resilience Act, as well: an accredited lab alone is not enough there
[RED Art. 17(4); CRA Art. 32(2)]. Testing the Ethernet version with Wi-Fi
fitted usually covers the Wi-Fi version as the simpler case; the lab decides
(unverified: lab practice; ETSI EG 203 367 allows reusing an assessment for
an equivalent combination [EG 203 367 §6.1 note 3]). Send with the request:
block diagram, list of ports with cable type and length, operating modes,
the module certificates and reports, and a list of the safety-relevant parts
(PoE module, fuses, enclosure material, PCB).

## Sources

Every source, with its version, link and the clauses relied on, and the
result of the check for each claim on this page, is in
[compliance-sources.md](hardware/touch-p4/compliance-sources.md).
