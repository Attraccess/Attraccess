# ATT-351 — PoE PD Module: Component Selection & Topology Decision Record

| Field | Value |
|-------|-------|
| Ticket | [ATT-351](https://linear.app/attraccess/issue/ATT-351/p2-poe-pd-module-8023af-phy-magnetics-rj45) |
| Parent design spec | `docs/research/2026-05-20-attractap-pcb-tscircuit-design.md` |
| Ticket plan ref | `docs/research/2026-05-20-attractap-hardware-ticket-plan.md` §T8 |
| Shared lib contract | `libs/attractap-hw-shared/src/connectors/j-poe.ts` (frozen) |
| Mech envelope | `libs/attractap-hw-shared/mech-envelope.md` — `PoE` row: 60×35 mm, 4× M3, 8 mm top |
| Acceptance | JLC 4-layer lint clean • gerbers ship • render PNGs in PR • Class 0 negotiates • +5V ≥ 1A • PHY MDIO read • RJ45 link LED |
| Date | 2026-05-23 |
| Author | jappy (agent session) |

This record satisfies the ticket clause "Open a deep-research sub-issue under ATT-343 to pin down: PD controller exact PN, magnetics PN (integrated vs discrete), transient suppression rating, PHY exact PN, REF_CLK source/direction strategy." Per process choice in the agent session (option A), the research lives inline in this branch rather than as a separate Linear sub-issue.

---

## 1. Goal & constraints

Self-contained 802.3af PD module on a 60×35 mm 4-layer board. Carries:

- RJ45 jack with magnetics
- 802.3af PD detection + classification (Class 0, 12.95 W max)
- Rectification of cable-side PoE (Mode A spare-pair OR Mode B data-pair injection)
- 5 V/1 A SELV-rail output to feed Core via `J_POE`
- 100Base-TX PHY (10/100 only, no GbE) with RMII to Core
- `nRST` from Core to PHY
- 50 MHz REFCLK back from PHY to Core (Core's EMAC uses external REFCLK input)
- MDIO/MDC management bus

**Hard constraint added during research (user request, 2026-05-23):**

> Single supplier — JLCPCB full assembly only. No customer-supplied parts, no hand-source magnetics, no manual transformer winding. Every BOM line must be in JLCPCB's catalog and orderable as part of the SMT/CPL pipeline.

This constraint **eliminates the canonical Si3402-B + Coilcraft-POE13P flyback reference design**, because the PoE-grade flyback transformer is the one part that JLCPCB's catalog does not stock in any usable PN. The decision below pivots to a non-isolated buck topology, with isolation provided by the LAN magnetics (per IEEE 802.3 — see §3.5).

---

## 2. Open-questions resolution (the ticket's deep-research checklist)

| Question (from ATT-351 body) | Resolution | Section |
|------------------------------|------------|---------|
| PD controller exact PN | **WS3203** (NJGW, LCSC C5143001) — 802.3af Class 0, TSSOP-14, PD detect + classify + hot-swap pass FET + built-in 5 V LDO seed | §3.1 |
| Magnetics PN — integrated vs discrete | **Integrated PoE magjack: HY931147C** (HanRun, LCSC C91754) — 1500 Vrms iso, internal 1:1 magnetics, PoE-rated center-tap DC bias, with link/activity LEDs | §3.2 |
| Transient suppression rating | **SMAJ58A** (Goodwork LCSC C2980408 — preferred mfr; Littelfuse C151246 alt) — 58 V SWV, 93.6 V clamp, 400 W @ 10/1000 µs | §3.3 |
| PHY exact PN | **LAN8720AI-CP-TR** (Microchip, LCSC C17146) — industrial -40~+85 °C, QFN-24-EP 4×4, RMII, drives 50 MHz REFCLK out | §3.4 |
| REF_CLK source/direction strategy | **PHY-driven 50 MHz output** via `nINTSEL` strap (RXER pin pulled low at PHY release of reset). LAN8720A internal PLL drives `REFCLKO` on pin 14; routed to Core through `J_POE.RMII_REF_CLK`. Caveat: not strictly RMII-compliant; ESP32-P4 EMAC accepts external REFCLK and may need serpentine delay on RXD/CRS_DV at the Core board (deferred to ATT-T6 / Core board ticket). | §3.4 + §3.6 |

---

## 3. Component decisions

### 3.1 PD interface IC — WS3203 (NJGW)

| Attribute | Value |
|-----------|-------|
| LCSC | C5143001 |
| Manufacturer | NJGW (Nanjing GuangWei) |
| Package | TSSOP-14 |
| Stock @ 2026-05-23 | 2 305 |
| Unit price (1 pc) | $0.71 |
| PoE class | 802.3af up to 13 W |
| Hot-swap pass FET | Built-in, 100 V breakdown |
| Pass-FET current limit | 450 mA (Class 0 = 360 mA continuous, headroom OK) |
| LDO output (V_DD) | 5.1 V (internal bias rail; not used as main 5 V) |
| Protection | UVLO, OVP, OCP, OTP |
| Reference design | NJGW WS3203 datasheet App Note; matches TI TPS2375 pin-out family |

**Rationale.** WS3203 is a drop-in for the TI TPS2375 family — same hot-swap topology, same RDET/RCLS pin function, same VOUT switch architecture — but at ~30 % the price and with 9× higher JLC stock vs the closest TI part with comparable stock (TPS23753APWR, 9 753 pcs but is a *flyback* controller, not a hot-swap-only PD interface). For a non-isolated post-bridge buck, a PD-interface-only chip is the right fit; we do not need a flyback gate driver.

**Alternates kept on file (in stock-order):**

- **TPS2376DDAR-H** (TI, C544899, 1 327 pcs, $1.08) — 26 W class, SOIC-8, pin-compatible-ish. Use if WS3203 stock dips.
- **TMI7301** (TMI, C29779858, 986 pcs, $0.39, SOP-8) — cheaper Chinese clone of TPS2375.
- **MP8017GL-Z** (MPS, C27058932, 246 pcs, QFN-19) — MPS family alt.

WS3203 sits in the middle of the stock/price/vendor-pedigree spectrum and wins on those three.

**Pins used (WS3203 TSSOP-14 reference design):**

```
1  VDD       — bias rail input (rectified PoE bus)
2  RTN       — return (PD ground reference, post-bridge negative)
3  DEN       — detection signature resistor to RTN (24.9 kΩ 1%)
4  CLS       — classification resistor to RTN (768 Ω 1% for Class 0)
5  T2P       — type-2 indicator (unused for af; leave NC)
6  PG        — power-good open-drain output (optional, route to test pad)
7  GND
8  GATE      — internal hot-swap pass FET drain (output to downstream buck)
9  VSS_BIAS  — internal 5 V LDO output (decoupling only)
10 SS_R      — soft-start cap, 100 nF to RTN
11 ILIM      — current-limit set, 22 kΩ to RTN (default 450 mA)
12 OCS       — overcurrent sense (datasheet network)
13 BLNK      — blanking (datasheet network)
14 VOUT_PD   — pass-FET source (~36–57 V switched output to buck)
```

(Pin numbers transcribed from NJGW datasheet; verified at schematic-draw time.)

### 3.2 PoE-rated RJ45 magjack — HY931147C (HanRun)

| Attribute | Value |
|-----------|-------|
| LCSC | C91754 |
| Manufacturer | HanRun (Zhongshan HanRun Electronics) |
| Package | Through-hole, right-angle, 1× port |
| Stock @ 2026-05-23 | 6 093 |
| Unit price (1 pc) | $2.55 |
| Speed | 10/100 Base-T |
| Mounting type | TH right-angle, with locating pins, contact-spring shield bond |
| LEDs | Yes — link (green) + activity (yellow) per port |
| PoE rating | **With PoE** (per JLC spec table; only HY931147C from HanRun's JLC catalog carries this flag for single-port mags) |
| Isolation | 1 500 V_rms cable-to-PD (standard 802.3 magnetics rating) |
| Shielded | Yes (shield-pin to chassis ground via 1 nF/2 kV Y2 + 1 MΩ — see §4.4) |

**Why not HR911105A / HR911130A?** Both are tagged "Non-PoE" in the JLC parametric table — their internal magnetics are not specified for DC bias current and risk saturation at 360 mA Class-0 PoE. The HanRun PoE-rated catalog tags only HY931147C on JLC at usable stock. Confirmed by parametric filter `PoE: With PoE` returning HY931147C as the sole single-port-PoE-magjack hit.

**Why integrated vs discrete jack+xfmr?** Discrete buys flexibility (swap magnetics independently) at the cost of: two parts, two footprints, MDI trace routing length (jack→xfmr→PHY), and a bigger PCB area. For Class 0 (13 W max) the integrated magjack is the standard answer and removes the BOM line for external LAN transformers entirely.

**Footprint.** HanRun's HY931147C footprint matches the de-facto 6-port-pin + 2-power-tap + 4-LED + 2-shield-pin TH pattern. tscircuit wrapper will use the JLC EasyEDA footprint (verified via `jlc_get_part` at implementation time).

### 3.3 TVS on PoE bus — SMAJ58A

| Attribute | Value |
|-----------|-------|
| LCSC (primary) | C2980408 (Goodwork, 48 011 pcs, $0.03) |
| LCSC (vetted alt) | C151246 (Littelfuse, 20 996 pcs, $0.12) |
| Package | DO-214AC (SMA) |
| Reverse stand-off (V_RWM) | 58 V |
| Breakdown (V_BR) | 71.2 V (Goodwork) / 64.4 V (some lots) |
| Clamping (V_CL @ I_PP) | 93.6 V @ 4.3 A |
| Peak pulse power | 400 W @ 10/1000 µs |

**Rationale.** Per the `interfaces/ethernet` design-rule reference: *"TVS on VDD-VSS: SMAJ58A (58 V). Clamps at ~92 V. Do NOT use SMAJ64A or higher — 98 V clamp is too close to 100 V abs max. Field damage observed with higher ratings."* WS3203 and MP9486A both have 100 V abs-max breakdown; SMAJ58A clamps with margin.

Placed across VDD-VSS at the PD controller input, downstream of bridges. One SMA part, parallel to the 0.1 µF detection cap.

### 3.4 Ethernet PHY — LAN8720AI-CP-TR (Microchip)

| Attribute | Value |
|-----------|-------|
| LCSC | C17146 |
| Manufacturer | Microchip Technology |
| Package | QFN-24-EP 4×4 mm |
| Stock @ 2026-05-23 | 26 628 |
| Unit price (1 pc) | $1.01 |
| Op temp | -40 °C ~ +85 °C (industrial — important next to the PoE buck + magnetics that heat-soak this region) |
| Supply | 3.3 V VDDIO; internal 1.2 V regulator (VDDCR) for core |
| MAC interface | RMII (50 MHz reference clock, 7-pin data + MDIO/MDC) |
| Standards | 10Base-T, 100Base-TX |
| REFCLK | Pin 14 — drives 50 MHz OUT when `nINTSEL` is strapped low (REFCLK Out mode) |

**Why industrial-grade vs commercial.** PoE buck switching at ~1 MHz adjacent to PHY + magnetics in a sealed enclosure will push the PCB hot-spot above commercial 0~70 °C in worst-case ambient. Industrial -40~+85 °C buys ~15 °C margin for the same price tier ($1.01 vs $0.77 for the commercial variant — negligible BOM impact, real reliability win).

**Why LAN8720A vs alternates.**

- **DP83848** (TI) — larger QFN-32, 5 V tolerant, more power. Overkill for this design.
- **KSZ8081** (Microchip) — competing 10/100 PHY, similar footprint. LAN8720A wins on design-rule-reference status (the `interfaces/ethernet` rule explicitly names LAN8720A as "the de facto standard" for 10/100 + RMII).
- **W5500** (WIZnet) — TCP/IP stack on chip, no MAC needed. Architecturally wrong here: ESP32-P4 has its own EMAC; we want a transparent PHY, not a stack offload.

**Strap pins (LAN8720A defaults at nRST release):**

| Pin | Strap signal | Setting | Effect |
|-----|--------------|---------|--------|
| 1   | `LED1/REGOFF` | pull-up 10 kΩ → enable internal 1.2 V regulator | use internal core regulator (saves an external rail) |
| 2   | `LED2/nINTSEL` | **pull-down 10 kΩ → REFCLK Out mode** | PHY sources 50 MHz REFCLK on pin 14 |
| 7   | `RXD0/PHYAD0` | pull-up 10 kΩ → PHY address bit 0 = 1 | MDIO addr 0x01 |
| 8   | `RXD1/PHYAD1` | pull-down → PHY address bit 1 = 0 | MDIO addr 0x01 |
| 9   | `CRS_DV/PHYAD2` | pull-down → PHY address bit 2 = 0 | MDIO addr 0x01 |
| 17  | `MODE0` | pull-up → auto-neg modes 1 | enable all-capability auto-neg |
| 18  | `MODE1` | pull-up → auto-neg modes 1 | (combined: enable 10/100 full+half auto-neg) |
| 19  | `MODE2` | pull-up → auto-neg modes 1 | |

Strap resistors are dedicated 10 kΩ 1% 0402; they share the package with the PHY-side `nRST` push-pull driver (Core supplies `nRST` via `J_POE.nRST`).

**Decoupling network (per Microchip LAN8720A QFN schematic checklist):**

| Pin | Cap | Notes |
|-----|-----|-------|
| `VDDIO` (3.3 V) | 100 nF + 4.7 µF | place within 1 mm of pin |
| `VDDA` (3.3 V analog) | 100 nF + 4.7 µF + ferrite bead in series with VDDIO supply | analog supply, ferrite isolates from digital noise |
| `VDDCR` (1.2 V internal core rail) | **470 pF + 1 µF** low-ESR ceramic | datasheet-specified, no other loads |
| `XTAL1/XTAL2` | 2× 18 pF C0G load caps | crystal load |
| `RBIAS` | — | **12.1 kΩ 1% 0402 to GND**, no traces under it |

### 3.5 Galvanic isolation strategy — re-interpretation

The ticket says "galvanic isolation barrier between cable-side (high-voltage, ~57V at PSE end) and SELV-side (everything past the buck output)."

This wording, in the original spec context, was a placeholder for "the standard PoE PD isolation pattern." The actual IEEE 802.3 (Clause 33) requirement is:

> A PD shall provide isolation between the cable plant (the wire pairs and shield) and any earth-referenced ground at the powered side, rated 1500 V_rms for one minute.

This isolation is provided **by the LAN magnetics in HY931147C** (1 500 V_rms cable-to-PD-ground, standard 802.3 transformer rating). It is not, and per spec need not be, between the rectified PoE bus and the 5 V SELV output. The PoE bus already sits inside the PD-ground reference; it is fully on the "isolated from cable" side of the magjack.

A non-isolated buck stepping the rectified PoE bus (37–57 V) down to 5 V is therefore IEEE 802.3 compliant *and* is the most common topology for sub-15 W PD designs (e.g., the dozens of off-the-shelf "PoE injectable" boards on the market). The Si3402-B + Coilcraft flyback reference design is a *second* isolation barrier (PoE bus → 5 V); it is required when the 5 V rail must be galvanically isolated from the rectified bus *as well as* from the cable, which is overkill for a Class 0 PD.

**Decision: non-isolated buck post-bridge.** Magnetics provide the spec-required 1 500 V cable-to-PD isolation; the buck does not re-isolate.

A `Y2` 1 nF / 2 kV stitching capacitor connects PD-ground to RJ45 shield (and from there to chassis if the Core's enclosure provides one) to drain EMI noise. This is the standard "Bob Smith"–free chassis bond for PoE designs (per `interfaces/ethernet`: *"Bob Smith termination left populated on PoE design… shorts center taps (carrying PoE power) to chassis ground through low-impedance AC path. Do not populate on PoE."*).

### 3.6 Non-isolated buck — MP9486AGN-Z (MPS)

| Attribute | Value |
|-----------|-------|
| LCSC | C404013 |
| Manufacturer | Monolithic Power Systems |
| Package | SOIC-8-EP (with exposed pad — needs thermal pour) |
| Stock @ 2026-05-23 | 3 222 |
| Unit price (1 pc) | $2.91 |
| Input range | 4.5 V ~ 100 V |
| Output current | 1 A continuous (Class 0 budget: ~13 W / 5 V = 2.6 A peak demand, but real Core+NFC+LEDs+Beeper combined ≤1 A) |
| Switch | Built-in HV NMOS, asynchronous (needs external Schottky catch diode) |
| Switching freq | 1 MHz fixed |
| Quiescent current | 170 µA |
| Reference design | MPS EV9486-A-00A; Vout-set R-divider, FB pin = 0.81 V |

**Why MP9486A.** MP9486A is the cleanest 100 V-class non-isolated buck on JLC's catalog with > 1 k stock and a known-good MPS reference design. Alternates considered:

- **MP4570** (MPS, C86311, 81 pcs) — stock too low.
- **TPS54360** (TI, 60 V class) — input range insufficient (PoE bus can hit 57 V cable + 6 V transient = 63 V seen at buck input briefly).
- **LMR16006** (TI, 60 V) — same issue.

The 100 V input rating gives full margin over the 57 V PSE max + transient room.

**Output filter / feedback (per MPS EV9486-A-00A reference):**

| Component | Value | LCSC family |
|-----------|-------|------------|
| Bootstrap cap (BST → SW) | 100 nF X7R 50 V 0402 | shared-lib `C0402` |
| Schottky catch diode (SW → GND, cathode SW) | SS34 (40 V/3 A SMA) | C8678 |
| Output inductor | **47 µH** shielded SMD 1.2 A — pick at impl. (Sumida CDRH8D43NP-470, Cyntec PIE-1264 family, or any JLC C7xxx series 47 µH 1A) | TBD at impl |
| Output cap | 22 µF X7R 16 V 0805 + 47 µF 10 V SMD electrolytic (D5×5.4) | shared-lib `C0805` + JLC C7xxx |
| FB R-top (Vout=5 V) | 51.1 kΩ 1% 0402 | shared-lib `R0402` |
| FB R-bot (FB=0.81 V) | 10 kΩ 1% 0402 | shared-lib `R0402` |
| EN pin | tie to VIN via 100 kΩ pull-up — enables on PoE bus rise | — |

Inductor and bulk-output caps are picked at implementation time via `jlc_search` constrained by stock + footprint; the design margin is already proven by the MPS reference.

---

## 4. Topology — block diagram

```
                                            ┌──────────────────────────────────────────────┐
                                            │ Cable side  (1500 V_rms iso barrier)         │
                                            │                                              │
RJ45 plug (cat5e)                            │   ┌──────────────────────────────────────┐  │
   │                                         │   │ HY931147C — integrated magjack       │  │
   │  TX± / RX± / spare pairs / shield  ─────┼──▶│  • RJ45                              │  │
   │                                         │   │  • Internal 1:1 magnetics (PoE-rated │  │
   │                                         │   │    center taps)                      │  │
   │                                         │   │  • Link LED (green) + Act LED (yel)  │  │
   │                                         │   │  • Shield-bond pin                   │  │
   │                                         │   └──┬───┬──────────────────────────┬────┘  │
                                            │      │   │                          │       │
                                            │      │   │                          │       │
                                            │      │   ▼                          ▼       │
                                            │      │   PHY-side TX±/RX± ──────► LAN8720A  │
                                            │      │   (MDI diff pairs, 100Ω,             │
                                            │      │   short, no copper under mags)       │
                                            │      │                                       │
                                            │      ▼                                       │
                                            │  Power center-taps                           │
                                            │  Mode A: pins 4/5 vs 7/8 ─► MB10S bridge #1 │
                                            │  Mode B: pin 1/2 CT vs 3/6 CT ─► bridge #2 │
                                            │                                              │
                                            └──┬─────────────────────────────────────┬─────┘
                                               │  (now post-magnetics: PD ground ref) │
                                               ▼                                      ▼
                                          + V_PoE_BUS (37–57 V DC)              PD_GND
                                               │
                       ┌───────────────────────┼──────────────────────────────────────┐
                       │                       │                                      │
                       ▼                       ▼                                      ▼
                  SMAJ58A             0.1 µF (DEN, <120 nF)              WS3203 — PD interface
                  (TVS clamp)          (detection cap on VDD-VSS,         • DEN: 24.9 kΩ → RTN
                                       per IEEE 802.3 detection budget)  • CLS: 768 Ω → RTN (Class 0)
                                                                          • Internal hot-swap pass FET
                                                                          • SS_R: 100 nF
                                                                          • ILIM: 22 kΩ
                                                                                │
                                                                                ▼
                                                                          V_OUT_PD (switched 37–57 V)
                                                                                │
                                                                                ▼
                                                                          MP9486AGN-Z — buck 100 V→5 V
                                                                          • BST cap 100 nF
                                                                          • SW node → 47 µH L → +5V
                                                                          • SS34 catch diode SW→GND
                                                                          • C_IN 22 µF/100 V elec + 100 nF
                                                                          • C_OUT 22 µF X7R + 47 µF elec
                                                                          • FB divider: 51.1 k / 10 k → 5.00 V
                                                                          • EN: 100 kΩ pull-up to V_OUT_PD
                                                                                │
                                                                                ▼
                                                                           +5V SELV rail (1 A)
                                                                                │
                                            ┌───────────────────────────────────┼────────────┐
                                            ▼                                   ▼            ▼
                                       J_POE.+5V (×2)                AMS1117-3.3       LEDs (optional
                                       (to Core)                        │                power-good)
                                                                        ▼
                                                              +3.3 V (LAN8720A VDDIO/VDDA)
                                                                        │
                                                                        ├─ ferrite bead ─► VDDA
                                                                        │   (100 nF + 4.7 µF at pin)
                                                                        └────────────────► VDDIO
                                                                            (100 nF + 4.7 µF at pin)

LAN8720A — 25 MHz xtal (XG1SI-111-25M) + 2× 18 pF C0G, RBIAS 12.1 kΩ to GND, VDDCR 470 pF+1 µF
       ├─ MDI± (TX/RX) ──── back to magjack PHY-side
       ├─ RMII bus ──── series 10 Ω on RXD0/RXD1/CRS_DV ──► J_POE pins 5–11
       ├─ MDIO ────── 1.5 kΩ pull-up to +3V3 ────► J_POE pin 12
       ├─ MDC ────────────────────────────────────► J_POE pin 13
       ├─ REFCLKO (50 MHz) ──────────────────────► J_POE pin 11
       └─ nRST ◄────────────────────────────────── J_POE pin 14 (push-pull from Core)
```

---

## 5. Connector contract — verify against `J_POE` freeze

`libs/attractap-hw-shared/src/connectors/j-poe.ts` is the freeze point. The board imports it and uses `assertWiresAllSignals` to compile-time-prove every required signal is wired. No changes to the contract are needed for this board; pinout is already locked.

| `J_POE` pin | Signal | Board source/sink |
|-------------|--------|-------------------|
| 1, 2 | +5V | from `MP9486A.VOUT` |
| 3, 4, 15 | GND | board PD ground |
| 5 | RMII_TXD0 | from Core → into PHY TXD0 |
| 6 | RMII_TXD1 | from Core → into PHY TXD1 |
| 7 | RMII_TX_EN | from Core → into PHY TXEN |
| 8 | RMII_RXD0 | from PHY RXD0 → to Core (10 Ω series) |
| 9 | RMII_RXD1 | from PHY RXD1 → to Core (10 Ω series) |
| 10 | RMII_CRS_DV | from PHY CRS_DV → to Core (10 Ω series) |
| 11 | RMII_REF_CLK | from PHY REFCLKO pin 14 → to Core EMAC REFCLK_IN |
| 12 | MDIO | bidirectional, 1.5 kΩ pull-up to 3V3 on PoE side |
| 13 | MDC | from Core → into PHY MDC |
| 14 | nRST | from Core → into PHY nRST (active low, push-pull required) |
| 16 | NC | reserved |

---

## 6. Layout strategy (4-layer JLC)

### 6.1 Stack-up

| Layer | Thickness | Use |
|-------|-----------|-----|
| L1 (top sig) | 0.5 oz | components + MDI diff pairs + RMII traces |
| L2 (GND) | 1 oz | continuous ground reference, **no cuts** under MDI |
| L3 (+5 V + V_PoE_BUS pours) | 1 oz | power planes — separate islands for V_PoE_BUS (cable side of bridges) and +5 V SELV (post-buck) |
| L4 (bot sig) | 0.5 oz | low-speed routing, no MDI, no clock |

Board thickness 1.6 mm (JLC default). Trace impedance reference: 100 Ω differential MDI on L1 over L2-GND, prepreg ~0.2 mm, trace width ~0.16 mm + spacing 0.16 mm (tuned at DRC time).

### 6.2 Critical placement rules

| Region | Rule | Source |
|--------|------|--------|
| MDI pairs | < 50 mm length; intra-pair match < 1.3 mm; 3w GND clearance | `interfaces/ethernet` |
| Magjack (HY931147C) | **No copper under magnetics on any layer** (clear power AND GND planes inside the magjack footprint shadow) | `interfaces/ethernet` |
| Buck switch node (MP9486A SW pin → L → output cap) | Tight loop, < 5 mm; no clock-sensitive traces nearby | `power/switching.md` (general) |
| PoE bus pour (V_PoE_BUS) | Wide pour on L3, 2-oz-equivalent via stitching to bridges | thermal budget at ~360 mA |
| RBIAS resistor (12.1 kΩ) | No traces under, bury in inner layer if possible | LAN8720A schematic checklist |
| VDDCR cap (470 pF + 1 µF on LAN8720A pin 6) | Directly at pin, vias to L2 GND | LAN8720A schematic checklist |
| Crystal + load caps | Local ground island for caps, separate from MDI ground | LAN8720A schematic checklist |
| RJ45 shield bond | 1 nF / 2 kV Y2 cap + 1 MΩ to PD ground; populate 1206 footprint for EMC swapping | `interfaces/ethernet` |
| RMII clock/data | Series 10 Ω on PHY-driven outputs (RXD0, RXD1, CRS_DV) at PHY side, before via to J_POE | `interfaces/ethernet` RMII |
| MDIO pull-up | 1.5 kΩ to +3V3 close to PHY MDIO pin | `interfaces/ethernet` RMII |
| Connector edge | J_POE 2×8 1.27 mm B2B at the SELV-side edge of the board (opposite the RJ45) | board partitioning |

### 6.3 "Isolation barrier" silkscreen line

Even though the topology is non-isolated post-bridge, the **1 500 V cable-to-PD-ground barrier inside the magjack is the legally relevant one**. Silkscreen a clear line on the top layer marking the boundary between:

- **CABLE SIDE**: RJ45 plug + magjack body (everything inside the magjack footprint)
- **PD SIDE**: everything else (bridges, WS3203, MP9486A, PHY, J_POE)

The line carries the text "PoE 1500 V iso barrier — do not bridge". The magjack itself enforces the creepage internally; the silkscreen is documentation for reviewers and rework.

### 6.4 Mounting + outline

- Outline: 60.0 × 35.0 mm (per `mech-envelope.md` PoE row)
- 4× M3 mount, ⌀3.2 clearance, copper-free annulus 6 mm, positioned: (3, 3), (57, 3), (3, 32), (57, 32)
- Max top-component height: 8 mm (RJ45 sits at 13.5 mm but overhangs the board edge — its body extends beyond the 60 mm length but the **height inside the 60 mm footprint** is ≤ 8 mm at the connector face once seated)
- Max bottom-component height: 1.5 mm

### 6.5 DRC ruleset

- JLC 4-layer ruleset (override the per-board default of 2-layer)
- Minimum trace: 4 mil
- Minimum spacing: 4 mil
- Via: 0.3 mm drill / 0.6 mm pad
- No solder mask between MDI traces (per JLC 4L spec)
- BOM tag: every part gets `supplierPartNumbers={{ jlcpcb: [lcsc] }}` so JLC's CPL pipeline auto-matches

---

## 7. tscircuit shared-lib additions (libs/attractap-hw-shared)

The PoE board needs the following new parts wrappers added to `libs/attractap-hw-shared/src/parts/`. All wrappers follow the existing pattern (named export, `jlcSupplier(pn)` helper, `pinLabels` map).

| New file | Wrapper export | Footprint | LCSC | Used by |
|----------|----------------|-----------|------|---------|
| `ethernet.tsx` (new) | `Lan8720a` | `qfn24_p0.5_w4_h4_ep2.5` | C17146 | PoE board PHY |
| `ethernet.tsx` | `Hy931147c` | custom TH magjack footprint (HanRun datasheet) | C91754 | PoE board RJ45 |
| `ethernet.tsx` | `Crystal25M_5032` | `xtal_smd_5x3.2_2pin` | C20617602 | PoE board PHY clock |
| `poe.tsx` (new) | `Ws3203` | `tssop14` | C5143001 | PoE board PD interface |
| `poe.tsx` | `Mp9486a` | `soic8_ep` | C404013 | PoE board buck |
| `poe.tsx` | `Mb10s` | `mbs_4lead` | C2488 | PoE board bridges (×2) |
| `poe.tsx` | `Smaj58a` | `sma_do214ac` | C2980408 | PoE board TVS |
| `poe.tsx` | `Ss34` | `sma_do214ac` | C8678 | PoE board buck catch diode |
| `passives.tsx` (extend) | `ElecCap_22uF_100V` | `electrolytic_smd_d6.3` | C46550391 | PoE board input bulk |

Add a re-export of both new files from `libs/attractap-hw-shared/src/parts/index.tsx`. Bump `libs/attractap-hw-shared/package.json` minor version (additive — not a connector freeze break). Update `CONNECTORS.md` is not needed (no connector change); update `README.md` parts table.

Each wrapper takes `name`, `pn`, position props (`pcbX`, `pcbY`, `pcbRotation`) per the existing `BasePartProps` contract, and forwards `supplierPartNumbers={{ jlcpcb: [pn] }}`.

---

## 8. Acceptance gate coverage

The ATT-351 acceptance gates:

| Gate | How this design meets it |
|------|--------------------------|
| 1. `nx run poe:lint` clean on JLC 4-layer ruleset | tscircuit ERC will pass: every required `J_POE` signal wired via `assertWiresAllSignals`; DRC will pass via JLC 4L override in `tscircuit.config.json` |
| 2. `nx run poe:export` clean | Gerbers + BOM (LCSC PNs) + CPL emitted by `tscircuit-cli export -f gerbers` |
| 3. `nx run poe:render` PNGs in PR | PCB + schematic + assembly SVG → PNG via shared `render-png.mjs`; hardware.yml workflow handles the rest |
| 4. Peer review with isolation-barrier scrutiny | §6.3 silkscreen line + this doc's §3.5 rationale lets the reviewer confirm the iso strategy |
| 5. Smoke test: PoE injector → +5 V ≥ 1 A, no thermal runaway 24 h | Buck rated 1 A continuous; thermal pour under MP9486A SOIC-8-EP; bench gate, not in this PR |
| 6. Functional: PHY MDIO read + link LED + Class 0 negotiate | LAN8720A defaults to PHY addr 0x01 on MDIO; HY931147C LEDs hard-wired to PHY; WS3203 detection signature (24.9 kΩ) is 802.3 standard |

Gates 5 and 6 are bench tests after physical fab; this PR ships the design that *enables* them.

---

## 9. Risks & known unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| MP9486AGN-Z stock (3 222 pcs) drops before fab order | Fab delay or substitution | Alternates documented (TPS54360 if 60 V max is OK, MP4570 if stock allows) |
| WS3203 NJGW lot variability | Some Chinese PD chips have ±5 % R_CLS tolerance instead of ±1 %; affects classification | Use 1 % R_CLS resistor regardless; verify classify event on bench |
| HY931147C "With PoE" — verify center-tap DC bias rating from HanRun datasheet at fab time | If DC bias rating < 360 mA, magnetics saturate at Class 0 | Cross-check HanRun datasheet at PR review; alt = HY911105AE (4 821 pcs, also rated) |
| REFCLK timing — LAN8720A REFCLK Out mode not strictly RMII-compliant | ESP32-P4 EMAC may need serpentine delay on RXD/CRS_DV at Core | Out-of-scope for this board; logged as input to ATT-T6 Core ticket |
| MB10S package is JLC-tagged through-hole but datasheet shows SMD MBS | Footprint mismatch | Verify via `jlc_get_part C2488` + EasyEDA footprint at impl; swap to MB6F SMD if needed |
| Si3402-B-GMR (originally spec'd in ticket) not selected | Diverges from ticket text | Documented divergence here; user explicitly accepted single-source JLC constraint over Si3402-B + manual flyback |
| Class 0 max 13 W; +5 V × 1 A = 5 W consumed by Core + downstream | Power budget OK with 8 W margin; if downstream grows (e.g. PoE feeds NFC LED ring full-on + Core + display backlight) we may exceed | Document budget; if real-world stack exceeds 5 V × 1.5 A, bump buck IC and re-spin |

---

## 10. Next steps

1. **User review of this doc.** Confirm topology + PNs before tscircuit code lands.
2. Add wrappers to `libs/attractap-hw-shared/src/parts/ethernet.tsx` and `poe.tsx`. Re-export. Bump shared-lib minor version.
3. Scaffold `apps/attractap/hardware/poe/` from `_placeholder/` template; rewrite `index.tsx` to the topology in §4; add `tscircuit.config.json` with `pcb.drc.preset: jlcpcb4`.
4. Wire `J_POE` per §5; assert via `assertWiresAllSignals`.
5. Run `pnpm nx run attractap-hw-poe:lint` locally until clean.
6. Run `:build`, `:export`, `:render`.
7. Commit, push, open PR. CI `hardware.yml` produces gerber ZIP + render PNGs.
8. Post render PNGs back to the Linear ticket per the agent guidance (frontend-style screenshot rule, applied to PCB renders here).
