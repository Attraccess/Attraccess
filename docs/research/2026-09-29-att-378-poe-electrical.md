# ATT-378 — PoE electrical and live supplier research

Date: **2026-09-29**. Scope: **Q1, Q3, Q4, Q6 and Q10**, research only. Read [the consolidated context](2026-09-29-att-378-context.md) first, then retrieved ATT-378 read-only and consulted the sources below. No hardware implementation, Linear updates, purchasing, commits or subagents.

## 1. Executive decision

**An isolated, both-pair-set 802.3af implementation is electrically credible, but a complete, currently orderable all-JLC BOM is not established by this research.** The flyback transformer remains the principal sourcing gap. The load budget also needs correction and enforceable limits before claiming ≥2 A continuous at the Core connector.

| Question | Research decision | Remaining qualification |
| --- | --- | --- |
| Q1 — PD and converter | Prefer **TPS23753APWR, C92115**, as the provisional design baseline: verified JLC Extended entry, isolated-converter controller, and a TI 5 V/2 A reference variant. **SI3402-B-GMR, C510771**, is a credible alternative, also verified JLC Extended. | Neither IC includes the isolation transformer. Transformer procurement, complete converter design, efficiency and thermal validation are open. |
| Q3 — RJ45/magnetics | **Würth 7499210121A** is a defensible electrical reference for accepting Alternative A and B: its manufacturer schematic explicitly includes both power extraction paths and internal rectifiers. | No verified LCSC code/JLC library entry or stock for this PN. Reject HR911105A and the historical HY931147C spare-pair implementation for the full-af baseline. Fresh HY manufacturer evidence contradicts part of the historical explanation; see §3. |
| Q4 — suppression | **Littelfuse SMAJ58A, C151246**, is a provisional rectified-input TVS, especially for TPS23753A, whose datasheet explicitly recommends SMAJ58A indoors. | 58 V is stand-off, **93.6 V is the specified clamp** at 4.3 A. Actual surge current, temperature, layout overshoot, all IC pin limits and flyback snubber must be checked. **SS34 is rejected as an HV buck catch diode.** |
| Q6 — isolation | Maintain separate cable/PD primary and system secondary domains, with an isolated power transformer and appropriately rated feedback/EMI crossings. **No direct bridge between their grounds.** | The ticket's unconditional “≥2.5 mm” is not a verified standard-derived rule. The applicable safety standard, insulation category and spacing table inputs must be established. Full normative IEEE/IEC text was not obtained. |
| Q10 — power | Type 1/Class 0 or 3 allows **12.95 W at the PD power interface**, not 20 W. At assumed 85% end-to-end efficiency that is **11.0075 W total secondary power**, shared by Core and local PHY circuitry. | Historical 2.760 A and 3.690 A at 5 V cannot be continuous af loads. A 2 A Core output with a provisional 0.8 W local allowance needs ≥83.4% end-to-end efficiency before downstream losses. |

### Requirements and historical deviations

The baseline in this pass is the original **isolated, fully 802.3af, 5 V ≥2 A continuous, single-supplier/all-JLC-assembly** requirement. Full af includes accepting either applicable pair set and its allowed polarities; it does not mean simultaneous four-pair/bt powering.

The May 23 approvals of **WS3203 + MP9486A non-isolated 1 A buck** and later **HY931147C spare-pair-only implementation** are recorded decisions, not compliance evidence. They remain **historical deviations** from this baseline. LAN magnetics do not isolate a separate power path connected from the cable through a bridge and buck to Core ground. No renewed waiver is inferred from those approvals. The present research neither certifies that historical design nor silently replaces it with a new approved schematic. [CTX §§3, 6.1]

## 2. Q1 — controller identity, isolation and transformer selection

### 2.1 SI3402-B-GMR: integration does not eliminate the transformer

Skyworks' **Si3402-B datasheet Rev. 1.1, August 6, 2021** establishes:

- Type 1/Class 3-and-below PD interface; detection/classification, hot-swap switch, bridge rectifiers, transient suppression, PWM controller and switching FET are integrated. It supports **non-isolated buck or isolated flyback**. It is not an Ethernet PHY despite the JLC catalog's “Ethernet Transceivers” classification. [S1 p.1, §3.1]
- For an isolated application, the manufacturer explicitly requires a transformer in the power path and an isolated feedback path. Systems interfacing with self-powered equipment or accessible external conductors require this treatment. **“Integrated isolated DC-DC” must not be read as an integrated isolation transformer.** [S1 §3.3, p.13, Figure 2]
- Table 2 limits CT1–CT2 and SP1–SP2 to ±100 V; VPOS/HSO and SWO are rated to 100 V, with **SWO referenced to VSS2**. These are stress limits, not normal operating voltages. Recommended port operation stops at 57 V. [S1 Tables 1–2, p.4]
- The individual bridge input pins have a **0.2 A DC rating**. Table 2 note 4 permits higher application current only with external bridge diodes. §3.2.1 recommends bypassing on-chip bridges for **input power >10 W or thermally constrained applications**. A 10 W output at 85% efficiency already needs 11.76 W input before any additional local output load. Therefore the desired design cannot rely on the internal bridges merely to save BOM rows. [S1 pp.4, 10]
- Verified pins: CT1 **14**, CT2 **13**, SP1 **11**, SP2 **10**, VPOSF **12**, VNEG **9 + exposed pad**, HSO **7**, VSS2 **19**, SWO **18**, EROUT **1**. Pins 2/4/16/17 are legacy functions not internally connected in the B revision. **Primary-side thermal pad/vias must not join secondary GND.** [S1 Table 8, p.16]

Skyworks **AN956 Rev. 0.2** §4.2 recommends **Coilcraft FA2924-AL**, 40 µH, primary:secondary 1:0.3, for **3.3 V and 5 V Si3402-B** designs. It distinguishes this from FA2805-CL, recommended for 12 V. The May POE13P-100LB suggestion is not demonstrated to be a drop-in replacement. [S2 §4.2, pp.16–18]

**Important manufacturer-document discrepancy:** AN956 §4.2 discusses a **120 V FET** and a 63 V snubber clamp above a 57 V primary rail; the retrieved Si3402-B datasheet Table 2 specifies **100 V at SWO**. Do not design to the larger application-note value without written manufacturer clarification. Use the 100 V datasheet limit for preliminary stress analysis. At 57 V input, reflected secondary voltage and leakage spike must fit in the remaining drain-voltage margin; the input TVS alone cannot guarantee this.

**Disposition:** technically plausible with external transformer, isolated feedback, suitable external bridges and thermal design. Verified supplier identity is C510771, QFN-20-EP **5×5 mm**. See the dated supplier table for fresh inventory evidence.

### 2.2 TPS23753APWR: preferable reference-design baseline

TI lists TPS23753A as **ACTIVE**. It combines the PD interface with a current-mode converter controller optimized for isolation. The **100 V internal hot-swap FET is not the external flyback switching FET**. It requires external rectification, power transformer, primary switch/current sense, bias supply and isolated feedback. The normal PoE role is **Type 1/13 W**, even though supplier tags say “802.3at (PoE+)”. Those tags do not upgrade it to a 25.5 W Type 2 design. [S3 §§1, 3, 8.1, 8.4.6; S4]

The PW package is **14-pin TSSOP**, 5.00×4.40 mm body, approximately 6.4 mm lead span. **TPS23753APWR** is the tape-and-reel orderable PN, **C92115**, JLC Extended/SMT, Economic and Standard. VDD/VDD1/DEN/RTN high-voltage stress limits are 100 V, but VC is only 19 V; low-voltage control pins have separate limits. Never apply “100 V IC” to every pin. [S3 §§6, 7.1 and package addendum]

TI **SLVU314F** documents the TPS23753AEVM-003 **5 V/2 A** variant alongside -004/-005. The -003 variant is described in the shared guide; a direct `/tool/TPS23753AEVM-003` URL returned 404 in this session. The guide gives:

- 5 V ±5%, 2 A maximum output for the relevant input range; **10 W total output**, not 10 W plus arbitrary local PHY power. [S5 §§1.1–2, Table 1]
- End-to-end efficiency **82% at 44 V input/1.4 A output**, with a separate converter-only efficiency plot. A nominal 85% assumption is not a guaranteed efficiency for a copied EVM circuit. [S5 Table 1, §6.2/Figure 4]
- Synchronous-rectified secondary; the 5 V BOM column uses **IRF8113** for Q1 and **SI4848DY**, 150 V SO-8, for primary Q2. These are reference components, not freshly verified JLC selections. [S5 Table 4]
- The exact 5 V T2 references are **Coilcraft HA3802-BL or E&E 835-01041FC**, specified in TI's BOM as **13 W, triple secondary, 150 µH, 5 V/2 A**, envelope **0.875×0.675 in** (22.225×17.145 mm). **Würth 750311805 belongs to the 12 V column**, so it must not be copied as the 5 V transformer. [S5 Table 4, p.14]

**Transformer sourcing result:** no exact transformer LCSC/JLC match with verified electrical specifications and assembly stock was established. Public JLC searches for HA3802, 835-01041FC, FA2924 and POE13P-100LB returned a JavaScript-dependent “0 Found” shell. A control search for **TPS23753APWR also returned that shell despite the confirmed C92115 detail page**, demonstrating that these search results cannot prove absence from the library. Some attempted Coilcraft URLs returned 403/404 or redirected to a generic transformer category, not the requested part. No invented transformer C-code, zero-stock count or current price is assigned.

The next sourcing pass needs an exact supplier PN linked to a manufacturer winding drawing: turns ratio, primary inductance/tolerance, saturation/peak/RMS current, leakage, switching frequency, bias and synchronous-drive windings, insulation construction/withstand, creepage and pinout. A LAN signal transformer such as H2019/H1102NL or a generic coupled inductor is not an interchangeable flyback power transformer. Supplier presence alone does not establish these requirements.

**Disposition:** choose TPS23753APWR provisionally for the research baseline; **do not release an all-JLC claim until T2 and the supporting BOM are actually sourceable**. JLC purchasing/global sourcing may preserve one purchasing supplier if accepted for the exact part, but an advertised service is not a verified quote, reservation or assembly commitment. Customer consignment/manual sourcing does not satisfy the original constraint.

### 2.3 MP8011: the ticket's claimed function is not verified

The exact **“MP8011 (MPS) — PD-only”** identity could not be authenticated. The official MPS product/document requests encountered a JavaScript client challenge; the Chinese MP8011 URL returned 404. Exact-name search did not produce a usable MPS MP8011 datasheet. Public search surfaced the **different MP8001/MP8001A** manufacturer document, whose indexed description is a PD controller with detection, classification and a 100 V pass device. The official MP8001 document itself was also challenge-blocked in this session. [S6]

**Do not assert an actual MP8011 function, pinout, package or availability from that evidence, and do not silently substitute MP8001 or MP8017.** MP8011 is excluded from the selectable BOM pending a genuine manufacturer document/exact orderable PN. A similar number and an indexed description are discovery leads, not electrical validation. The requested exact-function investigation therefore remains **unresolved**, rather than repeating the ticket's unsupported PD-only claim.

### 2.4 Ag9700: Silvertel module family, not an Akros IC

The accessible **Silvertel Ag9700 product page** describes a currently offered complete **PoE module family**, with a DC-DC converter and **1500 V input/output isolation**. The manufacturer is **Silvertel/Silver Telecom**, not Akros. It lists output variants and distributor sample links; this is evidence of an offered family, not a formal lifecycle declaration or live assembly inventory. [S7 “Key Features & Documents”, variant table]

The 5 V variants **Ag9705-S, Ag9705-2BR and Ag9705-FL are rated 9 W**, therefore **1.8 A at 5 V**, below the ≥2 A requirement even before local PHY loads. Ag9712 variants are 12 V/12 W and would need another conversion stage; they are not 5 V drop-ins. The page identifies the family as **SIL modules**, not a monolithic QFN PD controller. No verified JLC/LCSC orderable module entry was found. Accordingly Ag9700 is not the selected solution.

## 3. Q3 — correct pair sets, magjack evidence and historical correction

### 3.1 Required power-path behavior

For this **10/100 Ethernet** application:

| Input | Cable contacts | Extraction |
| --- | --- | --- |
| **Alternative A / data pairs** | 1–2 and 3–6 | Cable-side winding centre taps, or a documented equivalent internal extraction network, feeding one bridge |
| **Alternative B / spare pairs** | 4–5 and 7–8 | Each pair tied as documented, feeding the other bridge |

Bridge outputs join the **rectified primary rails**, then feed the PD detection/hot-swap interface and isolated converter. Accept either permissible polarity; never parallel raw AC inputs from different pair sets. This is not a promise that both pair sets are powered simultaneously under af. At Gigabit speed all four pairs carry data, so “spare” is only the 10/100 shorthand. Skyworks describes polarity-insensitive CT1/CT2 and SP1/SP2 inputs and dual bridges directly. [S1 §3.2.1, Table 8]

**PHY-side centre taps are not cable-side power taps.** Pulling PoE from a PHY bias tap does not bypass LAN isolation legitimately. Bob Smith terminations are common-mode impedance/EMI networks; they are neither a PD signature nor an adequate substitute for data-line ESD suppression. [S1 Figure 2; S8 §§4–5]

### 3.2 HR911105A — reject for full af

The **HanRun Rev. A/2 manufacturer drawing**, obtained from the direct LCSC product's manufacturer-authored PDF, was visually inspected. Its cable-side CTs and spare pairs terminate through **4×75 Ω** to the common termination node and **1000 pF/2 kV** to chassis. P4/P5 are **chip-side** taps; P7 is NC. There are no exposed independent cable-side PoE extraction terminals or internal dual rectifiers. It is a NIC magjack, not a valid full-af power interface for this circuit. [S9 p.1 “Schematics”]

A 1500 Vrms LAN isolation rating does not make every magjack PoE-capable. Do not use its generic “connect CHS GND to PCB Ground” instruction to short primary return and system ground. C12074 availability is included solely to separate sourcing from suitability; **stock does not make it selectable**.

### 3.3 HY931147C — historical spare-pair circuit unsuitable; fresh PN evidence is different

The historical May implementation was explicitly approved as spare-pair-only, and is **unsuitable as the full-af baseline**. The context also records fabricated pin assumptions and the claim that no exposed cable-side taps meant it could not support Alternative A. Preserve those as historical statements, not fresh manufacturer facts.

**New evidence:** the retrieved **HanRun HY931147C Rev. A/1, p.1**, visually inspected, shows **eight internal rectifier diodes**, **P9 V+ and P10 V−**, plus the spare-pair connections and a data-side extraction network. P3/P4 are chip-side CTs, not raw cable CT outputs. Thus “no exposed cable CT” alone does **not** prove that this PN is inherently spare-pair-only: power extraction can occur inside a magjack. V+/V− remain **unisolated cable-derived power**, not a ready-to-use isolated 5 V output. [S10]

However, the drawing's J-contact routing needs clarification: tracing the pictured data transformer end connections appears to associate J6/J2 with one channel and J3/J1 with the other, rather than the expected 3/6 and 1/2 pair grouping. Its insulation statement also names only a limited test grouping, and a clear PoE winding-current/bridge rating was not obtained. **Do not approve HY931147C as fully compliant from this sheet or its “With PoE” tag.** Obtain an authoritative corrected/confirmed contact-to-board net map and current specifications, compare it to the actual circuit, then test both pair sets/polarities. This newly discovered ambiguity is a research finding, not permission to restore the old schematic.

Live JLC identifies C91754 as **Extended, Plugin, Wave Soldering**, Economic and Standard. This is stronger assembly-method evidence than the old “all-SMT” assertion. But the live LCSC page currently says **Out of Stock**, with **reference-only** prices; no current JLC assembly count was displayed. These independent supplier facts still do not establish a presently orderable complete board.

### 3.4 Defensible alternative: Würth 7499210121A

The **manufacturer datasheet Rev. 003.000, July 11, 2023** provides clear electrical evidence:

- p.2 schematic: cable data J1/J2 and J3/J6 feed the internal PoE extraction/rectification path; spare J4/J5 and J7/J8 feed the other path. The two internal bridges deliver **pin 9 V+ / pin 10 V−**. Both Alternative A and B are supported without exposed raw cable taps.
- PHY signals are **TD+ 5, TD− 6, CTD 4; RD+ 1, RD− 2, CRD 3**. Pins 11/12 and 13/14 are LEDs. These board-pin numbers are not the cable J-contact numbers.
- p.3 “Power over Ethernet Properties”: **350 mA per centre tap, IEEE 802.3af compliant**; insulation test **1500 V RMS, 1 minute**. This is component evidence, not certification of a completed PD board.
- p.1 dimensions/land pattern and p.4 wave-solder profile must drive the footprint and JLC insertion check. The body is approximately 13.5 mm tall, so the historic 8 mm top envelope is not automatically met. [S11]

**Recommendation:** use this PN as the electrically defensible comparison/reference, coupled directly through its rectified primary outputs to TPS23753A. Do not add redundant bridges without considering losses. No verified LCSC ID, JLC stock or assembly commitment was obtained, so it is **not a locked all-JLC production selection**.

The ticket's other example, **Pulse JK0-0136NL**, is explicitly **NON-POE**, 1000BASE-T, THT, on Pulse's own product finder. A tested additional lead, JXD0-0001NL, is also explicitly NON-POE. Neither is selected by superficial RJ45 similarity. [S12]

## 4. Q4 — TVS, switch stresses and rectifiers

### 4.1 SMAJ58A versus the actual absolute maxima

The **Littelfuse SMAJ series manufacturer datasheet**, retrieved as a manufacturer-authored LCSC mirror, gives the SMAJ58A row:

| Quantity | Value / condition |
| --- | --- |
| Package/polarity | DO-214AC/SMA, **unidirectional**; SMAJ58CA is the bidirectional variant |
| Reverse stand-off | **58.0 V** |
| Breakdown | **64.4–71.2 V at 1 mA** |
| Maximum clamping voltage | **93.6 V at 4.3 A** |
| Pulse power | **400 W, 10/1000 µs**, specified temperature/duty conditions |

[S13 p.1 ratings/features, p.2 electrical characteristics, thermal derating curves]

**93.6 V is below the verified 100 V high-voltage stress limit of both TPS23753A and Si3402-B, by only 6.4 V.** It is therefore incorrect to declare this TVS categorically incompatible with Si3402-B using an invented 60 V absolute maximum. It is equally incorrect to declare all transients safe because 58 >57 or 93.6 <100.

- The clamp specification applies at the stated waveform/current and conditions. Add connection inductance/overshoot, temperature effects and the actual generator/coupling/current, and verify the voltage **at the protected pins**. Check surge energy and repeated pulses as well as peak voltage.
- A primary input clamp does not bound flyback drain stress: **VIN + reflected secondary voltage + leakage spike** requires a separate snubber design. This is especially important for Si3402-B's 100 V SWO limit and the AN956 discrepancy in §2.1.
- A 60 V/65 V input IC would not be protected merely by the same 58 V TVS. Lower-voltage VC/FB/control pins also need their own regulated/clamped circuits.
- Use cathode to rectified positive/anode to primary negative for SMAJ58A. A unidirectional TVS is sensible **after polarity rectification**; “bidirectional is required” is not a universal rule there. Positioning before a bridge changes polarity and surge-path requirements.

TI **TPS23753A §8.4.13** expressly recommends SMAJ58A or equal/better performance for general indoor applications. Skyworks Si3402-B integrates certain surge protection; additional protection should follow AN956 and the external-bridge configuration, rather than copying TI's topology without analysis. [S3 §8.4.13; S1 Table 2 notes and §3.2.1]

**Annex boundary:** ATT-378's assertion of a universal “Annex 33B” surge requirement was not verified from normative text. TI **SLUA736** distinguishes isolation electrical-strength tests, hot-plug transients, common-mode lightning tests and installation-dependent IEC 61000-4-5 coupling. Its §7 references include an IEEE draft, so it is engineering guidance, not a substitute for obtaining the governing published standard. Do not equate a 400 W/10–1000 µs component rating with passing every Ethernet surge test. Bob Smith networks do not eliminate the need for suitably low-capacitance PHY/data SPDs. [S8 §§1–6]

For Si3402-B specifically, **AN956 §6 “Surge”** describes a 1000 V, 0.3 µs rise/50 µs fall test through 402 Ω per conductor and the IC's 50 µs/5 A handling mechanism. It recommends **at least 15 µF switcher-input storage** for that surge-energy path and documents additional input-pin capacitors for powered-system ESD immunity. This is a concrete manufacturer design requirement to carry into the capacitor/protection design; it is not independently verified normative Annex text. Treat an input TVS as one part of that network, not a replacement for the specified energy path. [S2 §6]

### 4.2 SS34 reverse voltage: reject the HV-buck placement

The exact historical **MDD SS34, C8678** manufacturer sheet Rev. 2024A5 gives **40 V VRRM/DC blocking, 3 A**, **SMA/DO-214AC**. Its nominal 3 A rating does not cure reverse-voltage overstress. [S14 p.1]

In the historical non-isolated buck, the catch diode sees approximately the high-voltage input when the switch is on. A 37–57 V PoE input exceeds its rating at ordinary operating voltages. **Reject SS34 in that position**, regardless of the chosen 1 A or 2 A output. Skyworks' own buck discussion recommends a **100 V diode** for margin and names PDS5100/UPS5100 examples. [S2 §4.1]

A 40 V diode can be appropriate on an isolated 5 V flyback secondary **only if** its reverse stress, turns ratio, ringing, pulse/RMS current and thermal rating are verified. AN956 §4.2 derives the reverse stress and names **PDS1040**, a different 10 A rectifier. Do not silently promote a 3 A SS34 to that pulsed-current role. Also do not use the Vishay SS34 drawing as the C8678 footprint: the retrieved Vishay family is **SMC**, while the actual MDD part is **SMA**. [S2 §4.2; S14]

### 4.3 Bridge and capacitors

**MDD MB10S-50MIL, C2488**, is verified as MBS, 1 kV/1 A, JLC Basic/SMT. The JLC description gives **1.1 V at 400 mA per diode**: two conducting diodes can dissipate roughly **0.77 W at 350 mA** using that voltage as an estimate. This is not a precision loss prediction, but shows why a high-voltage-rated silicon bridge can consume meaningful Type 1 power headroom. Prefer a properly rated low-loss bridge implementation where thermal/efficiency requirements demand it. With an internally rectifying jack, count its bridge losses and do not duplicate them accidentally. [S15]

Keep the signature/input bypass capacitance on the proper side of the hot-swap switch and bulk storage behind it. Do not place the old 22 µF directly across raw detection inputs. Input bulk and ceramics need voltage, ripple-current and DC-bias validation; a 100 V capacitor label alone is insufficient when clamp/overshoot approach its limit. No exact new capacitor PN is locked here. [S3 §8.3.1.12, Figure 9-1; S2 §§3.7–3.8, 6]

## 5. Q6 — isolation barrier and standards evidence

### 5.1 Primary/secondary boundary

Primary includes cable contacts, cable-side magnetics/PoE extraction, rectifiers, input TVS, detection/classification, hot-swap and flyback primary/switch/bias circuitry. The **PD controller belongs on the primary**, not the SELV/system half just because it controls an isolated converter.

Secondary includes flyback output/regulation, local PHY and its supplies, RMII/MDIO/reset/REF_CLK, J_POE +5 V/GND, Core, USB/DC and other accessible system connectors. Ethernet data crosses through LAN magnetics; power crosses through the flyback transformer; feedback crosses through the specified optocoupler or other genuinely isolated regulation scheme. [S1 §3.3; S3 §8.4.12; S5 §7.2]

**Delete the ticket Q7 notion of a “single low-impedance bridge” between cable and system grounds from the design baseline.** No 0 Ω link, copper neck, common plane, mounting screw, shield connection or probe-ground strap may bypass the intended barrier. Primary rectified return and post-hot-swap return can have their defined internal relationships; neither becomes secondary GND. A safety-qualified EMI capacitor may cross the barrier only with appropriate working/withstand ratings, capacitance/leakage and safety classification. A generic “2 kV” MLCC or 0402 symbol is not proof of Y-capacitor qualification.

Audit clearances on **all layers**, under magnetics/opto packages, through pads/vias, along board edges/slots, around shields and screws, and through the complete interconnected stack. Silkscreen “ISOLATION” is explanatory only. RMII reference planes remain on the secondary and do not bridge the boundary.

### 5.2 What is and is not verified about standard spacing

TI SLUA736 §1 summarizes three alternative PD electrical-strength tests under its referenced IEEE/IEC editions: **1500 Vrms at 50–60 Hz for 60 s; 2250 VDC for 60 s; or specified 1500 V 10/700 µs repeated impulses**. TI TPS23753A §8.4.12 explicitly says PI conductors must be isolated from ground and other system potentials. These are manufacturer explanations of standard requirements; **this pass did not independently read the complete published Clause 33 text**. [S8 §1; S3 §8.4.12]

**Clearance and creepage are distinct**. Creepage depends on working voltage, material group/CTI, pollution degree and insulation requirement; clearance also depends on transients/withstand, altitude and the relevant standard method. The exposed cable interface and accessible USB/DC/system domains must be classified under the selected product safety standard. A calculation using only 57 V is not a telecom-port insulation assessment, and passing a transformer hipot rating does not establish compliant PCB spacing.

Consequently **“2.5 mm IEC 60950-class basic insulation” is not locked**. IEC 60950 is also an old reference: IEEE's official 802.3 page describes the 2021 isolation maintenance amendment replacing IEC 60950 references with IEC 62368 references. Retrieve the applicable edition of **IEC 62368-1**, relevant insulation/clearance/creepage clauses (including the §5.4 framework), and the applicable IEEE isolation language before deriving and recording numeric DRC constraints. Exact normative tables, final material/altitude assumptions and a final minimum spacing remain **unverified**. Do not replace one unsupported universal number with an unsupported “4 mm is always compliant” claim. [S16]

### 5.3 IEEE primary-source access result

- IEEE's official **802.3-2022** landing page was accessible and links to the **IEEE GET Program**. The retrieved GET page exposed navigation/account chrome, not a usable full standard/Clause 33 download. This is a **session access limitation**, not a claim that the standard can never be obtained free through GET. [S16]
- The original IEEE **802.3af task-force archive** was accessible. Its **requirements.pdf**, pp.1–2, says it is an **“unapproved IEEE working document, subject to change”** and is current through November 2000 motions. §2 items 12/15 discuss both pair sets; item 13 discusses 350 mA; item 18 discusses 44–57 V. This is useful primary historical evidence, **not published normative Clause 33** and not a basis for copying draft voltage/current rules into the final design. [S17]
- No publicly retrievable, final normative Clause 33 or complete IEC safety spacing tables were obtained. No fabricated verbatim “shall” quote or unverified clause number is used to imply otherwise. Annex 33B and the final PD/isolation subclauses must be checked against the obtained edition at the next standards gate.

## 6. Q10 — reconcile the Core load with Type 1 power

### 6.1 Hard upper bound and the incompatible historical budgets

TI's classification table gives **12.95 W maximum at the PD PI** for Class 0/3. Class 0 classification is not a digital grant of extra watts; detection/classification and maintain-power-signature operation still need to work. [S3 Table 8-1, §§8.4.2–8.4.5]

Let ηPI→5V mean **end-to-end PI-to-secondary efficiency**, including rectification, PD switch, converter and its losses. Then:

`Psecondary,total ≤ 12.95 W × ηPI→5V`

`ICore,5V ≤ (Psecondary,total − Plocal,secondary) / 5 V`

If an efficiency figure is converter-only, subtract bridge/hot-swap/primary losses separately **before** applying it. Do not subtract the same losses twice when using an end-to-end measurement. Downstream Core ORing/connector voltage drop and Core's own rail conversion must also be counted at the appropriate boundary.

| Recorded/proposed Core 5 V load | Output power | Required PI power at 85%, before extra local PHY load | Finding |
| --- | ---: | ---: | --- |
| Ticket's old ~1.4 A assertion | 7.00 W | 8.24 W | Could fit, but contradicts later load tables and is not measured |
| Historical ATT-377 peak **2.760 A** | **13.80 W** | **16.24 W** | Exceeds 12.95 W even at 100% efficiency |
| Historical Core typical **2.230 A** | **11.15 W** | **13.12 W** | Already exceeds af at assumed 85%, before local PHY |
| Historical Core peak **3.690 A** | **18.45 W** | **21.71 W** | Cannot be continuous af |
| Proposed Core connector **2.000 A** | **10.00 W** | 11.76 W without local load | Possible only with enough total converter rating/efficiency and bounded load |

The historical statement “PoE supplies 4 A at 5 V” is false for the specified af budget. A 1 A MP9486A output is **5 W**; choosing a higher-current connector or negotiating Class 0 does not change that converter rating. The May WS3203/MP9486A 1 A decision is a historical load/power deviation, not a solution to the original ≥2 A requirement. [CTX §6.1; S18]

### 6.2 Correct the 3V3-to-5V conversion before adding currents

The historical Core POWER-BUDGET table lists **525 mA typical / 1265 mA peak at 3.3 V**, but substitutes **1000/1600 mA** as the 5 V converter input row. At its stated η3V3 =0.92:

`I5V,buck = 3.3 × I3V3 / (5 × 0.92)`

| Core-side consumption | Typical | Peak |
| --- | ---: | ---: |
| Corrected 5 V input for the listed 3V3 loads | **0.3766 A** | **0.9075 A** |
| Direct 5 V LED/buzzer/display rows | **1.230 A** | **2.090 A** |
| Recomputed Core total, before ORing/local PoE loads | **1.6066 A / 8.033 W** | **2.9975 A / 14.988 W** |

This is a recalculation of **historical unmeasured rows**, not a new load measurement or proof their device assumptions are correct. The 1000/1600 mA row may instead represent reserve, but must be labelled as such; it cannot be presented as a calculation of the smaller 3V3 table. Count the 3V3 rail via its converter input once, rather than adding 3V3 amperes directly to 5 V amperes. Display logic/backlight allocations must be checked for overlapping accounting. [S18 §§1–2]

### 6.3 The local PHY is a real extra load

Microchip **LAN8720A/LAN8720AI DS00002165B §5.3, Table 5-2** covers the agreed **REF_CLK OUT mode**:

- Device-only 100BASE-T traffic: **50 mA typical / 54 mA maximum**, 164/179 mW at nominal supplies.
- Device-only 10BASE-T traffic: **26 mA typical / 30 mA maximum**, 85/96 mW.
- **Note 5-10 explicitly excludes magnetics supply and external LEDs** and gives typical Ethernet component currents of **41 mA at 100BASE-TX and 100 mA at 10BASE-T**. These extra values are typical, not guaranteed maxima. [S19 pp.53–54]

With internal PHY core regulation enabled and external 5→3.3 V LDO supply, an illustrative 100BASE-T calculation is `(54 + 41) mA ×5 V ≈0.475 W` at the 5 V bus, before external LED load/quiescent current. At 10BASE-T, `(30 +100) mA ×5 V ≈0.650 W`. The worst local budget need not occur at the fastest link rate. Replacing the LDO with a buck changes input power, but does not remove PHY, magnetics-bias or LED consumption.

Use **0.8 W provisional local-secondary allowance** for the following arithmetic. It is an explicit planning assumption, **not a verified worst-case bound**; measure and finalize it across link modes, clock load, LED states, regulator loss and temperature. Local 3V3 must either be generated on the PoE board or have an explicitly revised connector contract; the frozen J_POE map has no exported 3V3 power rail.

| Assumed end-to-end η | Total secondary power | Core power after 0.8 W local allowance | Equivalent Core 5 V current |
| ---: | ---: | ---: | ---: |
| 80% | 10.360 W | 9.560 W | **1.912 A** |
| 82% | 10.619 W | 9.819 W | **1.964 A** |
| 85% | 11.0075 W | 10.2075 W | **2.0415 A** |
| 90% | 11.655 W | 10.855 W | **2.171 A** |

Thus **2 A for Core +0.8 W local requires 10.8/12.95 =83.4%** end-to-end efficiency, with essentially no comfortable margin at 85%. The TI 10 W EVM reference does not by itself establish 2 A to Core **plus** local circuitry; either qualify a higher total secondary output within the af input ceiling or revise the system load requirement explicitly.

### 6.4 LED limits and peak duration

Using the historical peak LED row of **1.440 A**, enforcing a genuine **25% aggregate LED power cap** would reduce that allocation to 0.360 A. The recalculated Core peak becomes approximately **1.9175 A /9.588 W**, plus the provisional 0.8 W local load and downstream losses. That can fit some efficient af implementations, but still requires measured margins and display/compute load coordination.

Do not assume a PWM average cap reduces instantaneous LED switching peaks by the same factor. Firmware must enforce the intended limit from boot, including reset/firmware failure/brightness commands; sequencing and hardware current limits must protect the supply. The 24×60 mA row, display 600 mA reservation and simultaneous CPU/C6 peaks need measured duration/duty traces. A capacitor does not make 2.76/3.69 A continuous af-compatible. For a transient, determine energy deficit and rail excursion: approximately `C ≥ ΔI × Δt / ΔV`, then account for ESR, regulator response, PD/PSE overload behavior and recharge energy within the long-term budget.

**Required evidence:** PI input power; converter output split between Core/local loads; 5 V at J_POE and after Core ORing; local 3V3/regulator temperature; all requested operating combinations; startup; 10/100 link; pair-set/polarity; worst cable/low PD voltage; and 24 h thermal operation at the actual required continuous load. A 1 A smoke test is insufficient to validate ≥2 A.

## 7. Draft critical BOM and live supplier evidence

**Lookup window: 2026-09-29, approximately 20:59–21:09 UTC.** Prices below are **USD unit prices at the displayed quantity tier**, not board assembly quotes. JLC library class/assembly method comes from the direct JLC detail page. Counts/prices come from **direct LCSC public product pages**, where displayed; **LCSC inventory is not asserted to be JLC assembly inventory**. No May stock numbers are reused. “Unknown/not displayed” does not mean zero stock. Live retrieval can change by region/session and does not reserve parts.

### 7.1 Freshly identified/catalog-verified parts

| Draft ref/role | Manufacturer MPN | Package | Verified code | JLC live library/method | JLC assembly count / price | LCSC live status / displayed unit price | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U_PD primary choice | TI **TPS23753APWR** | TSSOP-14 PW | **C92115** | **Extended; SMT; Economic/Standard** | **Unknown / not displayed** | **9,300**; **$1.9013 @1**, $1.5855 @10 | Provisional controller; external flyback components required |
| U_PD alternative | Skyworks/Silicon Labs **SI3402-B-GMR** | QFN-20-EP, 5×5 | **C510771** | **Extended; SMT; Economic/Standard** | **Unknown / not displayed** | **1,454**; **$3.1169 @1**, $2.7214 @10 | External transformer/feedback; external bridges for high power |
| D_TVS rectified primary | Littelfuse **SMAJ58A** | DO-214AC/SMA | **C151246** | **Extended; SMT; Economic/Standard** | **Unknown / not displayed** | **9,540**; **$0.1404 @5**, $0.1094 @50 | Provisional, surge/stress qualification required |
| BR_A/BR_B, if raw pair extraction is used | MDD **MB10S-50MIL** | MBS | **C2488** | **Basic; SMT; Economic/Standard** | **Unknown / not displayed** | **596,560**; **$0.0272 @20**, $0.0213 @200 | Bridge candidate; quantify loss. Not automatically needed with internal-bridge magjack |
| Historical D_CATCH, **excluded** | MDD **SS34** | SMA/DO-214AC | **C8678** | **Basic; SMT; Economic/Standard** | **Unknown / not displayed** | **3,869,680**; **$0.0351 @20**, $0.0282 @200 | **40 V: reject HV buck catch role** |
| Historical jack, **not accepted** for current baseline | HanRun **HY931147C** | Plugin/THT, manufacturer drawing | **C91754** | **Extended; Wave Soldering; Economic/Standard** | **Unknown / not displayed** | **Out of Stock**; **reference only** $2.5442 @1, $2.1311 @10 | Historical spare-pair circuit rejected; fresh datasheet/net-map ambiguity in §3.3 |
| Rejected jack | HanRun **HR911105A** | THT, manufacturer drawing | **C12074** | Not reverified in this pass | **Unknown / not displayed** | **26,213**; **$1.7340 @1**, $1.4626 @10 | **Not a full-af extraction interface** |

Direct product URLs for the first five rows are in S20–S24; the jack pages are S25–S26. C91754's prices are specifically labelled “Unit Price (Reference Only)”. The C404013 LCSC lookup for the historical MP9486AGN-Z returned 404 via curl; its May inventory/price is intentionally not presented as live.

### 7.2 Electrically identified references with unresolved procurement

These are **draft design roles**, not a completed ordering BOM. Every unknown is intentional; neither packages nor C-codes are invented to make the table look complete.

| Draft ref/role | Electrical reference / MPN | Package/envelope evidence | LCSC/JLC class, stock, price | Remaining work |
| --- | --- | --- | --- | --- |
| J_ETH preferred comparison | Würth **7499210121A** | THT, exact manufacturer p.1 land pattern, wave profile p.4 | **All unknown; no exact supplier match verified** | JLC sourcing/insertion commitment; rectifier loss; mechanical fit |
| T_PWR for TI 5 V reference | Coilcraft **HA3802-BL** or E&E **835-01041FC** | TI Table 4: 22.225×17.145 mm envelope; exact land/windings still required | **All unknown** | Lock genuine transformer drawing, isolation and JLC orderable PN; total output ≥Core+PHY |
| T_PWR for Si3402-B alternative | Coilcraft **FA2924-AL** | AN956 40 µH/1:0.3 reference; footprint not locked | **All unknown** | Manufacturer drawing/procurement; recheck SWO stress against 100 V |
| Q_PRIMARY for TI path | **SI4848DY** reference | TI Table 4: SO-8, 150 V | **All unknown** | Verify present lifecycle/suffix/JLC PN; current, loss and snubber stress |
| Q_SECONDARY for TI synchronous path | **IRF8113** reference | TI 5 V BOM: SO-8, 30 V | **All unknown** | Exact current production/JLC alternative and drive/stress validation |
| U_FB isolation | Vishay **TCMT1107** TI reference | MF4, 3750 Vrms, 80–160% CTR per TI BOM | **All unknown** | Exact manufacturer insulation/spacing/CTR-aging and JLC selection |
| U_REF for TI 5 V loop | TI **TLV431ACDBVR** reference | SOT-23-5 per TI BOM | **All unknown** | Lock JLC ID and compensation for actual output/load |
| U_PHY/local 3V3 | LAN8720AI-CP-TR historical lead; local regulator **TBD** | PHY QFN-24-EP; regulator package **TBD** | No fresh library/stock/price validation; historical C17146 is **not promoted to live BOM evidence** | Q2/pin/strap research separately; include local power and real footprint |
| C_IN/C_OUT, R_DET/R_CLASS/R_CS, bias/snubber/EMI parts | **TBD exact MPNs** | **TBD** | **All unknown** | Work from chosen reference, insulation category, ripple/DC-bias/thermal and surge requirements |
| Optional barrier/chassis capacitor | **TBD safety-qualified PN** | **TBD actual creepage/clearance/package** | **All unknown** | Do not reuse generic 0402 “Y2/2 kV” model |
| Integrated-module rejected option | Silvertel **Ag9705-S / -2BR / -FL** | SIL/module, exact variant drawing required | **All unknown** | 5 V/9 W is below requirement; not selected |

A full BOM cost cannot be defensibly calculated from these partial prices. Package geometry, winding/terminal functions and assembly capability must be checked as well as value, stock and library class.

## 8. Explicit unavailable evidence and research closure

This report resolves several incorrect electrical assertions, but leaves the design **not ready for a full-compliance/all-JLC declaration**:

1. **No pcbparts tools** were available. Public JLC detail pages verified several library classes/methods but exposed no usable assembly stock counts or price tiers. Public search shells produced false negatives, so transformer absence is not proven.
2. **No verified JLC flyback transformer** with a manufacturer-approved winding/isolation drawing and current assembly availability. TI and Skyworks references identify real electrical targets; supplier IDs/prices remain unknown.
3. **No verified JLC procurement for Würth 7499210121A**. The manufacturer schematic/rating is verified, sourcing is not. HY931147C has a live wave-solder library entry, but LCSC says out of stock and the retrieved drawing needs clarification.
4. **MP8011 identity/function remains unverified**; MPS challenge/404 responses do not authorize inventing a function or substituting a similarly named controller.
5. **Complete published IEEE Clause 33 and IEC spacing tables not obtained** in this session. IEEE archive drafts are accurately labelled drafts; manufacturer guidance is accurately labelled guidance. The original 2.5 mm assertion is not a resolved standards result.
6. **No measured Core/display/LED/local-PHY load or efficiency**. Corrected arithmetic and an illustrative 0.8 W local allowance are not a validated system budget. ≥2 A must be qualified at the intended connector boundary with actual local consumption.

Suggested next research gates: secure the exact transformer and RJ45 sourcing evidence; obtain normative isolation/spacing text and board material/environment assumptions; resolve HY's manufacturer net map if retaining it as a candidate; lock input surge and drain/rectifier stress calculations; then finalize the load limits and measured efficiency target. This is a research handoff, not a request to implement, order, update Linear or mark ATT-378 Done.

## Sources and exact sections consulted

All live supplier observations were made September 29, 2026. Manufacturer document revision dates describe the documents, not inventory freshness. Manufacturer-authored PDFs mirrored by a supplier are explicitly distinguished from manufacturer-hosted documents.

- **CTX:** [Context document](2026-09-29-att-378-context.md), especially §§3, 4, 6.1; [ATT-378](https://linear.app/attraccess/issue/ATT-378), read-only issue description Q1/Q3/Q4/Q6/Q10.
- **S1:** Skyworks, [Si3402-B datasheet](https://www.skyworksinc.com/-/media/SkyWorks/SL/documents/public/data-sheets/Si3402-B.pdf), Rev. 1.1: p.1 integration; Tables 1–2 p.4; §3.2.1 p.10 bridges; §3.3 p.13 isolation; §3.4.3 snubber; Table 8 p.16 pinout. The initial guessed `Si3402.pdf` URL returned a 404 page; the B-specific PDF above succeeded.
- **S2:** Skyworks, [AN956 Si3402-B PoE PD Controller Design Guide](https://www.skyworksinc.com/-/media/SkyWorks/SL/documents/public/application-notes/AN956.pdf), Rev. 0.2, November 8, 2021: §1 Type 1 budget; §§3.7–3.8 signature/input filter; §4.1 buck rectifier; §4.2 isolated flyback/FA2924-AL/reflected stress; §4.2.1 reference/opto; §6 surge/ESD.
- **S3:** TI, [TPS23753A datasheet SLVS933D](https://www.ti.com/lit/ds/symlink/tps23753a.pdf), December 2020 revision: §§6, 7.1; §8.3.1 pin functions; Table 8-1 classification; §8.4.5 MPS; §8.4.6 converter; §8.4.12 isolation/adapter ORing; §8.4.13 SMAJ58A recommendation; §9.2/Figure 9-1.
- **S4:** TI, [TPS23753A product page](https://www.ti.com/product/TPS23753A), “Product details”, “Features”, “Description”, “Design & development”: ACTIVE/Type 1; PW package; EVM and application-note links.
- **S5:** TI, [SLVU314F TPS23753AEVM-004 shared evaluation guide](https://www.ti.com/lit/ug/slvu314f/slvu314f.pdf), March 2016: §§1–2/Table 1 incl. -003 5 V variant; §6.2/Figure 4 efficiency; §7.2 layout; §8/Table 4 variant-specific BOM, especially T2/Q1/Q2/U2/U3.
- **S6:** Attempted [MPS MP8011 product page](https://www.monolithicpower.com/en/mp8011.html), [MP8011 document endpoint](https://www.monolithicpower.com/en/documentview/productdocument/index/version/2/document_type/Datasheet/lang/en/sku/MP8011/), [Chinese MP8011 page](https://www.monolithicpower.cn/cn/mp8011.html). First two challenge-blocked; Chinese page 404. Discovery-only [MP8011 datasheet search](https://html.duckduckgo.com/html/?q=MP8011+datasheet) surfaced the different [official MP8001/MP8001A document endpoint](https://www.monolithicpower.com/en/documentview/productdocument/index/version/2/document_type/Datasheet/lang/EN/sku/MP8001/document_id/3769/), also challenge-blocked. Search snippets are not treated as datasheet verification.
- **S7:** Silvertel, [Ag9700 product page](https://silvertel.com/ag9700/), “Key Features & Documents”, output-variant table and evaluation-board description. Manufacturer/module/isolation/9 W claims read directly on the accessible page.
- **S8:** TI, [SLUA736 Lightning Surge Considerations for PoE Powered Devices](https://www.ti.com/lit/an/slua736/slua736.pdf), March 2015: §1 electrical-strength tests; §§2–5 coupling, earth return/EMI capacitor paths, SPDs; §6 installation/safety qualifications; §7 references.
- **S9:** HanRun, [HR911105A Rev. A/2 manufacturer drawing via direct LCSC PDF](https://datasheet.lcsc.com/datasheet/pdf/0ad5e0c00dfc47fb8e582f15f877f290.pdf?productCode=C12074), p.1 “Schematics” and isolation rating, visually inspected. Manufacturer-authored supplier mirror.
- **S10:** HanRun, [HY931147C Rev. A/1 manufacturer drawing via direct LCSC PDF](https://datasheet.lcsc.com/datasheet/pdf/ff6330b5513846d1a2cc651d7517facb.pdf?productCode=C91754), p.1 isolation statement and “Schematics”, visually inspected; supplier mirror. LCSC `/datasheet/C91754.pdf` returned HTML to curl; the explicit PDF asset succeeded.
- **S11:** Würth Elektronik, [7499210121A manufacturer datasheet](https://www.we-online.com/en/components/products/datasheet/7499210121A.pdf), Rev. 003.000: p.1 drawing; p.2 schematic, visually inspected; p.3 “Power over Ethernet Properties”/insulation; p.4 wave soldering. An attempted 7499211122 PDF returned 404 and is not used as evidence.
- **S12:** Pulse, [JK0-0136NL product finder](https://productfinder.pulseeng.com/product/JK0-0136NL) and [JXD0-0001NL product finder](https://productfinder.pulseeng.com/product/JXD0-0001NL), “POE RATING”, “SPEED”, “PACKAGE”. Both display NON-POE.
- **S13:** Littelfuse, [SMAJ series manufacturer datasheet via LCSC mirror](https://datasheet.lcsc.com/datasheet/pdf/bf298e2c0542e0172af23908598fa548.pdf?productCode=C151246), revised November 20, 2015: p.1 ratings; p.2 SMAJ58A/SMAJ58CA electrical table; subsequent derating/package pages. The attempted [manufacturer product URL](https://www.littelfuse.com/products/tvs-diodes/surface-mount/smaj/smaj58a) returned 403; the manufacturer-authored mirror was readable.
- **S14:** MDD, [SS32–SS3200 manufacturer datasheet via LCSC mirror](https://datasheet.lcsc.com/datasheet/pdf/dfa1ff67dea875d0135103ba9ada713a.pdf?productCode=C8678), Rev. 2024A5, p.1 SS34 reverse ratings and SMA package. Cross-check only: [Vishay SS32–SS36](https://www.vishay.com/docs/88751/ss32.pdf), p.1 reverse rating, **SMC package**, not the C8678 footprint.
- **S15:** JLC, [MDD MB10S-50MIL C2488](https://jlcpcb.com/partdetail/MDDMicrodiodeSemiconductor-MB10S50MIL/C2488), “Attributes”, “Specifications”: Basic, SMT, MBS, 1 kV/1 A, Vf description.
- **S16:** IEEE SA, [802.3-2022 official standard page](https://standards.ieee.org/ieee/802.3/10422/), GET link and history, including isolation maintenance amendment description; [IEEE GET Ethernet series](https://ieeexplore.ieee.org/browse/standards/get-program/page/series?id=68). Landing page accessible; full normative Clause 33 not retrieved.
- **S17:** IEEE, [802.3af task-force archive](https://www.ieee802.org/3/af/), [public documents](https://www.ieee802.org/3/af/public/documents/index.html), [requirements.pdf](https://www.ieee802.org/3/af/requirements.pdf), pp.1–2, §2 items 4/12/13/15/18; explicitly unapproved working document, not a final standard.
- **S18:** [Historical Core POWER-BUDGET.md at dedd98842](https://github.com/Attraccess/Attraccess/blob/dedd98842/apps/attractap/hardware/core/POWER-BUDGET.md), read with `git show`, §§1–2; unmeasured historical budgets, not supplier/manufacturer verification.
- **S19:** Microchip, [LAN8720A/LAN8720AI datasheet DS00002165B](https://ww1.microchip.com/downloads/en/DeviceDoc/00002165B.pdf), §5.3 pp.53–54, Tables 5-1/5-2 and notes 5-9/5-10; REF_CLK OUT consumption and excluded Ethernet-component current.
- **S20:** Direct live [JLC C92115](https://jlcpcb.com/partdetail/TexasInstruments-TPS23753APWR/C92115), “Attributes”/Extended/assembly method; [LCSC C92115](https://www.lcsc.com/product-detail/C92115.html), “In-Stock”/quantity-price table, approximately **21:02 UTC**.
- **S21:** Direct live [JLC C510771](https://jlcpcb.com/partdetail/SkyworksSolutions-SI3402_BGMR/C510771), Extended/assembly method; [LCSC C510771](https://www.lcsc.com/product-detail/C510771.html), “In-Stock”/quantity-price table, approximately **20:59 UTC**.
- **S22:** Direct live [JLC C151246](https://jlcpcb.com/partdetail/Littelfuse-SMAJ58A/C151246), Extended/SMT; [LCSC C151246](https://www.lcsc.com/product-detail/C151246.html), “In-Stock”/quantity-price table, approximately **21:05 UTC**.
- **S23:** Direct live [JLC C2488](https://jlcpcb.com/partdetail/MDDMicrodiodeSemiconductor-MB10S50MIL/C2488), Basic/SMT, observed **21:07:09 UTC**; [LCSC C2488](https://www.lcsc.com/product-detail/C2488.html), “In-Stock”/quantity-price table, approximately **21:06 UTC**.
- **S24:** Direct live [JLC C8678](https://jlcpcb.com/partdetail/MDDMicrodiodeSemiconductor-SS34/C8678), Basic/SMT, observed **21:07:10 UTC**; [LCSC C8678](https://www.lcsc.com/product-detail/C8678.html), “In-Stock”/quantity-price table, approximately **21:06 UTC**.
- **S25:** Direct live [JLC C91754](https://jlcpcb.com/partdetail/HanRun-HY931147C/C91754), Extended/Wave Soldering, observed **21:07:10 UTC**; [LCSC C91754](https://www.lcsc.com/product-detail/C91754.html), **Out of Stock**, “Unit Price (Reference Only)”, approximately **21:03 UTC**.
- **S26:** Direct live [LCSC C12074](https://www.lcsc.com/product-detail/C12074.html), identity, “In-Stock”/quantity-price table, approximately **21:03 UTC**.
- **S27:** JLC public searches, all inconclusive JS-dependent shells: [TPS23753APWR control](https://jlcpcb.com/parts/componentSearch?searchTxt=TPS23753APWR), [HA3802](https://jlcpcb.com/parts/componentSearch?searchTxt=HA3802), [835-01041FC](https://jlcpcb.com/parts/componentSearch?searchTxt=835-01041FC), [FA2924](https://jlcpcb.com/parts/componentSearch?searchTxt=FA2924), [POE13P-100LB](https://jlcpcb.com/parts/componentSearch?searchTxt=POE13P-100LB), [7499210121A](https://jlcpcb.com/parts/componentSearch?searchTxt=7499210121A), [MP8011](https://jlcpcb.com/parts/componentSearch?searchTxt=MP8011). Search failure is not a zero-stock measurement.
