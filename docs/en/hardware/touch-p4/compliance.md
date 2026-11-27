# CE and market checklist
<!-- llms-description: What CE marking and the EU market rules ask of the Touch P4 reader: radio (2.4 and 5 GHz), EMC, safety, cybersecurity, registrations, and what is still open. -->

What the EU and German rules ask of the Touch P4 reader, what the board already does for them, and what is still open. For whoever prepares the product for sale and the test lab.

## Scope

- The CE mark applies to the finished reader (board, display, enclosure, power supply, firmware and documents), not to the PCB alone [RED Art. 2(1), 20(1)].
- A working checklist, state of November 2026. Not legal advice.
- A key in square brackets names a source and the clause relied on, for example [RED Art. 10(9)]. The keys are listed under [Sources](#sources).
- Paid standards (EN 18031, EN 55032, EN 55035, EN 50130-4, EN 50419, IEC 61000-4-5 and every edition of EN IEC 62368-1) were not read. Claims that rest on them, on lab practice or on an estimate are marked "unverified", with the reason. For EN 62368-1, UL's published answers, the free table of contents of the 2018 edition and two published test reports were used.

## Effort at a glance

Radio, EMC and safety are ordinary lab work, and the certified Wi-Fi module takes part of it away. Registrations and paperwork are small. Cybersecurity is the hard part, and it does not depend on the board.

1. **Cyber Resilience Act.** An access control reader is an "important product, class I" [CRA Art. 7(1), Annex III class I no. 1]. From 11 December 2027 the manufacturer may assess it himself only if he applies in full a harmonised standard cited under the Act (or common specifications, or an EU cybersecurity certificate at level "substantial") that covers all risks of the reader's core function [CRA Art. 32(2); CRA guidance para 149]. The standard for this class (prEN 40000-10) is a draft [DIN Media prEN 40000-10]. Without it a notified body examines the product [CRA Art. 32(2)].
2. **EN 18031 until then.** Since 1 August 2025 the reader must meet the RED's cybersecurity requirements [DR 2023/2444 Art. 1]. It can be declared without a notified body only if EN 18031-1 and -2 are applied in full, and their default-password clauses never let the user skip setting and using a password [RED Art. 17(3), (4); HS-RED no. 164, 165]. Otherwise a notified body is needed now.
3. **First lab visit.** The NFC transmitter, the two cable ports and discharges onto a glass display are where a first run usually fails (unverified: experience, no source). Measuring beforehand decides whether the lab is visited once or three times.
4. **What exactly is sold.** Enclosure material, supply in the box or not, allowed cable lengths, business or private buyers, and the number of versions each add or remove tests and duties.

## Which rules apply

| Rule | Applies | What the manufacturer has to do |
|---|---|---|
| Radio Equipment Directive 2014/53/EU (RED) | yes | Radios: Wi-Fi 2.4 and 5 GHz, Bluetooth, NFC at 13.56 MHz [RED Art. 2(1)]. Assess safety, EMC, radio and cybersecurity [RED Art. 3]. Keep technical file and declaration of conformity for ten years after placing on the market [RED Art. 10(4)]. One EU declaration of conformity [RED Art. 18(3)]; each unit ships with a copy, or a simplified declaration with the web address of the full text [RED Art. 10(9); FuAG §20(2)]. CE mark on device and packaging [RED Art. 20(1)]; name, postal address, type and serial number on the device [RED Art. 10(6), (7)]. Instructions and safety information with frequency bands and maximum transmitted power [RED Art. 10(8); FuAG §20(3)]; for 5 GHz the indoor restriction on packaging and in the instructions [RED Art. 10(10)]. German if sold for non-commercial users; for business-only sales clear, understandable text [FuAG §20(1)]. German is advisable in any case. |
| Low Voltage and EMC Directives | not separately | The RED covers both for radio equipment [RED Art. 1(4), 3(1), 50; EMCD Art. 2(2)(a)]. Safety applies "with no voltage limit applying" [RED Art. 3(1)(a)], so the 12 to 24 V and PoE reader, below the LVD's range, still has to be safe. The declaration names the RED. |
| RED cybersecurity, Delegated Regulation (EU) 2022/30 | yes, until 10 December 2027 | Applies since 1 August 2025 [DR 2023/2444 Art. 1]: network protection, because the reader can communicate over the internet directly or through other equipment [DR 2022/30 Art. 1(1)]; protection of personal data, because it processes card numbers linked to names [DR 2022/30 Art. 1(2)]. Repealed from 11 December 2027 by DR 2026/339 [DR 2026/339 Art. 1, recital 4]. Readers placed on the market before then stay under RED market surveillance for these requirements [DR 2026/339 recital 5]. |
| Cyber Resilience Act (EU) 2024/2847 | yes | Since 11 September 2026: report exploited vulnerabilities and severe incidents: early warning within 24 h, notification within 72 h, final report later [CRA Art. 14(2), (4), 71(2)]. Covers readers sold today [CRA Art. 69(3)]. From 11 December 2027: full conformity for every unit placed on the market [CRA Art. 69(2), 71(2)], with a support period matching the expected use time, at least five years, end date stated at purchase [CRA Art. 13(8), (19)]. See [Cybersecurity](#cybersecurity). |
| RoHS 2011/65/EU | yes | Keep supplier declarations for all parts and the PCB in the technical file (the usual evidence; the Directive asks for technical documentation and internal production control) [RoHS Art. 7(b), (d)]. Named on the declaration of conformity [RoHS Annex VI; RED Art. 18(3)]. |
| REACH Article 33; SCIP database | yes | Tell customers when a part contains a Candidate List substance above 0.1 %, consumers on request within 45 days [REACH Art. 33(1), (2)]. Notify the same to ECHA's SCIP database (Waste Framework Directive; in Germany the Chemicals Act) [WFD Art. 9(1)(i); ChemG §16f]. Lead in components is the usual case, on the Candidate List since June 2018 [Sagentia (secondary)]. |
| WEEE / ElektroG | yes | Register brand and device type with stiftung ear before the first sale [ElektroG §6(1)]: usually two to four weeks [ear reg], about 130 EUR a year plus VAT, 32.80 EUR a quarter [GebV no. 1.2; ear fees]. Household device: yearly insolvency-proof guarantee. Business device: credible showing of use only or usually outside private households, take-back concept and offer, written disposal information with each delivery [ElektroG §7(1), (3), §7a, §19, §19a]. A device private buyers can also use counts as household [ElektroG §3 no. 5]; a wall reader sold only to workshops can be a business device if credibly shown [ElektroG §7(3)]. On the device, permanently: crossed-out bin, producer identity, mark for "placed on the market after 13 August 2005" [ElektroG §9(1), (2), §3 no. 4]; the usual mark is a bar under the bin (unverified: EN 50419, paid). Registration number on offers and invoices [ElektroG §6(3)]. Direct sales to end users in another EU country need a registration there through an authorised representative; where a local importer or distributor places the reader on that market, that company registers [WEEE Art. 3(1)(f), 16(1), 17(2); ElektroG §8(5)]. |
| Packaging: Regulation (EU) 2025/40 (PPWR) and VerpackDG | yes | Register in LUCID before the first supply [VerpackDG §6(1), (6); ZSVR]. System participation for packaging that typically ends up in private households or comparable sources; workshops and offices with household-type bins count, so business-only sales do not remove the duty by themselves [VerpackDG §3(6), (7), §7]. Report material and mass [VerpackDG §9(1)]. Whoever has packaging or a packaged product made under his own name is the packaging's manufacturer under the PPWR, with conformity assessment, technical documentation and EU declaration for the packaging [PPWR Art. 3, 15(2)]; exception: a micro-enterprise whose packaging supplier is in the same country [PPWR Art. 3]. Packaging outside system participation (e.g. shipping cartons to business customers) is taken back free of charge [VerpackDG §39(1)]; from 2028 that needs a ZSVR approval [ZSVR]. PPWR and VerpackDG replaced the Verpackungsgesetz on 12 August 2026 [PPWR Art. 71; ZSVR; VerpackDG]. |
| Batteries Regulation (EU) 2023/1542 | no | No battery on the board. Applies as soon as one is added [Batteries Reg Art. 1(3)]. |
| General Product Safety Regulation (EU) 2023/988 | if consumers buy it or are likely to use it | Counts if consumers are likely to use it, even if not meant for them [GPSR Art. 3(1), recital 17]; members badging in at a club or makerspace may count. Under EU harmonisation law (the RED) what remains are distance sales, accident reports and recalls [GPSR Art. 2(1), 19, 20, 36, 37]. |
| Data Act (EU) 2023/2854 | in scope, main duties exempt | A "connected product" [Data Act Art. 2(5)]. Data access duties do not apply to a micro or small enterprise (Recommendation 2003/361/EC) without a larger partner or linked enterprise that does not build the product as a subcontractor; a firm that becomes medium-sized keeps the exemption for one year [Data Act Art. 7(1)]. Check again when the company grows. |
| USB-C common charger rule | no | Covers only listed categories of rechargeable devices [RED Annex Ia Part I]. |
| Funkanlagengesetz | yes | The German form of the RED; the Bundesnetzagentur supervises [FuAG footnote, §23(1)]. |
| Product liability | yes | The new directive applies to products placed on the market after 9 December 2026 [PLD Art. 2(1)], through national law (German transposition not checked). Software is a product; defects are judged against safety-relevant cybersecurity requirements; the manufacturer stays liable for missing safety updates while within his control [PLD Art. 4(1), 7(2)(f), 11(2)]. Insure accordingly. |

## Standards a lab applies

- "Cited" means listed in the Official Journal. A cited standard gives a presumption of conformity with the requirements it covers, within the limits of any notice printed with it [RED Art. 16]. It is not proof.
- Radio and cybersecurity: only cited standards applied in full allow a declaration without a notified body [RED Art. 17(3), (4)]. Safety and EMC: the manufacturer may always declare himself [RED Art. 17(2)].

| Aspect | Standard | State, November 2026 |
|---|---|---|
| Radio, 2.4 GHz | EN 300 328 V2.2.2 | cited [HS-RED no. 16] |
| Radio, 5 GHz | EN 301 893 V2.2.1 | cited since 15 May 2025; V2.1.1 until 15 May 2028 [HS-RED no. 65, 65a; HS-RED 2025/893 Art. 2] |
| Radio, 13.56 MHz | EN 300 330 V2.1.1 | cited [HS-RED no. 17] |
| EMC | EN 301 489-1 V2.2.3, -3 V2.3.2 (NFC), -17 V3.3.1 (Wi-Fi, Bluetooth) | Parts 3 and 17 cited, each with two notices: no presumption for emissions below 9 kHz, and none "if its clause 6 is applied" (clause 6 holds the performance criteria) [HS-RED no. 168, 169; EN 301 489-17 §6]. Part 1 is not cited; parts 3 and 17 apply it [EN 301 489-3 §2.1; EN 301 489-17 §2.1]. |
| EMC, Ethernet port | EN 55032 (emission), EN 55035 (immunity) | EN 55035:2017 cited under the RED [HS-RED no. 5]; EN 55032 only under the EMC Directive [HS-EMC] |
| Safety | EN IEC 62368-1:2020 + A11, or the 2024 edition | not cited under the RED [HS-RED]; under the LVD only the 2014 edition [HS-LVD]. Ask the lab which edition it reports to. |
| RF exposure | EN IEC 62311 with EN 50665; EN 50364 for NFC | not cited under the RED [HS-RED] |
| Cybersecurity | EN 18031-1 (network), EN 18031-2 (personal data) | cited with notices [HS-RED no. 164, 165; ID 2025/138], see [Cybersecurity](#cybersecurity) |

**EMC without presumption.** Tested with their own performance criteria, parts 3 and 17 give **no presumption of conformity for RED Art. 3(1)(b)**; the Commission found these criteria "lay down performance-based criteria on a subjective basis" [HS-RED 2025/893 recital]. The manufacturer then assesses EMC himself [RED Art. 17(2), Annex II], so the test plan and the technical file define objective pass criteria, for example: Wi-Fi packet error rate 10 % at most, NFC reads succeed, display and touch recover without a reset.

### NFC limits

| Item | Limit | Note |
|---|---|---|
| Carrier, RFID and NFC | 60 dBµA/m at 10 m, under a spectrum mask [EN 300 330 §4.3.4 table 2, notes 2, 3] | A loop of this size stays about 50 dB below it (unverified: our estimate). |
| Harmonics in 47 to 74, 87.5 to 118, 174 to 230 and 470 to 790 MHz | 4 nW e.r.p. [EN 300 330 §4.3.9.3 table 6, §6.2.9] | Catches 54, 68, 95, 108, 176 to 217 and 475 to 786 MHz. The PN532 drives the antenna with a square wave (PN532 datasheet, not checked here). |
| Other harmonics, 30 MHz to 1 GHz | 250 nW [EN 300 330 §4.3.9.3 table 6] | |
| Second harmonic, 27.12 MHz | below -3.5 dBµA/m at 10 m [EN 300 330 §4.3.8.3 table 5] | |

The small loop hardly radiates the harmonics; the DC and Ethernet cables next to it do (engineering judgement). In the radio test the lab keeps power leads out of the measurement, by routing them away or loading them with ferrite beads [EN 300 330 §5.4.1, annex C.2.3]. Run your own pre-test both with and without such loading.

## What the certified Wi-Fi module saves

The ESP32-C5-MINI-1 has its own PCB antenna for 2.4 and 5 GHz [DS-C5 §1].

| Item | Value |
|---|---|
| Certificate | EU-type examination certificate 44024-05-2026-260268 of 27 May 2026, Eurofins Electrical and Electronic Testing NA, notified body 0980, for the model with internal antenna [CE-C5 pp. 1, 2] |
| Covers | safety (EN IEC 62368-1:2024 + A11), health (EN 50665, EN IEC 62311), EMC (EN 55032, EN 301 489-1 V2.2.3, EN 301 489-17 V3.3.1), radio (EN 300 328 V2.2.2, EN 301 893 V2.2.1) [CE-C5 pp. 2, 3] |
| Does not cover | cybersecurity [CE-C5 pp. 2, 3] |
| EMC | assessed on the module alone: "Some data can be reused, but EMC testing is still required for the final product" [FAQ] |
| Test reports | Espressif publishes the certificate only. Ask for EFTA26010030-IE-01-E1, -02-R1 to -R4, -03-M1V1 and -04-L1 (Eurofins TA Technology (Shanghai)) before asking labs for quotes [CE-C5 pp. 2, 3; FAQ] |
| Listed transmit power | Wi-Fi 2.4 GHz 19.85 dBm; Bluetooth LE 16.36 dBm; 5150 to 5250, 5250 to 5350 and 5470 to 5725 MHz 20.58, 20.74 and 20.77 dBm; 5725 to 5850 MHz 13.97 dBm. Conducted or radiated is not stated [CE-C5 p. 2] |
| Antenna gain on Espressif's test board | peak 4.44 dBi at 2.4 GHz, 1.55 to 2.18 dBi at 5 GHz [ANT-C5 §3.1] |

**Reuse of the module's radio assessment.** ETSI EG 203 367 is a guide, not a harmonised standard. It lets the module's assessment be reused if the module sits in equivalent conditions and follows its installation instructions. A different host or an antenna outside the module's assessment is a deviation: the reader is then re-assessed against the radio standard, which need not mean testing [EG 203 367 §3.1, §6.1 notes 1, 2]. Labs typically reuse antenna-independent results such as conducted measurements (unverified: lab practice).

The antenna here is the module's own, but the module sits in the board's top left corner with its antenna over a cut in the top edge, not at the edge's middle as Espressif's design guide puts it (see [Known limitations](hardware/touch-p4/limitations.md)). In the full-wave model that place is within 3 dB of Espressif's position in every channel and radiates up to 5.5 dB more in some 5 GHz channels. Whether that is still "equivalent" is the lab's call. Plan for these measurements on the reader:

- radiated power (e.i.r.p.) and spurious emissions on both bands, with NFC transmitting at the same time [EG 203 367 §6.1 note 1, §6.2; EN 300 328 §4.3.2.2.3; EN 301 893 §4.2.3];
- EMC with all radios running [EG 203 367 §5.1.1.3, §5.2.3];
- RF exposure (RED Art. 3(1)(a), outside the guide's scope [EG 203 367 §1]). The FCC grant asks for 20 cm between antenna and persons [FCC-C5]; the EU certificate names EN 50665 and EN IEC 62311 but no distance [CE-C5 p. 2], so ask for the health report (EFTA26010030-IE-03-M1V1) too. A reader that is touched does not keep 20 cm and needs its own assessment; a calculation is usually enough (unverified: lab practice).

Points to watch:

- **VDE.** One German notified body (VDE, 0366) wants an EU-type examination whenever only module reports exist ("RED Information Radio Modules", 24 November 2020) [VDE RED modules p. 2]. Ask each lab how it sees this before it quotes; reconfirm with VDE that the 2020 statement still holds.
- **Transmit power.** The limits are e.i.r.p.: 20 dBm at 2.4 GHz [EN 300 328 §4.3.2.2.3], 5 GHz see [5 GHz Wi-Fi](#_5-ghz-wi-fi). Where the reader's antenna has more gain than Espressif's, the power comes down by the difference. So the maximum transmit power is a firmware setting, capped by what the lab measures on the reader ([firmware-port.md](hardware/touch-p4/firmware-port.md), transmit power rule).
- **One radio configuration.** The antenna is part of the module: no antenna choice, no antenna connector. Keep metal away from the top left corner; in the model a metal wall behind the reader costs 1.1 to 1.7 dB at 2.4 GHz ([design-notes.md](hardware/touch-p4/design-notes.md#antenna)).
- **US version (later).** The FCC grant is a single modular approval, with 20 cm to persons and co-located transmitters evaluated by the FCC's procedures [FCC-C5]. This page covers the EU only.

## 5 GHz Wi-Fi

The EU harmonises 5150 to 5350 and 5470 to 5725 MHz for Wi-Fi by Implementing Decision (EU) 2022/179, annex replaced by (EU) 2022/2307; it repealed Decision 2005/513/EC [WAS Art. 1, 5; WAS-A Art. 1(2)]. EN 301 893 V2.2.1 gives a presumption since 15 May 2025 [HS-RED no. 65a; HS-RED 2025/893], V2.1.1 until 15 May 2028 [HS-RED 2025/893 Art. 2]. The module's certificate names V2.2.1 [CE-C5 p. 3].

| Band (channels) | Use allowed | Mean e.i.r.p. | On this reader |
|---|---|---|---|
| 5150 to 5250 MHz (36 to 48) | indoors, including road vehicles, trains and aircraft; limited outdoor use, not "attached to a fixed outdoor antenna, fixed infrastructure or to the external body of road vehicles" [WAS Annex table 1, note 1] | 200 mW (23 dBm), 10 mW/MHz [WAS Annex table 1] | used |
| 5250 to 5350 MHz (52 to 64) | "Indoor use: inside buildings only" [WAS Annex table 2] | 200 mW with transmit power control (TPC), otherwise 100 mW (20 dBm); DFS [WAS Annex table 2] | used, as a station led by the access point's DFS |
| 5470 to 5725 MHz (100 to 140) | indoors and outdoors [WAS Annex table 3] | 1 W with TPC, otherwise 500 mW; DFS [WAS Annex table 3]. A secondary device without radar detection keeps to the limits of 5250 to 5350 MHz [EN 301 893 §4.2.3.2.2 table 2, note 1] | used, the same way |
| 5725 to 5875 MHz (149 to 165) | not in the Wi-Fi decision; non-specific short-range devices [SRD Annex band 61] | 25 mW | not used |

What it means for the reader:

- **Station only, no radar detection of its own.** The access point is the primary device, the reader a secondary device [EN 301 893 §3.1]. "A secondary device shall not transmit before receiving an appropriate enabling signal from the primary device" [EN 301 893 §4.2.6.1.4.2 a)]; without radar detection it needs only channel shutdown on the access point's order [EN 301 893 §4.2.6.2.1 table 5]. Up to 23 dBm e.i.r.p. a secondary device need not detect radar itself, unless used in a fixed outdoor point-to-point or point-to-multipoint link [EN 301 893 annex D, table D.2 note 2].
- **The C5's limits.** It "only supports passive radar detection", "cannot operate as a DFS AP in SoftAP mode", and "In SoftAP mode, ESP32-C5 is not allowed to operate on DFS channels"; in station plus SoftAP mode its access point follows the station onto a DFS channel [IDF-WIFI, DFS]. Firmware: a provisioning access point only on 2.4 GHz or channels 36 to 48, and off while the station uses a DFS channel ([firmware-port.md](hardware/touch-p4/firmware-port.md), provisioning access point rule).
- **Power.** Without TPC: 20 dBm e.i.r.p. from 5250 to 5725 MHz, 23 dBm from 5150 to 5250 MHz [EN 301 893 §4.2.3.2.2 table 2]. The certificate's 20.74 and 20.77 dBm lie above 20 dBm; keep the reader at 20 dBm e.i.r.p. there unless the lab confirms that the firmware does TPC.
- **No country or band setting for the user.** "DFS settings shall not be accessible to the user", including "not allowing the user to change the country of operation and/or the operating frequency band if that results in the equipment no longer being compliant" [WAS Annex tables 2, 3]. ESP-IDF starts in world mode ("01") with an automatic policy that takes the access point's country; under `WIFI_COUNTRY_POLICY_MANUAL` "the configured country info is used always", and only then does the 5 GHz channel mask (`wifi_5g_channel_mask`) take effect [IDF-API, `esp_wifi_set_country`, `wifi_country_t`]. Firmware: manual policy, EU rules, channels 36 to 64 and 100 to 140 only, fixed at build time ([firmware-port.md](hardware/touch-p4/firmware-port.md), Wi-Fi country rule). Espressif's own table for Germany would allow channels 149 to 165 at 25 mW and still cites the repealed 2005/513/EC [IDF-REG]; the channel mask keeps them off.
- **Indoor use on packaging and in the manual.** Channels 36 to 64 are indoor-only in every Member State, a restriction on putting into service. The packaging shows either the pictogram of Implementing Regulation (EU) 2017/1354 (an exclamation mark on a book, with the Member States' codes below or next to it), or the words "Restrictions or Requirements in" followed by those codes [RED Art. 10(10); IR 2017/1354 Art. 2(1), Annex I, II]. The instructions list the Member States and the restriction, "5150 to 5350 MHz: indoor use only", in all of them [IR 2017/1354 Art. 2(2)], and name the bands and the maximum power in each [RED Art. 10(8)]: 2400 to 2483.5 MHz, 5150 to 5350 MHz and 5470 to 5725 MHz, with the e.i.r.p. the lab measured. The reader is an indoor device anyway ([spec.md](hardware/touch-p4/spec.md)); its case is not made for outdoors ([case](hardware/touch-p4/case.md)).

## Cybersecurity

### Now, under the RED

- The reader must meet RED Art. 3(3)(d) and (e): it can communicate over the internet and processes personal data [DR 2022/30 Art. 1(1), (2)]. Point (f), money transfer, does not apply [DR 2022/30 Art. 1(3)].
- A declaration without a notified body needs EN 18031-1 and -2 applied in full [RED Art. 17(3), (4)].
- The standards are cited with notices: no presumption if, under their default-password clauses (6.2.5.1 and 6.2.5.2), the user may skip setting and using a password. Their "rationale" and "guidance" sections never count [HS-RED no. 164, 165; ID 2025/138 recital 6].
- So: every access to settings, pairing and the service interface is authenticated, with credentials unique per device or set at first use and not skippable. Every requirement of both parts is documented with the standard's decision trees. (Unverified: EN 18031 was not read; confirm with the lab.)
- The ESP32-C5's firmware is part of the product (our reading: the RED counts software as a component [RED Art. 10(8)]).

### From 11 December 2027, under the Cyber Resilience Act

- **Class I.** Annex III lists "identity management systems and privileged access management software and hardware, including authentication and access control readers, including biometric readers" [CRA Annex III class I no. 1]. IR 2025/2392 includes "access management systems that control access ... to digital resources or physical locations" [IR 2025/2392 Annex I class I no. 1].
- **Self-assessment** only where cited harmonised standards (or common specifications, or an EU certificate at level "substantial") exist, are applied in full and cover all risks of the core function [CRA Art. 32(2); CRA guidance para 149]. Otherwise a notified body examines it.
- **EN 18031 does not carry over.** It is cited under the RED only and gives no presumption under the Act [CRA Art. 27(1)]. What carries over is a notified body's RED cybersecurity certificate, for the risks it covers and not beyond 11 June 2028 [CRA Art. 69(1); CRA guidance paras 251 to 254].
- **The standard.** prEN 40000-10, by CEN/TC 224, was out for comment from late May to 13 August 2026 [DIN Media prEN 40000-10; Genorma (secondary)]. The Commission's deadline for CEN to adopt it is 31 January 2027 [C(2026) 7861 annex, line 16]; citation in the Official Journal follows later. No standard has been cited for the Act yet [CRA std page]. Whether this one is cited before December 2027 is open: plan for both outcomes and look again in the first half of 2027.
- **Open source helps less than it seems.** Products "qualifying as free and open-source software" in Annex III may self-assess if their technical documentation is public at placing on the market [CRA Art. 32(5); CRA guidance para 137]. The definition covers software [CRA Art. 3(48)]; whether a hardware reader with open firmware qualifies is not settled, and the Commission's guidance treats hardware and firmware as one product [CRA guidance para 25]. Ask the BSI, the intended German market surveillance authority [BT-Drs 21/6134 Art. 1, §65(1) BSIG]; the Bundestag adopted that law on 15 October 2026, promulgation not yet found [BR-Drs 621/26]. Publishing the documentation costs this project nothing anyway.
- **No exemption for small companies.** They get lower notified-body fees [CRA Art. 32(6)], a simplified documentation form not yet published [CRA Art. 33(5); MSME page], and no fine for missing the 24-hour early warning; the 72-hour notification still applies [CRA Art. 64(10)(a)].

### What it needs in substance

| Required by the Act | Source |
|---|---|
| Written risk assessment, kept up to date | [CRA Art. 13(2), (3)] |
| Software bill of materials | [CRA Annex I Part II (1)] |
| Support period reflecting expected use time, at least five years | [CRA Art. 13(8), (19)] |
| Contact address for vulnerability reports | [CRA Annex I Part II (6), Art. 13(17)] |
| Coordinated vulnerability disclosure policy | [CRA Annex I Part II (5)] |
| Security updates free of charge | [CRA Annex I Part II (8)] |
| Updates installed automatically by default, easy opt-out where applicable | [CRA Annex I Part I (2)(c)] |
| Each update available for ten years or the rest of the support period | [CRA Art. 13(9)] |
| Published information on fixed vulnerabilities | [CRA Annex I Part II (4)] |
| User information of Annex II | [CRA Art. 13(18)] |
| Technical file and declaration kept ten years or the support period, whichever is longer | [CRA Art. 13(13)] |
| Reporting duty (applies already) | [CRA Art. 69(3), 71(2)] |

The project's chosen means, which the Act does not name:

- secure boot and flash encryption on the ESP32-P4 [CRA Annex I Part I (2)(e), (f)]; see [firmware-port.md](hardware/touch-p4/firmware-port.md) for an erratum that matters here;
- signed firmware updates for both processors [CRA Annex I Part II (7)];
- no default credentials [CRA Annex I Part I (2)(b), (d)];
- a written procedure for the 24-hour report [CRA Art. 14(2)(a)].

## Safety

- **No shock protection at the inputs.** Every supply (PoE, 12 to 24 V, USB) is below 60 V DC, the ES1 limit (table 4 of EN 62368-1:2018) [ULQA; IEC18 contents]; both published reports below class a PoE input as ES1 [FLIR p. 8; AIR pp. 8, 9]. Converters inside may make more than 60 V DC (ES2 or ES3), which needs safeguarding; the lab classifies those points [ULQA]. The rest is fire, heating, mechanics and marking.
- **Limit the supplies in writing.** Manual and label say the DC input may only be connected to a supply limited to 100 W, or better 15 W [ULTB] (the lab knows the wording its edition wants). Without a stated limit the lab measures with a strong source; in the FLIR report such an input measured above 100 W, became PS3, and the case had to be a fire enclosure [FLIR pp. 10, 47]. The board has a self-resetting fuse of 1.1 A at the DC input and 2 A at USB; at USB the eFuse also limits the current to 1.8 to 2.2 A (design values).
- **Enclosure.** A plastic whose data sheet states HB at least [ULQA, on clause 6.3.1 of the 2014 edition]; from the 2018 edition a glow-wire test at 550 °C is an alternative [TUV item 17 (secondary)]. Flame-retardant plastic only where the lab finds a part that could ignite; see [Enclosure plastic](#enclosure-plastic).
- **PCB.** FR-4 rated V-0 with a UL mark. The standard asks for V-1 or better (clause 6.4.5.2; unverified: paid standard, but a published report records "PCB: V-0" under that clause [FLIR p. 18]). JLCPCB has UL file E479892 and adds its UL marking when the order asks for it [JLCPCB UL].
- **Supply in the box** becomes part of the tested product (unverified: lab practice). Buy one with its own report.
- **Proximity sensor (U704).** Infrared 940 nm from an LED, not a laser. EN 60825-1 no longer covers LEDs [BSI 60825-1]: no laser label. The LED pulses with 200 mA at most, for 1 ms at most and no more than 1/40 of the time, inside the closed case (sensor datasheet, not checked here). Ask the lab whether clause 10.4 (optical radiation from LEDs, IEC 62471 risk groups) wants anything on record [IEC18 contents].
- **PoE isolation** is asked by the Ethernet standard, not the safety standard. IEEE 802.3 asks a powered device to isolate all PoE leads from all external conductors [IEEEI]. Test: 1500 V RMS for 60 s, 2250 V DC for 60 s, or ten 1500 V impulses of 10/700 µs, then insulation resistance of at least 2 Mohm at 500 V DC [IEEEW (secondary)]. Interpretation 3-07/04 quotes 802.3af-2003 and confirms only the RMS test [IEEEI]; IEEE 802.3-2022 was not read. EN 62368-1 asks separation of an Ethernet port only from earthed circuitry (clause 5.4.11) [ULQA; FLIR p. 15]; the reader has none, so the safety standard asks no isolation here. A CE lab may not test it; customers expect it (our assessment). What the board does for it, and where it is weak: [design-notes.md](hardware/touch-p4/design-notes.md#poe-isolation).

### Enclosure plastic

Basis: clause 6 of EN 62368-1 in the 2014 edition, UL's published answers on the 2018 edition, and two published test reports of PoE devices. Points resting on the 2014 text alone are marked unverified. The 2018 and 2023 editions were not read, and labs report to those: the lab has the last word. Two changes of the 2018 edition matter: parts under 4 g or 1750 mm³ are exempt from the rules for combustible material, and a glow-wire test at 550 °C may replace HB [TUV items 16, 17 (secondary)]. V-1 for the whole case is stricter than the standard asks for circuits up to 100 W [ULQA].

The case plastic depends on the power a circuit can get from its supply into a fault, not on what the reader uses:

| Power a circuit can get | Class | Case plastic |
|---|---|---|
| up to 15 W, 3 s into the fault [ULTB] | PS1 | HB, shown by the data sheet (clause 6.3.1) [ULQA]. HB75 below 3 mm of wall and HB40 from 3 mm is unverified (2014 edition only). No part of such a circuit counts as able to ignite [ULQA; ULTB]. |
| up to 100 W, 5 s into the fault [ULTB] | PS2 | HB, no fire enclosure [ULQA]. Plastic closer than 13 mm beside or 50 mm above a potential ignition source must be V-1, pass a flame test (annex S), or lie behind a barrier (clauses 6.4.5, 6.4.7) [ULQA; FLIR p. 18]. That the barrier must be metal or V-1 is unverified. |
| more, or a supply without a stated limit | PS3 | Fire enclosure around the PS3 circuit (clauses 6.4.6, 6.4.8) [FLIR p. 18]; in a small case in practice the whole case, V-1 or better [ULQA] (confirm with the lab). |

A potential ignition source is:

- a part that dissipates more than 15 W after 30 s of normal operation; or, under a single fault, more than 100 W right after the fault where electronic circuits, regulators or PTC devices limit the power, otherwise more than 15 W 30 s after the fault (clause 6.2.3.2, wording of the 2014 test report form) [FLIR p. 48; AIR p. 52]. The board's inputs have PTC fuses, so the 100 W criterion can apply. The 2014 edition counted the power available to the part; the 2018 edition counts what the part itself dissipates [ULQA; TI 2018 TRF];
- a contact or joint with at least 50 V peak open-circuit, if that voltage times the normal operating RMS current exceeds 15 (clause 6.2.3.1) [FLIR p. 48; AIR p. 51].

UL, asked whether a power-limited product's enclosure could be HB: "If the proper PIS separation distances are maintained, an HB rated casing may be fine. If not, a casing material with a V-1 or V-0 rating typically would be required." [ULQA]

| Input | Power it can get | Class | Potential ignition source |
|---|---|---|---|
| USB-C | 15 W at most: the board asks for 5 V only, a port gives 3 A at most, the eFuse limits to 2.2 A. A 125 % rule on fuse ratings (clause 6.2.2.2) would give the 2 A fuse 12.5 W; that rule is unverified, and UL describes measuring just below the trip point instead [ULTB]. | PS1 | none |
| PoE (lan version) | More than 15 W; a lab measured 33.6 W at the port of a comparable device [FLIR p. 47]. | PS2 | Above 50 V, but volts times amps uses the current the reader takes: 3 to 9 W (design figures) against 15 [FLIR p. 48; AIR p. 51]. Whether a fault makes the PoE module or parts before it dissipate more than 15 W is for the lab's fault test. |
| 12 to 24 V terminal | Behind the 1.1 A fuse 26 W at 24 V at the fuse's rating, 33 W by the unverified 125 % rule; before the fuse, what the supply gives. | PS2 with a supply limited to 100 W, PS1 with 15 W, PS3 without a limit [ULTB] | Below 50 V, so only the 15 W rule applies [FLIR p. 48]. The fault test decides. |

The reader takes about 2.5 W in normal use (estimate), at most 4.5 W (0.90 A at 5 V, makers' highest figures, with the firmware's LED limit), and 8.3 W (1.65 A) if every load drew what its maker asks the supply to deliver, all at once ([design-notes.md](hardware/touch-p4/design-notes.md#power-budget)).

Two published reports of PoE devices show both outcomes:

| Device | PoE side | Case |
|---|---|---|
| FLIR A50/A70 camera, 8.1 W (CTC advanced, 2021) [FLIR pp. 1, 2, 8] | PS2. Arcing check 56 V x 0.125 A = 7.0 (port not named): no arcing ignition source. Fault test: no resistive ignition source on the PoE side, one on the external-supply side (R542) [FLIR p. 48]. | metal, because the second input (18 to 56 V external supply) measured above 100 W: PS3 [FLIR pp. 2, 10, 47] |
| Airtame PoE adapter, 5 V 2 A output (EKTOS, 2018) [AIR pp. 1, 2] | 57 V x 0.28 A = 15.9, and 16.5 W in three parts: ignition sources at the jack, rectifiers and protection diodes [AIR pp. 51, 52] | 5VB plastic, counted as fire enclosure [AIR p. 21] |

What follows for the reader:

1. A data sheet stating the flammability class at the wall thickness, in every case, also for HB. A class on a data sheet comes from standard test bars and need not hold for a printed part (engineering judgement). Where V-1 or V-0 matters, a flame test on the printed part settles it (annex S) [ULQA].
2. The DC supply limit in manual and label decides that input's class [ULTB]. 15 W takes the input out of the question, and the reader does not need more.
3. Ask the lab how it settles ignition sources: by measurement and fault test (as in the FLIR report) or by assumption. A manufacturer may declare one to save the measurement (UL calls that common practice) [ULQA]; here that would cost the HB case.
4. If the lab finds one at the PoE module or the DC input: print the case, or the part near that spot, from a filament rated V-0 at the wall thickness, or put a barrier (metal or V-1; material rule unverified) between spot and plastic. Distance alone will hardly do: the dock plate lies 14 mm behind the board, and the zone reaches 50 mm upwards [ULQA].

Not done on the board: a fuse small enough to make the DC input PS1 by itself. By the unverified 125 % rule that is 0.5 A at 24 V. The reader takes 0.45 A at 12 V at peak, and such a fuse holds two thirds of its rating in a warm case (the 1.1 A one: 0.7 A at 60 °C; design figures), so it would do for 24 V only. An electronic current limiter would do for both voltages; that is a board change.

| Filament | What its maker states |
|---|---|
| Filament Unger ABS+ | No flammability class and no RoHS or REACH statement in the material guide or downloads [Unger guide; Unger downloads]; data sheets exist for PLA+, PETG and PA12 CF15, not ABS+ [Unger downloads]. Ask for the data sheet. ABS without flame retardant is usually HB (unverified: general knowledge). |
| FormFutura ABSpro Flame Retardant | "engineered to meet the UL 94 V-0 flammability standards"; PC/ABS blend; RoHS and REACH stated; no thickness for the class [FormFutura TDS] |
| BASF Ultrafuse PC/ABS FR Black | V-0 at 1.5 mm and 3.0 mm [BASF TDS] |
| ROSA "ABS FR V0" | Sheet headed "ABS+", states HB at 1.5 and 3.0 mm [ROSA TDS]. Ask ROSA for evidence of V-0; do not rely on the product name. |

ABS suits the reader otherwise: Filament Unger gives about 95 °C for theirs [Unger guide]. In typical use on PoE in a room of 40 °C the warmest spot reaches about 80 °C and the Wi-Fi module 79 °C (estimate). With everything on for a long time the LED ring would get 55 to 68 K warmer than the room; the firmware limits the LEDs ([simulations](hardware/touch-p4/simulations.md)).

## Tests on the ports

From EN 301 489-1 V2.2.3:

| Test | Level | On this reader |
|---|---|---|
| Electrostatic discharge | 4 kV contact, 8 kV air, all exposed surfaces [EN 301 489-1 §9.3.2] | display glass and edges, tap tile and its seam, buzzer opening, screws, housing seams |
| Radiated immunity | 3 V/m, 80 MHz to 6 GHz [EN 301 489-1 §9.2.2] | always |
| Fast transients; RF common mode | 0.5 kV; 3 V [EN 301 489-1 §9.4.2, §9.5.2] | Ethernet port and DC input, each if its cable may be longer than 3 m [EN 301 489-1 §9.4.1, §9.5.1] |
| Surge | 0.5 kV line to ground [EN 301 489-1 §9.8.2.2] | Ethernet port with indoor cables over 30 m. Outdoor cables: 1 kV, 10/700 µs [EN 301 489-1 §9.8.2.1]; exclude outdoor cabling in the manual. Where the coupling network would disturb a high-speed port, 1.2/50 µs may replace 10/700 µs [EN 301 489-17 table 6]. |
| Conducted emission, 150 kHz to 30 MHz | Ethernet: class B of EN 55032, table A.12 [EN 301 489-1 §8.7.3]. DC: table 5 of EN 301 489-1, 79/66 dBµV (QP/AV) up to 0.5 MHz, 73/60 dBµV above [EN 301 489-1 §8.3.3] | Ethernet port; DC input if its cable may be longer than 3 m. With a DC cable of 3 m or less to a dedicated AC/DC supply, the supply's AC port instead, class B [EN 301 489-1 §8.3.1, §8.4.3.2]. In transmit mode the NFC exclusion band applies [EN 301 489-1 §8.3.2]. |

A port is tested when its cable may be longer than 3 m [EN 301 489-1 §9.4.1, §9.5.1, annex C.1]. The DC terminal takes bare wires from an existing installation, which cannot promise a shorter cable: plan for the DC port tests.

### Surge on the DC input

- EN 301 489-1, applied by the cited parts 3 and 17, asks no surge test on DC power ports [EN 301 489-1 §9.8.1]. Only the Ethernet port gets one, 0.5 kV line to ground with indoor cable over 30 m [EN 301 489-1 §9.8.2.2]; PoE arrives on that port, a wired network port [EN 301 489-1 §3.1].
- EN 50130-4, the EMC immunity product-family standard for access control systems for security applications [EVS 50130-4; iTeh 50130-4 preview §1], is cited under the EMC Directive in its base edition EN 50130-4:2011 (not with A1) [OJ C 173 2016; EMC summary list 2022], not under the RED [HS-RED]: no presumption for this radio product. Applying it is voluntary, asked for by customers in access control.
- It asks line-to-earth surges through 42 ohm on extra-low-voltage DC lines as well (unverified: the free preview shows only that clause 13, "Slow high energy voltage surge", exists [iTeh 50130-4 preview]; confirm with the lab). The DC input is protected and simulated for that test ([design-notes.md](hardware/touch-p4/design-notes.md#power)).
- Buying it: EN 50130-4:2011+A1:2014, consolidated English text, 24.80 EUR incl. tax from EVS [EVS 50130-4]; German edition 79.96 EUR from DIN Media [DIN Media 50130-4]. prEN 50130-4:2026 is in draft [EVS 50130-4].
- IEC 61000-4-5 only describes the surge test; product standards decide whether and at what level it applies [IEC 61000-4-5 preview §1]. A line-to-line surge of 0.5 kV behind 2 ohm on the DC port is asked by none of the standards above, as far as they could be read (level and 2 ohm unverified: paid standard). Meeting it would take a converter rated for 60 V and a larger TVS.

## What the board does

Board facts from schematic and layout; the reasons are in [design-notes.md](hardware/touch-p4/design-notes.md). Not part of the source check.

| Topic | Measure on the board |
|---|---|
| Wi-Fi antenna | The module's own PCB antenna (2.4 and 5 GHz) in the top left corner over a cut in the top edge, no copper on any layer under it, 15 mm clear to each side; ground fill along the keep-out's edge, stitched every 2.5 mm. |
| Return paths | Six layers. Ground planes on In1 and In4, 3.3 V plane on In3, each in one piece without tracks. Signals on the outer layers and In2 with ground fill between: every signal layer lies next to an uncut plane. |
| Switching regulators | AP63205 at the DC input, with spread spectrum. Two TLV62569 for 3.3 V and the core, 1.5 MHz, no spread spectrum. Small loops, input and output capacitors next to the ICs. |
| DC input | Self-resetting fuse; bidirectional TVS behind it at the connector; reverse-polarity diode; pi filter (2.2 uF, 2.2 uH, 2 x 2.2 uF; 100 V capacitors that keep 1.5 uF each at 24 V); 47 uF electrolytic damping live plug-in; TVS before the converter. Converter away from the NFC antenna; the DC run does not go around the NFC loop. |
| Display bus | 33 ohm series resistors on all RGB and sync lines; GPIO drive strength reducible in firmware. |
| Display edges and flex (ESD) | ESD arrays (U603, U604) on the four touch lines at the panel connector; display's metal back tied to ground through conductive gaskets on four bare pads; tape over the flex ([installation manual](hardware/touch-p4/installation-manual.md)). Per-port table in [design-notes.md](hardware/touch-p4/design-notes.md#esd-per-port). |
| Clocks | Series resistors on the 50 MHz RMII clock, the SDIO clock and the flash clock. |
| USB | TVS and ESD array at the connector, fuse, ferrite bead in the supply. |
| Ethernet / PoE | Isolated PD module; 48 V side in its own area with 2 mm clearance, no copper under the module's isolation barrier; ferrite beads and TVS at the PoE input; capacitor across the barrier; RC from jack shield to ground. Ethernet pairs pass under the jack's shell on the back layer, 48 V nets on the inner layer. |
| NFC | Low-pass (560 nH / 220 pF) between transmitter and antenna, damping resistors, no closed copper ring around the loop. |
| Supply faults | USB feeds the 5 V rail through an eFuse (soft start, current limit, cut-off above 5.53 to 5.74 V), DC and PoE through ideal diodes. All three block reverse current, so no source feeds another; bleed resistors keep unpowered inputs at 0 V. |
| LEDs | Capacitor at each LED, series resistor and pull-down in the data line. |
| Mounting | No tracks under screw heads on the outer layers. |

## Where the board may fail in the lab

Measure these before the lab does, most important first. Engineering judgement except where a source is cited. The simulations in `sim/` cover none of it: they check signals, supplies, heat and the two antennas, not emissions or discharges.

| # | Risk | What to do |
|---|---|---|
| 1 | **NFC harmonics on the cables.** One filter stage, unshielded coils, both cables leave the housing beside the loop. | Measure the harmonics with the cables attached, with the PN532 that will be sold (second source or NXP's), and keep to it. |
| 2 | **Discharges on the user's side.** Display or touch controller loses its settings, PN532 hangs, MCU resets. Failed if the reader does not recover by itself [EN 301 489-17 §6.4, table 2; part 1's clause 6 "shall not apply", EN 301 489-17 §6.1], and by the test plan's objective criteria (see [Standards a lab applies](#standards-a-lab-applies)), among them no loss of settings it names as critical. | Housing: the tap tile's flange overlaps its opening behind the front wall, the LEDs' 5 V vias kept off the path from its seam; metal screws covered or grounded (the mounting holes are not connected to ground); display's metal back grounded via the four bare ground pads on the display side (conductive tape or foam). Firmware: watchdog, and a periodic check that restarts display, touch and NFC. |
| 3 | **The display flex.** About twenty fast lines in an unshielded flex. | Lowest drive strength and pixel clock that work. |
| 4 | **Common-mode noise on the cables.** The DC filter works between the two wires only; the PoE input has beads but no common-mode choke. | Clip-on ferrite on the cable first; a choke needs a new board. |
| 5 | **Radiated Wi-Fi power.** The certificate's 19.85 dBm at 2.4 GHz is 0.15 dB below the limit, on Espressif's board; the module stands elsewhere here. | Measure e.i.r.p. on both bands in the closed case and set the firmware's cap from it. |

Useful before the lab: a line impedance network and spectrum analyser for the DC input, near-field probes, an ESD gun, half a day in a pre-compliance chamber.

Firmware test modes the lab needs:

- NFC carrier on continuously;
- Wi-Fi and Bluetooth on a fixed channel at fixed power: Espressif's EspRFTestTool with its test firmware, or the ESP-IDF example `examples/phy/cert_test` built into the reader's firmware [RFT; FAQ];
- a worst-case mode with everything active that shows on the display whether the reader still works.

The pre-lab measurements are steps in the [bring-up plan](hardware/touch-p4/bring-up.md).

## Open points

### For the product

- Enclosure material, with a data sheet stating HB at least at the wall thickness. Whether it must be flame-retardant is settled by the lab's fault test ([Enclosure plastic](#enclosure-plastic)).
- DC supply limit in manual and on the label: 15 W or 100 W.
- Wi-Fi transmit power per band, from the lab's e.i.r.p. measurement, as the firmware's cap.
- Packaging and manual: 5 GHz indoor restriction with Member State codes; frequency bands with maximum power ([5 GHz Wi-Fi](#_5-ghz-wi-fi)).
- Supply in the box or not. If so, it is part of the tested product.
- Allowed cable lengths for DC and Ethernet, and no outdoor cabling. They decide which port tests apply.
- Business customers only, or private buyers too. Decides the ElektroG registration, whether the instructions must be German and whether the GPSR applies. The packaging duties apply in most cases either way.
- One PN532 source, one PoE module, one display type. The test report covers what was tested.
- Type label: CE mark, model, serial number, manufacturer's name and postal address [RED Art. 10(6), (7), 20(1)]; crossed-out bin, producer identity, "placed on the market after 13 August 2005" mark [ElektroG §9]. CE mark on the packaging too [RED Art. 20(1)].
- In the box: a copy of the declaration of conformity, or a simplified one with the web address of the full text [RED Art. 10(9)].
- Technical file: schematics, layout, parts list, test reports, risk assessments, software bill of materials. Keep it and the declaration for ten years after placing on the market [RED Art. 10(4)]; under the CRA ten years or the support period, whichever is longer [CRA Art. 13(13)].

### For revision B

- Reconfirm with VDE (notified body 0366) whether its 2020 statement on readers with pre-certified modules still holds.

## Test lab

- Ask two or three accredited labs for a quote. Name the exact configuration: ESP32-C5-MINI-1 with its PCB antenna, Wi-Fi 2.4 and 5 GHz (channels 36 to 64 and 100 to 140) and Bluetooth LE, NFC reader with PCB antenna, Ethernet with PoE, DC supply, both assembly versions.
- Where a notified body is needed ([Effort at a glance](#effort-at-a-glance)), ask notified bodies for the RED, and from December 2027 for the CRA too; an accredited lab alone is not enough there [RED Art. 17(4); CRA Art. 32(2)].
- Testing the lan version with Wi-Fi fitted usually covers the wifi version as the simpler case; the lab decides (unverified: lab practice; EG 203 367 allows reusing an assessment for an equivalent combination [EG 203 367 §6.1 note 3]).
- Send with the request: block diagram, list of ports with cable type and length, operating modes, the module certificates and reports, and a list of safety-relevant parts (PoE module, fuses, enclosure material, PCB).

## Sources

A bracketed reference such as [RED Art. 10(9)] is a key from this list (RED) plus the clause relied on (Art. 10(9)). Sources marked "secondary" are not the primary text. Paid standards were not read, only free previews, published test reports and UL or TÜV material.

### EU law and Commission documents

| Key | Title, version | Link |
|---|---|---|
| RED | Directive 2014/53/EU (Radio Equipment Directive), consolidated 30 May 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014L0053-20260530> |
| DR 2022/30 | Commission Delegated Regulation (EU) 2022/30 (RED Art. 3(3)(d), (e), (f)) | <https://eur-lex.europa.eu/eli/reg_del/2022/30/oj> |
| DR 2023/2444 | Commission Delegated Regulation (EU) 2023/2444 amending 2022/30 | <https://eur-lex.europa.eu/eli/reg_del/2023/2444/oj> |
| DR 2026/339 | Commission Delegated Regulation (EU) 2026/339 repealing 2022/30, OJ L of 29 April 2026 | <https://eur-lex.europa.eu/eli/reg_del/2026/339/oj> |
| HS-RED | Commission Implementing Decision (EU) 2022/2191, harmonised standards for radio equipment, consolidated 15 November 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02022D2191-20261115> |
| HS-RED 2025/893 | Commission Implementing Decision (EU) 2025/893, amending 2022/2191 | <https://eur-lex.europa.eu/eli/dec_impl/2025/893/oj> |
| ID 2025/138 | Commission Implementing Decision (EU) 2025/138 (citation of EN 18031) | <https://eur-lex.europa.eu/eli/dec_impl/2025/138/oj> |
| EMCD | Directive 2014/30/EU (EMC Directive) | <https://eur-lex.europa.eu/eli/dir/2014/30/oj> |
| HS-EMC | Commission Implementing Decision (EU) 2019/1326, harmonised standards for EMC, consolidated 10 June 2022 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02019D1326-20220610> |
| OJ C 173 2016 | Commission communication 2016/C 173/01, harmonised standards under 2014/30/EU, 13 May 2016 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52016XC0513(01)> |
| EMC summary list 2022 | European Commission, summary list of harmonised standards for the EMC Directive, 19 September 2022 | <https://single-market-economy.ec.europa.eu/single-market/european-standards/harmonised-standards/electromagnetic-compatibility-emc_en> |
| HS-LVD | Commission Implementing Decision (EU) 2023/2723, harmonised standards for low-voltage equipment, consolidated 30 April 2026 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02023D2723-20260430> |
| WAS | Commission Implementing Decision (EU) 2022/179, 5 GHz WAS/RLAN, consolidated 25 November 2022 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022D0179> |
| WAS-A | Commission Implementing Decision (EU) 2022/2307, amending 2022/179 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022D2307> |
| SRD | Commission Decision 2006/771/EC (short-range devices), annex replaced by (EU) 2025/105, consolidated 23 January 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025D0105> |
| IR 2017/1354 | Commission Implementing Regulation (EU) 2017/1354, information under RED Art. 10(10) | <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R1354> |
| CRA | Regulation (EU) 2024/2847 (Cyber Resilience Act), OJ text of 20 November 2024 | <https://eur-lex.europa.eu/eli/reg/2024/2847/oj> |
| CRA guidance | Commission guidance on the CRA, C/2026/6013, OJ C of 17 November 2026 | <https://eur-lex.europa.eu/eli/C/2026/6013/oj> |
| IR 2025/2392 | Commission Implementing Regulation (EU) 2025/2392, important and critical product categories | <https://eur-lex.europa.eu/eli/reg_impl/2025/2392/oj> |
| C(2026) 7861 | Commission Implementing Decision C(2026) 7861 amending the CRA standardisation request, 10 November 2026 | <https://ec.europa.eu/transparency/documents-register/detail?ref=C(2026)7861&lang=en> |
| CRA std page | European Commission, "Cyber Resilience Act - Standardisation", updated 23 November 2026 | <https://digital-strategy.ec.europa.eu/en/policies/cra-standardisation> |
| MSME page | European Commission, "Cyber Resilience Act - MSMEs" | <https://digital-strategy.ec.europa.eu/en/policies/cra-msmes> |
| RoHS | Directive 2011/65/EU (RoHS) | <https://eur-lex.europa.eu/eli/dir/2011/65/oj> |
| REACH | Regulation (EC) No 1907/2006 (REACH), consolidated 23 June 2025 | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907-20250623> |
| WFD | Directive (EU) 2018/851 amending the Waste Framework Directive 2008/98/EC | <https://eur-lex.europa.eu/eli/dir/2018/851/oj> |
| WEEE | Directive 2012/19/EU (WEEE) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012L0019> |
| PPWR | Regulation (EU) 2025/40 (Packaging and Packaging Waste Regulation) | <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R0040> |
| Batteries Reg | Regulation (EU) 2023/1542 (Batteries Regulation) | <https://eur-lex.europa.eu/eli/reg/2023/1542/oj> |
| GPSR | Regulation (EU) 2023/988 (General Product Safety Regulation) | <https://eur-lex.europa.eu/eli/reg/2023/988/oj> |
| Data Act | Regulation (EU) 2023/2854 (Data Act) | <https://eur-lex.europa.eu/eli/reg/2023/2854/oj> |
| PLD | Directive (EU) 2024/2853 (Product Liability Directive) | <https://eur-lex.europa.eu/eli/dir/2024/2853/oj> |

### German law and authorities

| Key | Title, version | Link |
|---|---|---|
| FuAG | Funkanlagengesetz, as amended 20 July 2026 (BGBl. 2026 I Nr. 214) | <https://www.gesetze-im-internet.de/fuag/BJNR194710017.html> |
| ElektroG | Elektro- und Elektronikgerätegesetz, as amended 25 November 2025 (BGBl. 2025 I Nr. 286) | <https://www.gesetze-im-internet.de/elektrog_2015/BJNR173910015.html> |
| GebV | ElektroG-, BattDG-Gebührenverordnung, as amended 30 September 2025 (BGBl. 2025 I Nr. 233) | <https://www.gesetze-im-internet.de/elektroggebv/BJNR177600015.html> |
| VerpackDG | Verpackungsrecht-Durchführungsgesetz of 13 July 2026 (BGBl. 2026 I Nr. 207) | <https://www.gesetze-im-internet.de/verpackdg/BJNR0CF0B0026.html> |
| ChemG | Chemikaliengesetz, §16f | <https://www.gesetze-im-internet.de/chemg/__16f.html> |
| BT-Drs 21/6134 | Government bill implementing the CRA in Germany (amending the BSIG) | <https://dserver.bundestag.de/btd/21/061/2106134.pdf> |
| BR-Drs 621/26 | Text adopted by the Bundestag on 15 October 2026, sent to the Bundesrat | <https://dserver.bundestag.de/brd/2026/0621-26.pdf> |
| ear reg | stiftung ear, "WEEE-Registrierung beantragen" | <https://www.stiftung-ear.de/anleitungen/weee-registrierung-beantragen/> |
| ear fees | stiftung ear, "Kosten & Gebühren" (amounts net) | <https://www.stiftung-ear.de/anleitungen/kosten-und-gebuehren/> |
| ZSVR | Zentrale Stelle Verpackungsregister, "PPWR & VerpackDG: Das gilt seit dem 12. August 2026" | <https://www.verpackungsregister.org/ich-moechte-wissen-was-seit-dem-12-august-2026-gilt> |
| VDE RED modules | VDE Prüf- und Zertifizierungsinstitut (NB 0366), "RED Information Radio Modules", 24 November 2020 | <https://vde.com/resource/blob/2257746/305090fb24a3738e51dbe4a523c4be35/red-kundeninformation-en-data.pdf> |

### Standards, guides and their previews

| Key | Title, version | Link |
|---|---|---|
| EN 300 328 | ETSI EN 300 328, 2.4 GHz wideband transmission, V2.2.2 (2019-07) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300328/02.02.02_60/en_300328v020202p.pdf> |
| EN 301 893 | ETSI EN 301 893, 5 GHz RLAN, V2.2.1 (2024-11) | <https://www.etsi.org/deliver/etsi_en/301800_301899/301893/02.02.01_60/en_301893v020201p.pdf> |
| EN 300 330 | ETSI EN 300 330, short range devices 9 kHz to 25 MHz, V2.1.1 (2017-02) | <https://www.etsi.org/deliver/etsi_en/300300_300399/300330/02.01.01_60/en_300330v020101p.pdf> |
| EN 301 489-1 | ETSI EN 301 489-1, EMC common technical requirements, V2.2.3 (2019-11) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148901/02.02.03_60/en_30148901v020203p.pdf> |
| EN 301 489-3 | ETSI EN 301 489-3, short range devices, V2.3.2 (2023-01) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148903/02.03.02_60/en_30148903v020302p.pdf> |
| EN 301 489-17 | ETSI EN 301 489-17, broadband data transmission, V3.3.1 (2024-09) | <https://www.etsi.org/deliver/etsi_en/301400_301499/30148917/03.03.01_60/en_30148917v030301p.pdf> |
| EG 203 367 | ETSI EG 203 367, multi-radio and combined equipment, V1.1.1 (2016-06) | <https://www.etsi.org/deliver/etsi_eg/203300_203399/203367/01.01.01_60/eg_203367v010101p.pdf> |
| IEC18 | IEC 62368-1:2018 edition 3.0, table of contents (VDE Verlag preview) | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec62368-1%7Bed3.0%7Db.pdf> |
| EVS 50130-4 | EVS product page, EVS-EN 50130-4:2011+A1:2014 (consolidated) | <https://www.evs.ee/en/evs-en-50130-4-2011-a1-2014-consolidated> |
| DIN Media 50130-4 | DIN Media, DIN EN 50130-4:2015-04; VDE 0830-1-4:2015-04 | <https://www.dinmedia.de/en/standard/din-en-50130-4/228662474> |
| iTeh 50130-4 preview | SIST EN 50130-4:2011, free sample | <https://cdn.standards.iteh.ai/samples/22803/7e22d3a729bd42438ee0562acbfd0d9b/SIST-EN-50130-4-2011.pdf> |
| IEC 61000-4-5 preview | IEC 61000-4-5 edition 3.0 (2014), surge immunity (VDE Verlag preview) | <https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec61000-4-5%7Bed3.0%7Db.pdf> |
| DIN Media prEN 40000-10 | DIN Media, draft DIN EN 40000-10 (prEN 40000-10:2026), drafts of 22 May and 6 November 2026 | <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/402331001>, <https://www.dinmedia.de/en/draft-standard/din-en-40000-10/407570821> |
| Genorma | Genorma, listing of prEN 40000-10 (secondary) | <https://genorma.com/en/standards/pren-40000-10> |
| BSI 60825-1 | BSI, scope of BS EN 60825-1:2014+A11:2021 | <https://knowledge.bsigroup.com/products/safety-of-laser-products-equipment-classification-and-requirements-3?version=standard> |
| SIQ | SIQ, "Update on EN IEC 62368-1:2024 + A11:2024 and OJEU harmonization status", 16 December 2025 (secondary) | <https://www.siq.si/en/news/update-on-en-iec-62368-12024-a112024-and-ojeu-harmonization-status/> |

### Espressif and FCC

| Key | Title, version | Link |
|---|---|---|
| DS-C5 | ESP32-C5-MINI-1 & MINI-1U Datasheet v1.4 | <https://documentation.espressif.com/esp32-c5-mini-1_mini-1u_datasheet_en.pdf> |
| CE-C5 | EU-type examination certificate 44024-05-2026-260268, ESP32-C5-MINI-1, Eurofins (NB 0980), 27 May 2026 | <https://documentation.espressif.com/ESP32-C5-MINI-1%20CE%20Certification.pdf> |
| FCC-C5 | FCC grant, FCC ID 2AC7Z-ESPC5MINI1, part 15E, 28 May 2026 | <https://documentation.espressif.com/ESP32-C5-MINI-1%20FCC-5G%20Certification.pdf> |
| ANT-C5 | Sporton, "OTA Antenna Performance Data Summary", ESP-DUAL BAND-ANT C, FCC exhibit 9339346 | <https://fccid.io/2AC7Z-ESPC5MINI1> |
| FAQ | ESP-FAQ, Hardware related, RF related | <https://docs.espressif.com/projects/esp-faq/en/latest/hardware-related/RF-related.html> |
| RFT | ESP Test Tools, "EspRFTestTool Toolkit" (ESP32-C5) | <https://docs.espressif.com/projects/esp-test-tools/en/latest/esp32c5/development_stage/rf_test_guide/rf_test_guide.html> |
| IDF-WIFI | ESP-IDF Programming Guide, ESP32-C5, Wi-Fi driver overview (v6.0.2 and v6.1.1) | <https://docs.espressif.com/projects/esp-idf/en/latest/esp32c5/api-guides/wifi-driver/overview.html> |
| IDF-API | ESP-IDF API reference, ESP32-C5, Wi-Fi (`esp_wifi.h`, `esp_wifi_types.h`) | <https://docs.espressif.com/projects/esp-idf/en/latest/esp32c5/api-reference/network/esp_wifi.html> |
| IDF-REG | ESP-IDF `components/esp_wifi/regulatory/esp_wifi_regulatory.txt`, commit 34ff741b of 8 May 2026 | <https://raw.githubusercontent.com/espressif/esp-idf/master/components/esp_wifi/regulatory/esp_wifi_regulatory.txt> |

### Test reports, UL, IEEE and other secondary sources

| Key | Title, version | Link |
|---|---|---|
| FLIR | CTC advanced, test report 60429496-001, FLIR A50/A70, IEC 62368-1:2014, 30 April 2021 | <https://support.flir.com/CertDownload/Assets/FLIR%20A50%20and%20A70%20series/IEC%2062368-1%20TEST%20REPORT.pdf> |
| AIR | EKTOS, test report P18-0060-1, Airtame AT-PoE, IEC 62368-1:2014, 21 November 2018 | <https://www.northamber.com/storage/uploads/Product%20Safety/Airtame/EU%20Safety%20Test%20Report%20(LVD)%20PoE%20_P18-0060-1_IEC62368-1.pdf> |
| TI 2018 TRF | Test report US-2558-MET EN 126343 M0A0, IEC 62368-1:2018 (hosted by TI) | <https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/US_2D00_2558_2D00_MET-EN-126343-M0A0.pdf> |
| ULQA | UL Solutions, "IEC 62368-1 Ask the Engineers" (secondary) | <https://www.ul.com/resources/iec-62368-1-ask-engineers-question-and-answer-page> |
| ULTB | UL technical brief on power source classification and measurement, 2011 (secondary) | <https://japan.ul.com/wp-content/uploads/sites/27/2014/06/1_techbrief_classandele_measurement.pdf> |
| TUV | TÜV Rheinland, IEC 62368-1 third edition technical product sheet, 20 September 2019 (secondary) | <https://media.go.tuv.com/Web/TUVRheinlandAG/%7B73d23bd3-a64c-4168-b067-832362b95455%7D_62368-1_Technical_Product_Sheet_AV-IT_9.20.19.pdf> |
| IEEEI | IEEE 802.3 interpretation 3-07/04 on clause 33.4.1 | <https://www.ieee802.org/3/interp/interp-3-0704.pdf> |
| IEEEW | IEEE 802.3 isolation ad hoc, summary of isolation tests, 17 August 2017 (secondary) | <https://www.ieee802.org/3/ad_hoc/isolation/public/Walker_1_08172017_rev_1.pdf> |
| Sagentia | Sagentia, "Lead is now on the REACH candidate list" (secondary) | <https://sagentia.com/news/lead-is-now-on-the-reach-candidate-list/> |
| JLCPCB UL | JLCPCB help, "UL Certification" | <https://jlcpcb.com/help/article/UL-Certification> |

### Filament makers

| Key | Title, version | Link |
|---|---|---|
| Unger guide | Filament Unger, material guide | <https://filament-unger.de/pages/material-guide> |
| Unger downloads | Filament Unger, downloads | <https://filament-unger.de/pages/downloads> |
| FormFutura TDS | FormFutura, ABSpro Flame Retardant technical data sheet v3 | <https://cdn.shopify.com/s/files/1/0622/4181/files/ABSpro_Flame_Retardant_-_TDS_-_Formfutura.pdf> |
| BASF TDS | BASF Ultrafuse PC/ABS FR Black, technical data sheet (German) v1.1, 9 February 2021 | <https://cdn.shopify.com/s/files/1/0264/8791/4555/files/Ultrafuse_PC-ABS_FR_Black_TDS_DE_v1.1.pdf> |
| ROSA TDS | ROSA 3D, technical data sheet "3D FILAMENT ABS+" (product name ABS FR V0) | <https://www.lemona.lt/Files/Instrukcijos/TI/En/Pdf/TDS-ROSA-ABS-EN.pdf> |
