# ATT-378 — PHY, RMII clock, layout and critical J_POE BOM research

Date: **2026-09-29**. Scope: **Q2, Q5, Q7, Q8, Q9 and the critical PHY/J_POE BOM**. Research findings and proposed constraints; not a released schematic or fabrication approval.

## 1. Outcome and evidence boundaries

| Question | Finding | Remaining release gate |
| --- | --- | --- |
| Q2 — PHY | Retain **Microchip LAN8720AI-CP-TR, C17146**, 24-QFN with exposed ground pad, 4 × 4 mm. Current JLC listing is **Extended**, not Basic. | Actual footprint, power/strap wiring and assembly BOM review. |
| Q5 — clock | PHY-to-Core clock direction is implementable: **LED2/nINTSEL pin 2 low → nINT/REFCLKO pin 14 outputs 50 MHz**, using 25 MHz at XTAL1/XTAL2. **Pin 18 is TXD1**. | LAN8720A output-clock timing is explicitly outside the RMII specification; close an end-to-end timing analysis against the P4. |
| Q7 — stack | Four layers remain a reasonable proposal. **JLC04161H-7628 has 0.21040 mm outer prepreg, not a 0.21 mm core**; its central dielectric core is 1.065 mm. | Select the exact suffix/order options and retain calculator output. Isolation topology must precede plane zoning. |
| Q8 — mechanics | Historical 60 × 35 mm / 8 mm top envelope does **not** accommodate a recorded 13.5 mm jack. Later PoE 75 × 40 and Core 60 × 45 dimensions are unmerged branch-era context. | Shared outline/hole/height contract, jack drawing and a real mated connector stack. |
| Q9 — routing | Use **100 Ω differential for PHY-to-magnetics MDI pairs**; RMII is **single-ended**, provisionally 50 Ω with source-side damping. | No calculated width/gap is established here. ±0.5 mm MDI intra-pair mismatch is a proposed project constraint, not a manufacturer limit proved by this pass. |
| J_POE | **C2935956 is a real 16-pin header rated 1 A/contact**. **C725342 is not a socket: both current catalogs identify an HGSEMI LM78L05ACM/TR regulator.** | A genuine female mating PN, manufacturer compatibility, pin numbering, engagement, height and derated current remain unresolved. |

Read **first**, in the requested order, the consolidated context and original May 20 design document. The original spec fixes P4, 802.3af, modular boards and PoE ownership of the PHY; it excludes a full CE/FCC epic but still requires electrically functional boards and physical smoke/functional acceptance. Historical decisions in the context are not promoted to manufacturer facts. [C1, C2]

This pass retrieved ATT-378 and **every description/comment** for ATT-399/400/401/403/352/353/355/350/376. All comment responses had `hasNextPage: false`: seven tickets have one sync notice each, ATT-350 has **56** comments, ATT-376 has **2**. ATT-350's saved one-line JSON was decoded in full; screenshots were not independently visually inspected. Earlier primary tickets already covered by the context agent were not redundantly reread. No issues were mutated and no subagents were used.

Available evidence: official Microchip PDF; official Espressif P4 documentation, datasheet and versioned driver source; official JLC stack/calculator pages; current JLC/LCSC part pages; YXC manufacturer family PDF; DEALON manufacturer drawing hosted by LCSC. `pcbparts`, board catalog and Context+ tools are unavailable. Supplier data below is a **September 29 lookup**, not guaranteed order-time availability. PDF skill was loaded; text PDFs were extracted with `pdftotext`, image-only YXC/DEALON sheets with OCR. OCR-derived details are identified; unresolved dimensions are not inferred from a distorted text rendering.

## 2. Updated linked-ticket decisions and gaps

| Ticket; current state | Description/all-comments findings relevant to PoE |
| --- | --- |
| [ATT-399](https://linear.app/attraccess/issue/ATT-399); Canceled | GPIO1–4 C6 reset/boot/UART assignment still needs LP-IO validation at 921600 baud; NFC I2C GPIO52/53 conflicts with SDIO; flash 33 Ω at 80 MHz is TBV. No technical resolution in its sole sync comment. Do not treat the Core map as locked. |
| [ATT-400](https://linear.app/attraccess/issue/ATT-400); Canceled | Proposes placement tuning, decouplers within 2 mm of VDD, power-loop cleanup and removal of `--ignore-warnings`; adds a 3V3 LED/1 kΩ. Sole sync comment supplies no clean-DRC result. Description's claim that the schematic is correct is not an independent electrical audit. |
| [ATT-401](https://linear.app/attraccess/issue/ATT-401); Canceled | Explicitly labels 0.18/0.15 mm MIPI/USB geometry and 0.18 mm RMII/SDIO/QSPI widths **placeholders**. Requires calculator confirmation and first-fab impedance coupon. No measurements in the sole comment. Its $20 coupon cost is a historical ticket claim, not a fresh quote. |
| [ATT-403](https://linear.app/attraccess/issue/ATT-403); Canceled | GT911 INT on GPIO33/10 kΩ and RST on GPIO34 remain working assumptions pending panel selection and duplicate-pull check. These GPIOs overlap possible RMII TX assignments in current Espressif documentation; allocation needs joint reconciliation. No resolved values in its sole comment. |
| [ATT-352](https://linear.app/attraccess/issue/ATT-352); Canceled | DC board specifies 5–32 V input, 5 V/2 A design, ≥1 A physical test, parallel barrel/terminal inputs, protection and Core diode-OR interface. Sole sync comment contains no selected converter or measurements. Buck-only 5 V input → regulated 5 V after protection/mux losses remains a dropout issue; the ticket does not resolve it. |
| [ATT-353](https://linear.app/attraccess/issue/ATT-353); Canceled | No panel selected; 25 V/~20 mA backlight string is approximate, not an established complete panel input-power budget. I2C voltage/pulls, lane count, FFC and boost PN remain research inputs. Sole sync notice adds nothing. |
| [ATT-355](https://linear.app/attraccess/issue/ATT-355); Canceled | Stub specifies P4/C6 SDIO, WiFi and minimum display init. **LED animations are out of scope**. Its sole comment contains no adopted LED-duty limiter, Ethernet configuration, measured load or successful bring-up. The earlier context's LED-duty proposal therefore has no implementation evidence here. |
| [ATT-350](https://linear.app/attraccess/issue/ATT-350); Done | User superseded discrete-coil preference by requiring JLC delivery with antenna already present; approved PCB copper antenna on May 23 (`28a76161-4f13-4263-878c-a29eadc84c0f`). Progressed square→circular spiral; final May 24 correction `d4efeac8` fixed gerber rotation loss/starburst and moved J1 to **bottom**. Reported circular antenna Ø22 mm, 9 turns, 0.4/0.3 mm trace/gap; C2 became 100 pF; 24 LEDs remain. These are design/agent assertions, **not measured RF or power results**. Earlier comment says per-LED decoupling collapsed to six group capacitors. Standard PCBA discussion corrected its claim that QFN-40 alone forces Standard; don't generalize Extended status into Standard-only eligibility. |
| [ATT-376](https://linear.app/attraccess/issue/ATT-376); Backlog | Description and May 23 handover still discuss hand-populated discrete ANT1 and deferred RF tuning. This is partly stale after ATT-350's later PCB-antenna direction. Measured Q/resonance, enclosure dielectric, LED noise/shielding and actual MIFARE/NTAG range remain genuinely open. No physical result in either comment. |

**Power implications:** none of these tickets resolves the contradictory ≥2 A converter requirement, historical 1 A MP9486A choice, 2.760 A peak in ATT-377, or 2.230 A typical/3.690 A peak in the Core draft. Keep them as separately attributed, unmeasured budgets. Display selection and 24-LED duty policy must be settled before assigning connector/converter headroom. A pair of 1 A contacts cannot validate a 2.760–3.690 A +5 V peak. [C1 §§6.1–6.3]

## 3. Q2/Q5 — authoritative LAN8720A pin and strap correction

Source: **Microchip DS00002165B**, §2.1/Table 2-8 (printed p.12), pin descriptions Tables 2-1–2-7, §§3.7–3.8. Use the actual tables/headings: some internal cross-references in this revision point to stale page/section numbers. [M1]

| Physical pin | Function | Design consequence |
| --- | --- | --- |
| 1 | VDD2A | 3.3 V analog and internal-regulator supply; local bypass. |
| 2 | LED2/nINTSEL | **Pull low for REFCLKO**. 10 kΩ pull-down is illustrated in Figure 3-11. Low strap makes LED2 **active high**. |
| 3 | LED1/REGOFF | Low/default enables internal 1.2 V regulator; LED1 active high. High to VDD2A disables regulator and requires external VDDCR; LED1 active low. |
| 4, 5 | XTAL2; XTAL1/CLKIN | 25 MHz fundamental crystal between pins 4/5 for output-clock mode. Single-ended 25 MHz oscillator drives pin 5 with pin 4 unconnected. |
| 6 | VDDCR | Internal 1.2 V core rail when REGOFF=0; **1 µF + 470 pF in parallel to ground**. Never wire to 3.3 V or 5 V. |
| 7, 8 | RXD1/MODE1; RXD0/MODE0 | PHY→Core outputs after reset, configuration inputs during reset. |
| 9 | VDDIO | Use the 3.3 V logic domain for P4 interface; variable I/O capability is not a reason to power analog supplies at 1.6 V. |
| 10 | RXER/PHYAD0 | PHY address strap, default **0**. Low→address 0, high→address 1; this is not LED2. RXER does not cross the frozen connector. |
| 11 | CRS_DV/MODE2 | Third mode strap and PHY→Core output. |
| 12, 13 | MDIO; MDC | Bidirectional management data and Core→PHY management clock. |
| **14** | **nINT/REFCLKO** | Output 50 MHz to J_POE pin 11 with nINTSEL=0; nINT is then unavailable. |
| 15 | nRST | Active-low Core reset; must meet startup and strap timing. |
| 16, 17, **18** | TXEN; TXD0; **TXD1** | Core→PHY; **18 is not REFCLKO**. |
| 19 | VDD1A | 3.3 V analog supply with bypass. |
| 20, 21 | TXN; TXP | MDI differential channel 1. |
| 22, 23 | RXN; RXP | MDI differential channel 2. |
| 24 | RBIAS | **12.1 kΩ ±1% to ground**, nominal 1.2 V/~1 mW dissipation (Table 2-6). |
| Exposed pad | VSS | Ground plane with via array; mandatory electrical pad, not merely thermal decoration. |

### Proposed explicit configuration

- **nINTSEL=0 at pin 2**; do not put its pull resistor on pin 14. Pin 14 is the running clock output, not the strap input.
- **REGOFF=0 at pin 3** for internal regulator operation. Do not use REGOFF to select clock direction. Manufacturer default is internal pull-down; augment externally when LED/loading could affect sampling.
- **PHYAD0=0 at pin 10** for a single PHY, matched by firmware address 0. Hardware permits 0/1; software may subsequently set the 5-bit PHYAD field in Special Modes Register 18 after communication is established (§3.7.1). Do not accidentally hard-ground RXER as an output; use a pull-down.
- **MODE[2:0]=111** on pins 11/7/8 for all-capable auto-negotiation (§3.7.2/Table 3-4). Validate external pulls and the P4's reset-time loading; internal defaults alone do not guarantee a loaded strap.
- Strap pull-ups normally reference **VDDIO**, but **REGOFF/nINTSEL and LED pull-ups reference VDD2A** (§3.7 Note 3-3, §3.8.1). With the intended 3.3 V supplies this still needs explicit net naming.
- LED1/LED2 active-high wiring must suit the actual jack LEDs. A prewired active-low magjack LED path cannot be copied unchanged into the selected low-strap configuration. LED2 is **speed**, not a dedicated PHY-address indicator.

**25→50 is internal clock synthesis, not a divisor:** the architectural diagram includes the PLL (Figure 1-2), and §3.7.4.2/Figures 3-8/3-9 explicitly derive 50 MHz from a 25 MHz crystal or oscillator. Do not feed 50 MHz into CLKIN while configured for this 25 MHz output-clock mode. With nINTSEL=1, pin 14 becomes nINT and **50 MHz must instead enter pin 5**. [M1]

**Loss of nINT:** output-clock mode consumes the multiplexed pin. The frozen J_POE has no PHY IRQ anyway. MDIO link polling is supported by Espressif; it does not recover a hardware interrupt pin or validate clock timing. The versioned v5.4.2 LAN87xx driver reads link/speed via registers and identifies LAN8720A support; it uses a **150 µs** default reset assertion because Espressif observed the datasheet minimum needed extension. This source is evidence for that version, not a lock of firmware-v2's eventual IDF version. [E3]

### Reset/power details that affect straps

DS00002165B §5.5.3/Table 5-8: hardware reset after power-up is required; nRST low **≥100 µs**, deassertion **≥25 ms after all external supplies reach 80%**, monotonic reset release; straps setup **≥200 ns**, hold **≥1 ns**. §3.8.2 warns not to drive inputs high before PHY power is applied. Account for Core continuing on DC while the PoE daughter/PHY is off; clock/data/reset/MDIO back-powering is an unresolved system behaviour. Do not interpret modular/hot-swappable prose as proof of live-insertion electrical protection. [M1, C2]

## 4. P4 compatibility: supported clock direction, unresolved timing closure

Microchip's §3.7.4.2 warning is unambiguous: **“REF_CLK Out Mode is not part of the RMII Specification. Timing in this mode is not compliant with the RMII specification.”** It requires a MAC/LAN8720 timing analysis. [M1]

| LAN8720 output-clock-mode parameter | Datasheet Table 5-9, §5.5.4.1 (printed p.60) |
| --- | --- |
| REFCLKO nominal cycle | 20 ns / 50 MHz |
| Clock high/low time | Each 40–60% of period |
| RXD[1:0], RXER, CRS_DV output valid after rising REFCLKO | Maximum **5.0 ns** |
| Those outputs hold after rising REFCLKO | Minimum **1.4 ns** |
| TXD[1:0], TXEN setup to rising REFCLKO | Minimum **7.0 ns** |
| TXD[1:0], TXEN input hold | Minimum **2.0 ns** |
| Timing load qualification | Designed for **10–25 pF** system load (Note 5-24) |

Do not substitute the **REF_CLK input-mode** table: it has different 14 ns output-valid, 3 ns output-hold, 4 ns TX setup and 1.5 ns TX hold numbers. A short trace or ±5 mm length rule alone does not prove either timing interface.

Official **ESP-IDF stable P4 page resolved to v6.1** during this lookup, “Configure MAC and PHY”: select `EMAC_CLK_EXT_IN` for a PHY-derived reference. P4 clock-input IO_MUX choices are **GPIO32/44/50**, not the original ESP32's GPIO0 convention. REF_CLK must be stable during PHY/MAC access; keep it short and away from RF and inductors. The page also lists fixed RMII data mappings (TXEN 33/40/49; TXD0 34/41; TXD1 35/42; CRS_DV 28/45/51; RXD0 29/46/52; RXD1 30/47/53). These overlap outstanding Core allocations. [E1]

The official **P4 datasheet v0.7 §4.2.2.12, pp.78–79** confirms external PHY/RMII capability and three GPIO groups; §2.3.5/Appendix A give pin multiplexing. **A numerical P4 RMII external-clock setup/hold/clock-to-output table was not located in this pass.** Generic RMII support is insufficient to waive Microchip's warning. Capture silicon revision, final GPIO/IO_MUX path, IDF version, P4 timing limits, clock input threshold/jitter/load, both boards' propagation delays and connector parasitics before declaring compatibility. [E2]

Timing closure must cover PHY RX→MAC capture and MAC TX→PHY capture independently, including clock flight to Core and TX flight back, min/max driver delays, input setup/hold, slew, damping resistor/load and PVT uncertainty. Use the actual sampling/launch edges, not a presumed half-cycle. If it fails, revisit clock architecture deliberately; this research does not silently overturn the approved PHY→Core source direction.

## 5. Crystal: exact catalog identity corrected, not electrically released

**C20617602 currently identifies YXC `XL1SI-111-25M`**, not historical `XG1SI-111-25M`. Current supplier specifications: 25 MHz, **20 pF load**, **±10 ppm initial tolerance**, **±20 ppm temperature stability**, −40 to +85 °C, **60 Ω ESR**, **SMD5032-4P**. LCSC shows 2,855 stock, USD 0.2846 at 5+, 0.2256 at 50+, 0.2003 at 150+, 0.1688 at 1,000+, 0.1547 at 2,000+, 0.1463 at 5,000+. These are LCSC numbers, not JLC assembly stock/pricing. [S5]

The LCSC datasheet link supplies a **manufacturer-authored YXC YSX531SL family sheet**. The same family sheet is available directly from YXC. It is image-only and was OCR-read: 5.0 × 3.2 × 0.9 mm, fundamental AT crystal; selectable 10/20 pF or specified load, ±10/20 ppm or specified tolerance, ±20 ppm or specified stability, −40/+85 °C or specified range, shunt capacitance ≤5 pF, 10–200 µW drive (100 µW typical), aging ≤±3 ppm/year; ESR 40–60 Ω for 13–25 MHz. **The primary sheet does not explicitly decode or identify `XL1SI-111-25M`.** Exact ordering-code mapping and four-pad case/active-pin assignment therefore remain **manufacturer confirmation required**; a family specification is not an exact-PN certificate. [Y1, Y2]

There is a substantive compatibility gap, not just a spelling error:

- Microchip §5.6.1/Table 5-13 **300 µW circuit**: typical CL=20 pF, ESR max **30 Ω**, crystal supporting the stated drive. Supplier's 60 Ω part/family drive range does not establish this configuration.
- Microchip §5.6.2/Table 5-14 **100 µW circuit**: CL **8–12 pF**, ESR ≤80 Ω, shunt capacitance ≤5 pF, **500 Ω ±1% in series with XTAL2**. The catalog crystal's **20 pF** CL does not meet that stated load range.
- Historical **18 pF ×2** capacitors are not equivalent to a 20 pF crystal load. Use `CL ≈ C1*C2/(C1+C2) + Cstray`; equal 18 pF caps contribute 9 pF before the effective pin/PCB stray contribution. Microchip gives ~3 pF/pin and explicitly requires PCB/pin capacitance in sizing (§5.6 Notes 5-30/5-36). Neither 18 pF nor a replacement value is released without that budget.
- Frequency budget includes initial error, temperature, aging **and load pulling**; do not sum only 10+20 ppm and announce success. Microchip requests a ±50 ppm total budget in its crystal tables/notes.

**Recommendation:** keep Y1 **unlocked**. Obtain an exact manufacturer-qualified crystal satisfying one Microchip circuit, then lock full MPN, CL, ESR, drive, aging, temperature, package/pad map and load capacitors together. Current C20617602 is a sourcing lead, not a verified drop-in. No replacement exact-PN/JLC identity is invented here.

## 6. Critical PHY/support BOM and regulator boundaries

Current supplier identity checks below used LCSC's public product/specification metadata. Values/packages are verified at supplier level; generic manufacturer compliance/derating sheets were not independently qualified for every passive. **Live JLC class, stock and price are unknown for these passive rows**; the context's May Basic/Preferred assertions are historical only.

| Role | Current MPN / LCSC | Verified value/package; disposition |
| --- | --- | --- |
| U_PHY | Microchip LAN8720AI-CP-TR / **C17146** | 4 × 4 mm QFN-24-EP, −40/+85 °C; selected research candidate. Live JLC Extended, SMT, Economic and Standard, MSL 3. |
| R_RBIAS | UNI-ROYAL **0402WGF1212TCE / C25852** | **12.1 kΩ ±1%, 0402, 62.5 mW, 50 V**, ±100 ppm/°C; fits Microchip nominal bias requirement. Place close to pin 24/quiet ground. |
| MDI terminations, ×4 | UNI-ROYAL **0402WGF499JTCE / C25120** | **49.9 Ω ±1%, 0402, 62.5 mW, 50 V**. Figure 3-18 has four 49.9 Ω resistors and magnetics supply/bypass. Check exact jack internal network and power derating before release. |
| MDIO pull-up | UNI-ROYAL **0402WGF1501TCE / C25867** | **1.5 kΩ ±1%, 0402, 62.5 mW, 50 V**; candidate from historical plan. Final value needs bus load/rise-time and low-level sink check; not asserted as a Microchip-mandated value here. |
| Strap pulls | UNI-ROYAL **0402WGF1002TCE / C25744** | **10 kΩ ±1%, 0402, 62.5 mW, 50 V**; suitable starting value consistent with LED strap illustrations. Count/directions depend on final loading. |
| C_VDDCR | Samsung **CL05A105KA5NQNC / C52923** | **1 µF ±10%, 25 V, X5R, 0402**; paired with 470 pF per Microchip. Verify effective capacitance/temperature. |
| C_VDDCR_HF | FH **0402B471K500NT / C1537** | **470 pF ±10%, 50 V, X7R, 0402**; not the 100 nF shared wrapper. |
| Local 3.3 V/VDDIO bypass | Samsung **CL05B104KB54PNC / C307331** | **100 nF ±10%, 50 V, X7R, 0402**; candidate at each supply, short ground path. Microchip power diagram labels CBYPASS; final bulk/bead values remain design inputs. |
| Historical crystal load caps | FH **0402CG180J500NT / C1549** | **18 pF ±5%, 50 V, C0G, 0402**; real identity, **load value not approved** (§5). |
| Y1 | YXC XL1SI-111-25M / **C20617602** | Supplier identity corrected; crystal-circuit qualification remains open. |
| 3.3 V regulator | Historical AMS1117-3.3 / C6186 lead | Exact vendor/version, stability capacitor/ESR, thermal/temperature/load margins and current assembly availability **not requalified here**. Historical tab-to-GND error was corrected to VOUT in context; don't recreate it. |

With REGOFF low, the PHY's internal regulator only generates **1.2 V VDDCR**; it does not convert J_POE 5 V to the required 3.3 V analog/I/O supply. Keep a local qualified 3.3 V rail, short analog/bias returns, and the exposed-pad ground vias. VDDCR is not a general peripheral power output. Supply-current tables exclude magnetics/optional LEDs; §5.3.2 Notes 5-9/5-10 separately identify magnetics current (typically 41 mA in 100BASE-TX and 100 mA in 10BASE-T). Do not equate device-only typical power with total daughter load. [M1 Tables 2-6/2-7, Figures 3-16/3-18, §5.3.2]

**Regulatory/component boundary:** LCSC RoHS/RoHS3 and JLC ROHS catalog tags are declarations about parts, not CE/FCC, isolation, surge or assembled-device certification. Microchip's Figure 3-18 shows **1000 pF / 3 kV** and 75 Ω termination around magnetics; it does not identify a certified Y2 MPN. Do not replace a barrier/chassis capacitor with generic C0402 or infer Y classification from voltage alone. Exact safety-cap PN, approvals, creepage geometry, shield/chassis relationship and PD power isolation stay with the electrical/topology research. A low-impedance ground bridge across a claimed isolation boundary is not a harmless stackup detail. [M1, C1 §6, C2 §1]

### Live PHY sourcing snapshot — visible data only

| Supplier and identity | Current visible classification/eligibility | Current visible stock and USD unit-price tiers |
| --- | --- | --- |
| JLC **C17146, LAN8720AI-CP-TR** | **Extended**; QFN-24-EP(4x4); SMT; Economic and Standard; MSL 3 | **Stock unknown; price unknown**: fetched page did not display those fields. |
| LCSC **C17146, LAN8720AI-CP-TR** | QFN-24-EP(4x4), industrial −40/+85 °C | **33,390**; 1+ **1.0242**, 10+ **0.8896**, 30+ **0.7616**, 100+ **0.6845**, 500+ **0.6451**, 1,000+ **0.6270**. |
| JLC **C45223, LAN8720A-CP-TR** | **Extended**, Standard Only, SMT, MSL 5; package label QFN-24, description QFN-24-EP(4x4) | **Stock unknown; price unknown** on fetched page. |
| LCSC **C45223, LAN8720A-CP-TR** | QFN-24-EP(4x4), extended commercial **0/+85 °C** | **32,387**; 1+ **0.8027**, 10+ **0.6828**, 30+ **0.5991**, 100+ **0.5302**, 500+ **0.4448**, 1,000+ **0.4317**. |

These are separate inventory pools; **do not copy 33,390 into a JLC stock column**. Historical 26,628/$1.01 is superseded as a live lookup. Primary manufacturer Product Identification System (M1 printed p.75) confirms `I` industrial versus no `I` commercial, `TR` tape/reel, and **`ABC` sawn SQFN versus unsuffixed punch QFN**. LCSC's C45223 alternative table lists LAN8720A-CP-TR-ABC (2,286/$1.139) and LAN8720AI-CP (1,330/$1.956), but does not expose their LCSC IDs in fetched text: **IDs and price quantities unknown**. Those rows are leads only. Package suffix and grade must be reviewed; catalog “Direct”/“Similar” labels do not prove land-pattern interchangeability. [M1, S1–S4]

### Supplemental live passive sourcing — 2026-09-29, 21:32 UTC parent / 21:33 UTC follow-up

This later lookup completes the seven passive sourcing rows below; the earlier observation that their live fields were unknown is retained as the initial-pass record. **JLC library classification and LCSC inventory/prices are separate observations.** JLC stock/prices remain unknown; no LCSC count is assigned to JLC. Numerical P4 timing and all prior electrical-qualification gaps remain unchanged.

| LCSC code / exact MPN | Current JLC library | Visible LCSC stock | Visible USD unit-price tiers |
| --- | --- | --- | --- |
| **C25852 / 0402WGF1212TCE** — 12.1 kΩ | **Extended** | **93,600** | 100+: **0.0020**; 1,000+: **0.0016**; 3,000+: **0.0014**; 10,000+: **0.0013**; 50,000+: **0.0011**. |
| **C25120 / 0402WGF499JTCE** — 49.9 Ω | **Basic** | **885,200** | 100+: **0.0026**; 1,000+: **0.0020**; 3,000+: **0.0017**; 10,000+: **0.0015**; 50,000+: **0.0013**. |
| **C25867 / 0402WGF1501TCE** — 1.5 kΩ | **Basic** | **1,427,900** | 100+: **0.0027**; 1,000+: **0.0022**; 3,000+: **0.0018**; 10,000+: **0.0017**; 50,000+: **0.0013**. |
| **C25744 / 0402WGF1002TCE** — 10 kΩ | **Basic** | **8,099,500** | 100+: **0.0034**; 1,000+: **0.0027**; 3,000+: **0.0023**; 10,000+: **0.0021**; 50,000+: **0.0017**. |
| **C52923 / CL05A105KA5NQNC** — 1 µF | **Basic** | **Out of Stock**; numeric count not displayed | **Reference only:** 50+: **0.0100**; 500+: **0.0075**; 1,500+: **0.0064**; 10,000+: **0.0047**; 20,000+: **0.0044**; 50,000+: **0.0042**. |
| **C1537 / 0402B471K500NT** — 470 pF | **Extended** | **368,900** | 100+: **0.0036**; 1,000+: **0.0027**; 3,000+: **0.0023**; 10,000+: **0.0019**; 50,000+: **0.0016**. |
| **C307331 / CL05B104KB54PNC** — 100 nF | **Basic** | **Out of Stock**; numeric count not displayed | **Reference only:** 100+: **0.0097**; 1,000+: **0.0075**; 3,000+: **0.0065**; 10,000+: **0.0057**; 50,000+: **0.0054**; 100,000+: **0.0052**. |

For C25120, C25867 and C1537, the table uses the lower currently displayed promotional unit price, confirmed by the corresponding total amount. The same pages also show original prices: C25120 **0.0027/0.0021/0.0018/0.0016** at 100/1,000/3,000/10,000+; C25867 **0.0029/0.0023/0.0019/0.0018** at those tiers; C1537 **0.0038/0.0029/0.0024/0.0020/0.0017** at 100/1,000/3,000/10,000/50,000+. Prices are a dated display snapshot, not a reserved quote. Minimum/order multiple is **100/100** for all rows except C52923 (**50/50**).

**Provenance:** C25852 **Extended** and C52923 **Basic** come from the parent session's fresh JLC observations at **21:32 UTC**, as supplied in the follow-up request. Their LCSC stock/price blocks were extracted from the complete saved responses `/Users/jappy/.local/share/opencode/tool-output/tool_0ef153e5e001mHa4CAYWSfoIsZ` (C25852) and `/Users/jappy/.local/share/opencode/tool-output/tool_0ef153f5a001J64Ao4jgqv6VPn` (C52923). The remaining five JLC/LCSC pairs were directly fetched beginning **21:33:32 UTC**, extracting only the product classification and stock/price portions of the public pages. Both out-of-stock pages explicitly label prices **“Reference Only”**.

Supplemental source links: JLC [C25852](https://jlcpcb.com/partdetail/UNI-ROYAL-0402WGF1212TCE/C25852), [C25120](https://jlcpcb.com/partdetail/UNI-ROYAL-0402WGF499JTCE/C25120), [C25867](https://jlcpcb.com/partdetail/UNI-ROYAL-0402WGF1501TCE/C25867), [C25744](https://jlcpcb.com/partdetail/UNI-ROYAL-0402WGF1002TCE/C25744), [C52923](https://jlcpcb.com/partdetail/SamsungElectro-Mechanics-CL05A105KA5NQNC/C52923), [C1537](https://jlcpcb.com/partdetail/FH-0402B471K500NT/C1537), [C307331](https://jlcpcb.com/partdetail/SamsungElectro-Mechanics-CL05B104KB54PNC/C307331); LCSC [C25852](https://www.lcsc.com/product-detail/C25852.html), [C25120](https://www.lcsc.com/product-detail/C25120.html), [C25867](https://www.lcsc.com/product-detail/C25867.html), [C25744](https://www.lcsc.com/product-detail/C25744.html), [C52923](https://www.lcsc.com/product-detail/C52923.html), [C1537](https://www.lcsc.com/product-detail/C1537.html), [C307331](https://www.lcsc.com/product-detail/C307331.html).

## 7. Q7/Q9 — corrected stack and routing constraints

Official JLC “Controlled Impedance PCB Parameters and Stackup”, **4-Layer → JLC04161H-7628**: [J1]

| Layer/material | Published thickness | Dielectric information |
| --- | --- | --- |
| L1 copper | 0.035 mm | Outer 1 oz option represented by this row |
| **7628 ×1 prepreg, L1–L2** | **0.21040 mm** | **Er 4.4** |
| L2 copper | 0.0152 mm | Inner copper |
| **L2–L3 core dielectric** | **1.065 mm** | **Er 4.6**; row also calls core including copper 1.1 mm H/HOZ |
| L3 copper | 0.0152 mm | Inner copper |
| 7628 ×1 prepreg, L3–L4 | 0.21040 mm | Er 4.4 |
| L4 copper | 0.035 mm | Outer copper |

The family name **JLC04161H is insufficient**: the official page also has 3313 (0.09940 mm outer prepreg, Er 4.1), 1080 (0.07640 mm, Er 3.91) and other suffixes. Solder-mask published parameters: above substrate 1.2 mil, above trace 0.6 mil, between traces 1.2 mil, Er 3.8. Lock stack suffix, thickness and copper options before geometry. Don't assume Core's selected order equals PoE's. [J1]

The official calculator exists at [J2]; its fetched interface explains inputs but supplies **no computed geometry**. **100 Ω width=unknown; gap=unknown; calculated impedance=unknown; coupon=not obtained.** ATT-378's 0.18/0.18 mm and ATT-401's placeholders are **not validated**. No uncomputed replacement dimensions are offered.

Required calculator record: four layers/1.6 mm; exact JLC04161H suffix; outer/inner copper options; **100 Ω edge-coupled differential**, L1 signal, L2 reference; chosen gap; solder mask and dielectric values; any coplanar copper clearance; calculated width/achieved impedance; fab tolerance and coupon results. A coplanar geometry cannot reuse an ordinary microstrip result unchanged.

Proposed routing rules, pending the actual topology and timing analysis:

1. Route **MDI TXP/TXN and RXP/RXN PHY→magnetics**, short, symmetrical and impedance-controlled, over a continuous PHY-side reference. Q9's “cable-side only” wording is misleading: PHY-to-transformer pairs are on the PHY side of the data isolation barrier. Cable-side jack/internal winding connections are a separate region.
2. Keep **≤0.5 mm intra-pair mismatch** as a project proposal; do not demand equal TX-pair and RX-pair total lengths without a reason. Preserve symmetry through breakout/vias and terminations; avoid switch-node/inductor coupling.
3. Route RMII/REF_CLK as **single-ended** signals with continuous ground return through both boards and J_POE. Budget **end-to-end delay/skew**, including connector, rather than only each board's local ±5 mm group rule. Do not describe RMII as differential pairs.
4. Damping goes at the **source**: P4 TXD/TXEN on Core; PHY RXD/CRS_DV and REFCLKO on PoE. Historical Core 33 Ω and PoE 10 Ω are initial choices, not jointly validated values. Putting every resistor near Core J_POE would put receive/clock damping at the receiving end. Select values from drive/trace impedance and measurements.
5. L2 can be continuous within the PHY/SELV region while copper is excluded across a real isolation zone. Do not route high-speed signals over plane gaps, and do not merge cable power return/chassis/PHY ground to satisfy a generic “continuous plane” instruction. Isolation topology is unresolved in the context.
6. Review **exported Gerber copper**, complete net connectivity and real DRC. ATT-350's render/export divergence and the PoE's historically incomplete PHY routing make local render/green ignored-warning lint inadequate evidence. [C1, ATT-350]

## 8. Q8/J_POE — connector identity, current and mechanical blockers

Frozen historical signal contract remains **16 pins**: 1/2 +5 V; 3/4/15 ground; 5 TXD0; 6 TXD1; 7 TXEN; 8 RXD0; 9 RXD1; 10 CRS_DV; 11 REF_CLK; 12 MDIO; 13 MDC; 14 nRST; 16 NC. PHY→Core clock/data direction does not change. See C1 §5 and its historical CONNECTORS.md source for numbering.

| Check | Evidence / result |
| --- | --- |
| Core male header | **DEALON DW127R-22-16-23 / C2935956**. Current JLC/LCSC agree 16 pins, 2×8, **1.27 mm pitch and row spacing**, THT, square pins. |
| Header dimensions/current | Catalog: insulation height **1 mm**, mating pin length **3 mm**, solder-tail length **2.3 mm**, **1 A/contact**. Manufacturer drawing **DW127R-22-XX-23** confirms 1.0 A/contact and 0.40 mm square pin (OCR); generic family drawing, XX=16 selected by catalog. |
| Assembly | Current JLC identifies **Extended**, **Wave Soldering**, Economic and Standard. This is fresh eligibility evidence for this header, not proof all daughter parts/order configurations use the same process. |
| Current LCSC sourcing | **100** stock, minimum/multiple 5; current discounted price displayed **$0.0982 at 5+** (undiscounted $0.1033). JLC stock/price **not visible**. |
| Proposed PoE socket C725342 | **Contradicted**, not merely unchecked. Both current JLC and LCSC identify **HGSEMI LM78L05ACM/TR**, SOP-8, 5 V/100 mA regulator. It has no connector pitch/mating/current rating. Do not order it for J_POE. |
| Actual female mating MPN/LCSC | **Unknown / not selected**. No primary manufacturer mating-pair confirmation was obtained. |
| Mated stack height | **Unknown**. Header insulation/mating length cannot by itself establish socket height, insertion depth or board-to-board spacing; historical **4 mm** is not validated. |
| Keying/pin-1 orientation | **Not checked against an actual pair**. Bare 2×8 pitch is not evidence of keyed wrong-module protection promised in the original spec. Verify board-side views and mirrored numbering. |
| 2 A continuous adequacy | **Not established**. Two positive contacts at 1 A each carry exactly 1 A/contact only with ideal sharing; no margin for imbalance, temperature, tolerance or derating. Female contact rating/thermal limit unknown. Three grounds do not fix the positive-contact bottleneck. |

C725342's invalid identity blocks mating validation, so there is **no verified header/socket pair to approve**. Remaining manufacturer fields: female accepted pin size, minimum/maximum engagement, bottoming clearance, coplanarity, contact resistance and current derating with adjacent loaded contacts, voltage/temperature rating, plating compatibility, cycle life and latch/key geometry. Determine peak-duration and hot-plug requirements separately. [S6–S9, D1]

### Mechanical reconciliation required

Historical shared envelope: PoE **60 × 35**, top **8 mm**, bottom 1.5 mm; M3 holes (3,3)/(57,3)/(3,32)/(57,32). The context records jack height **13.5 mm**: exceeds top budget by **5.5 mm**. Edge overhang may address horizontal fit; it does not reduce vertical height. Exact jack drawing/PCB seating datum and protrusions were not revalidated in this PHY-focused pass. [C1 §§3,5]

Later PoE branch enlarged to **75 × 40 mm**; Core comments to **60 × 45 mm**. The context establishes PoE PR #978 closed **unmerged**, and this old worktree contains no hardware source at HEAD. Neither dimension is a reconciled shared mechanical release here. Core 60×45 remains unmerged design context, not acceptance of a paired enclosure stack.

A shared revision must reconcile outline, holes, physical connector position/orientation on both boards, real jack and regulator/inductor body heights, mating gap, bottom parts and solder tails, standoffs, cable insertion/removal envelope and shield clearance. Keep PoE/beeper side-by-side per historical layout intent, but verify actual stack interference. A semver-minor outline proposal cannot override connector signal-map breaking-change rules or prove fit.

## 9. Concrete follow-up gates for ATT-351 consumers

1. Correct the LAN8720 physical symbol/footprint mapping, straps and supply rails against M1; preserve pin-14 REFCLKO and pin-18 TXD1.
2. Qualify an exact crystal and associated circuit, including drive/ESR/load caps, before locking Y1. Current C20617602 is not released.
3. Obtain P4 numerical timing limits and close PHY-clock RMII timing over **both boards and the actual connector**; lock firmware GPIO map/clock mode/version and reset sequencing.
4. Replace the **wrong C725342 socket identity** with a manufacturer-confirmed mating pair; assess **≥2 A** with derating and the actual peak budget. Recheck JLC order assembly process/stock.
5. Select exact JLC stack suffix and obtain **100 Ω MDI / single-ended RMII** calculator geometry and first-fab verification; remove unverified placeholder dimensions from release docs.
6. Reconcile shared PoE/Core outlines and height/holes/mated stack, including the 8 versus 13.5 mm contradiction.
7. Resolve display/LED load and power topology with the companion electrical research; do not base connector qualification on ~1.4 A or “4 A from af” historical claims.
8. Require clean routing/export/DRC and physical MDIO/link/ping/traffic testing, including PHY off/Core DC-on state, reset strap sampling and thermal/current tests. No fetched ticket records those results.

## Sources and exact sections

- **C1:** `docs/research/2026-09-29-att-378-context.md`, read first, especially §§3–6 and S7–S17. Historical-source links and comment UUIDs are preserved there.
- **C2:** `docs/research/2026-05-20-attractap-pcb-tscircuit-design.md`, read second, §§1, 2.1–2.4, 4.4, 5.1–5.3.
- **M1:** [Microchip LAN8720A/LAN8720AI datasheet DS00002165B](https://ww1.microchip.com/downloads/en/DeviceDoc/00002165B.pdf), Figure 1-2; Tables 2-6/2-7/2-8; §§3.7.1–3.7.4.2, 3.8.1.1–3.8.1.2; Figures 3-16/3-18; §§5.3.2, 5.5.3–5.5.4.2, 5.6.1–5.6.2; Product Identification System printed p.75. Official product landing page returned HTTP 403; the official PDF was accessible. Revision B is the document inspected, not an assertion no newer revision exists.
- **E1:** [Espressif ESP-IDF P4 Ethernet documentation, v6.1](https://docs.espressif.com/projects/esp-idf/en/v6.1/esp32p4/api-reference/network/esp_eth.html), “Configure MAC and PHY”, input clock IO_MUX and RMII GPIO table, driver link polling. Retrieved through `stable`, which identified v6.1.
- **E2:** [Espressif ESP32-P4 datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-p4_datasheet_en.pdf), inspected v0.7, §4.2.2.12 pp.78–79, §2.3.5 and Appendix A.
- **E3:** [Espressif LAN87xx driver, ESP-IDF v5.4.2](https://github.com/espressif/esp-idf/blob/v5.4.2/components/esp_eth/src/phy/esp_eth_phy_lan87xx.c), `LAN87XX_PHY_RESET_ASSERTION_TIME_US`, supported models, `lan87xx_update_link_duplex_speed`, `esp_eth_phy_new_lan87xx`.
- **J1:** [JLC official controlled-impedance stackups](https://jlcpcb.com/impedance), “Prepreg dielectric constant”, “Solder mask Parameters”, “Core dielectric constant”, “4-Layer Impedance Control Stackup”, JLC04161H-7628/3313/1080 rows.
- **J2:** [JLC official impedance calculator](https://jlcpcb.com/pcb-impedance-calculator), introductory input description and calculator controls; **no calculation result obtained**.
- **S1/S2:** [JLC C17146](https://jlcpcb.com/partdetail/MicrochipTech-LAN8720AI_CP_TR/C17146) / [LCSC C17146](https://www.lcsc.com/product-detail/C17146.html), identity, specifications, JLC classification/eligibility, LCSC stock/price tiers.
- **S3/S4:** [JLC C45223](https://jlcpcb.com/partdetail/MicrochipTech-LAN8720A_CP_TR/C45223) / [LCSC C45223](https://www.lcsc.com/product-detail/C45223.html), commercial alternate, eligibility and alternative table.
- **S5:** [LCSC C20617602](https://www.lcsc.com/product-detail/C20617602.html), XL1SI-111-25M identity and exact supplier specifications, stock/price tiers; linked family sheet Y2.
- **Y1:** [YXC official YSX531SL family PDF](https://www.yxc.hk/uploadfiles/2026/02/YXC-YSX531SL.pdf), one-page “Specifications”, ESR and dimensions/land-pattern sections, OCR-read. Discovered via [official crystal catalog](https://www.yxc.hk/Crystal/). **Exact XL1SI ordering-code mapping not present.**
- **Y2:** [YXC manufacturer family sheet hosted by LCSC for C20617602](https://datasheet.lcsc.com/datasheet/pdf/810bcfc0115c1e6ec9cb681fd85b0fcc.pdf), same family/specification scope; OCR-read.
- **S6/S7:** [JLC C2935956](https://jlcpcb.com/partdetail/DEALON-DW127R_22_16_23/C2935956) / [LCSC C2935956](https://www.lcsc.com/product-detail/C2935956.html), header specifications, assembly eligibility and visible sourcing.
- **D1:** [DEALON DW127R-22-XX-23 manufacturer drawing hosted by LCSC](https://datasheet.lcsc.com/datasheet/pdf/e2a89b7f5a2ea4d484f4af61b4b511e6.pdf), “Technical Data / Electrical” and family pin/dimension drawing, OCR-read; not a mating-pair drawing.
- **S8/S9:** [JLC C725342](https://jlcpcb.com/partdetail/HGSEMI-LM78L05ACM_TR/C725342) / [LCSC C725342](https://www.lcsc.com/product-detail/C725342.html), both identify **LM78L05ACM/TR regulator**.
- **Passive supplier identity sources:** LCSC [C25852](https://www.lcsc.com/product-detail/C25852.html), [C25120](https://www.lcsc.com/product-detail/C25120.html), [C25867](https://www.lcsc.com/product-detail/C25867.html), [C25744](https://www.lcsc.com/product-detail/C25744.html), [C52923](https://www.lcsc.com/product-detail/C52923.html), [C1537](https://www.lcsc.com/product-detail/C1537.html), [C307331](https://www.lcsc.com/product-detail/C307331.html), [C1549](https://www.lcsc.com/product-detail/C1549.html), public product/specification metadata inspected September 29; manufacturer exact-PN derating/compliance and JLC passive inventory are not claimed verified.
- **Additional primary project evidence:** descriptions and all comments on the nine tickets linked in §2, retrieved September 29. ATT-350 decision/correction anchors: `28a76161-4f13-4263-878c-a29eadc84c0f` (PCB antenna go), `4682d8b6-176c-4150-9620-d944b58fc439` (C2 100 pF), `bca7a549-83ae-410f-81a4-f2c41afd73af` (Gerber and bottom J1 correction); ATT-376 handover `dbd93b38-cfe7-4ada-a3cb-fa0ff775209f`.
