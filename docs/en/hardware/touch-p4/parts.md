# Parts and sourcing
<!-- llms-description: Lifecycle, approved alternates, sourcing plan, cost and sourcing risks of the parts on the Touch P4 board. -->

What every IC and module on the board is, whether its maker still makes it, what can replace it, how to
get the parts JLCPCB does not stock, and what the board costs. For whoever orders or changes parts.

The parts lists in `fab/jlcpcb/` carry the same data per line (columns Manufacturer, Description,
Alternate, Lifecycle). The data lives in `scripts/bootstrap/parts_info.py`. Lifecycle, stock and prices
were read in November 2026; check them again before an order.

## Lifecycle of the ICs and modules

The maker's own status where the maker publishes one, otherwise the part status DigiKey shows. "Not
stated" means neither gives one; LCSC's stock is then the only signal. No part has an end-of-life or
last-time-buy notice from its maker.

| Part | Ref | Status | Source |
|---|---|---|---|
| Espressif ESP32-P4NRW32X | U201 | Mass Production. The variants without X (NRW32, NRW16) are EOL: order the X | [products.espressif.com](https://products.espressif.com/) |
| Espressif ESP32-C5-MINI-1-N4-V1.2 | U301 | Mass production: its datasheet is v1.4, an official release, which Espressif issues "for products in mass production" (datasheet, "Datasheet Versioning") | [datasheet](https://documentation.espressif.com/esp32-c5-mini-1_mini-1u_datasheet_en.pdf) |
| Winbond W25Q128JVSIQ | U203 | Active | [DigiKey](https://www.digikey.com/en/products/detail/winbond-electronics/W25Q128JVSIQ/5803943) |
| IC Plus IP101GRI | U401 | not stated (listed on the maker's site) | [icplus.com.tw](https://www.icplus.com.tw/products/1?locale=en) |
| Tokmas PN5321A3HN | U501 | not stated | none found |
| NXP PN5321A3HN/C106 (alternate of U501) | | **Not Recommended for New Designs**; NXP points to the PN7160 | [nxp.com](https://www.nxp.com/products/PN5321A3HN) |
| TI TLV62569DBVR | U103, U202, U302 | ACTIVE | [ti.com](https://www.ti.com/product/TLV62569/part-details/TLV62569DBVR) |
| TI TPS259470ARPWR | U105 | ACTIVE | [ti.com](https://www.ti.com/product/TPS25947/part-details/TPS259470ARPWR) |
| TI LM74700QDBVRQ1 | U106, U107 | ACTIVE | [ti.com](https://www.ti.com/product/LM74700-Q1/part-details/LM74700QDBVRQ1) |
| TI TLV803SDBZR | U204 | ACTIVE | [ti.com](https://www.ti.com/product/TLV803) |
| Diodes AP63205WU-7 | U104 | Active | [DigiKey](https://www.digikey.com/en/products/result?keywords=AP63205WU-7) |
| Diodes AP3032KTR-G1 | U601 | Active | [DigiKey](https://www.digikey.com/en/products/result?keywords=AP3032KTR-G1) |
| TI TCA9554PWR | U602 | ACTIVE | [ti.com](https://www.ti.com/product/TCA9554/part-details/TCA9554PWR) |
| TI SN74LV1T125DBVR | U701 | ACTIVE | [ti.com](https://www.ti.com/product/SN74LV1T125/part-details/SN74LV1T125DBVR) |
| ST LIS2DH12TR | U702 | Active | [DigiKey](https://www.digikey.com/en/products/result?keywords=LIS2DH12TR) |
| TI DRV5032FADBZR | U703 | ACTIVE | [ti.com](https://www.ti.com/product/DRV5032/part-details/DRV5032FADBZR) |
| Vishay VCNL4040M3OE | U704 | Active. The -H3 suffix is obsolete: do not order it | [DigiKey](https://www.digikey.com/en/products/detail/vishay-semiconductor-opto-division/VCNL4040M3OE/5171283) |
| ST USBLC6-2SC6 | U101, U603, U604 | Active | [DigiKey](https://www.digikey.com/en/products/detail/stmicroelectronics/USBLC6-2SC6/1040559) |
| SDAPO DP9900M-5V | U102 | not stated (listed as a current product) | [sdapo.com](https://www.sdapo.com/show/102.html) |
| Silvertel Ag9905M (alternate of U102) | | not marked NRND; filed under "Extended Range" | [silvertel.com](https://silvertel.com/Ag9900/) |
| AOS AO3400A | Q701 | Full Production | [aosmd.com](https://aosmd.com/products/mosfets/low-voltage-mosfets-12v-30v/ao3400a) |
| Infineon IRLML0030TRPBF | Q101, Q102 | Active | [DigiKey](https://www.digikey.com/en/products/result?keywords=IRLML0030TRPBF) |
| HanRun HY931147C | J401 | not stated | none found |
| Hirose FH12-40S-0.5SH(55) | J601 | Active | [DigiKey](https://www.digikey.com/en/products/result?keywords=FH12-40S-0.5SH(55)) |
| HRO TYPE-C-31-M-12 | J101 | not stated | none found |
| Same Sky (CUI) PJ-002A | J102 | Active | [DigiKey](https://www.digikey.com/en/products/detail/same-sky-formerly-cui-devices/PJ-002A/96962) |
| WAGO 250-202 | J103 | Active | [DigiKey](https://www.digikey.com/en/products/detail/wago-corporation/250-202/15573398) |
| OPSCO SK6812MINI-E | D701 to D708 | not stated | none found |
| Huaneng MLT-8530 | BZ701 | not stated | none found |

## Approved alternates

An alternate is listed when its maker's pin table and package match the fitted part. "No stock" means
none at LCSC or JLCPCB in November 2026.

| Fitted | Alternate | Note |
|---|---|---|
| Winbond W25Q128JVSIQ (C97521) | GigaDevice GD25Q128ESIGR (C2928891) | Same SOP-8 208 mil pin table; ESP-IDF enables its quad mode |
| IC Plus IP101GRI (C703537) | the same part, LCSC C910373 | Not the IP101GRR, which is the commercial-temperature part |
| Tokmas PN5321A3HN (C53457895) | NXP PN5321A3HN/C106 (C28925) | Mutual alternates: Tokmas copies NXP's pin table. Check the firmware version and the antenna tuning on the first board |
| TI TLV62569DBVR (C141836) | SGMICRO SGM61020XN5G/TR (C5153643) | For U103 and U302 only. Same SOT-23-5 pins, 0.6 V reference, 2 A: the divider stays. The core converter U202 must stay the TLV62569 ([design notes](hardware/touch-p4/design-notes.md#power)) |
| TI LM74700QDBVRQ1 (C2941042) | Maxinmicro MX74700T (C22468156) | Same pins; 300 uA instead of 80 uA, not automotive-qualified |
| TI TLV803SDBZR (C132016) | 3PEAK TPV803S-3STR (C2842356) | Same pins; resets at 2.85 to 3.00 V, holds the reset 140 to 280 ms |
| Infineon IRLML0030TRPBF (C67272) | Diodes DMN3023L-7 (C443825) | Same SOT-23 pins; 25 mOhm at 10 V, +-20 V gate |
| Littelfuse SMBJ28CA (C151259) | MDD SMBJ28CA (C115825) | Same ratings |
| R+O SS310 (C7420364) | MDD SS310 (C15874) | 100 V 3 A, 0.85 V at 3 A; junction rated 125 C instead of 150 C |
| YAGEO RT0603BRD07330KL, 330 k 0.1 % (C861327) | Uniroyal TC0325B3303T5F (C2989388) | Same ratings |
| YAGEO RT0402BRD0729K4L, 29.4 k 0.1 % (C852690) | Panasonic ERA-2AEB2942X (C2074881) | Same ratings; no stock. FH TD03G2942BT (C667085) has the value and tolerance but is 0603 |
| YAGEO RT0402BRD0797K6L, 97.6 k 0.1 % (C852964) | Viking ARG02BTC9762 (C2686423) | Same ratings |
| Diodes AP63205WU-7 (C2071056) | SCT SCT2325TVBR (C509064) | Same pins, fixed 5 V; SCT's examples use 6.8 to 10 uH |
| Diodes AP3032KTR-G1 (C264086) | MSKSEMI MSAP3032KTR-G1 (C49208388) | Same pins and 0.2 V feedback; 1.2 MHz, PWM dimming 20 kHz to 1 MHz |
| TI TCA9554PWR (C477924) | NXP PCA9554PW,118 (C17230) | Same address range 0x20 to 0x27; not the PCA9554A |
| TI SN74LV1T125DBVR (C473338) | I-core AiP74LV1T125GB235.TR (C5354320) | Same pins and input thresholds |
| TI DRV5032FADBZR (C140921) | TI DRV5032FBDBZR (C2655033) | Same pins, samples at 5 Hz instead of 20 Hz; low stock |
| ST USBLC6-2SC6 (C7519) | ST USBLC6-2SC6Y (C2969755) | Automotive grade, same pins |
| AOS AO3400A (C20917) | UMW AO3400A (C347475) | Same SOT-23 pins and ratings |
| HRO TYPE-C-31-M-12 (C165948) | HRO TYPE-C-31-M-12A (C5337088) | Identical drawing and land pattern |
| CUI PJ-002A (C3096082) | Same Sky PJ-002AH (C2961147) | Identical drawing and land pattern |
| OPSCO SK6812MINI-E (C5149201) | OPSCO SK6812MINI-EA (C5378731) | Same datasheet apart from the part number |
| Huaneng MLT-8530 (C94599) | XHXDZ SMD8530-16 ohm (C49246948) | 16 ohm, 2.7 kHz, same size; check which pad is + |
| ESP32-C5-MINI-1-N4-V1.2 (C54951860) | ESP32-C5-MINI-1-N4 (C50346179) | The same module listed without the revision suffix; no stock. The ESP32-C5-MINI-1-N8R2 has the same pins and land pattern (8 MB flash, 2 MB PSRAM on IO15, which is open here) but is not at JLCPCB or LCSC |
| ESP32-P4NRW32X (C54540373) | ESP32-P4NRW16X (JLCPCB C55820335) | 16 MB PSRAM: the firmware must fit; no stock |
| SDAPO DP9900M-5V (C5380106) | Silvertel Ag9905M | Same pin table and pin positions (SDAPO datasheet section 4.1, Silvertel Ag9900 fig. 3). Only the Ag9905-M and Ag9905-MT fit; the -MTB and -LPB have five pins in another order. Check its seated height against the case, which leaves 13.9 mm. Not at JLCPCB |

No alternate was found for:

- the IP101GRI from another maker;
- the LIS2DH12TR: the SC7A20H looks similar but has another pin order and would put VDD on a ground pad;
  ST's IIS2DHTR fits but had one piece in stock. ST's LIS2DE12TR (C155639) fits the board unchanged (same
  LGA-12 pins, I2C address and WHO_AM_I 0x33) but gives 8-bit data only (OUT_X_H, OUT_Y_H, OUT_Z_H;
  15.6 mg per digit at ±2 g), enough for tamper detection; with one piece in stock it is not listed;
- the VCNL4040, the HY931147C (its PoE bridges are unusual), the FH12-40S (no identical land pattern)
  and the WAGO 250-202;
- the eFuse TPS259470A: TI's TPS259470LRPWR has the same pins but latches off after a fault, and had no
  stock.

The parts lists name an alternate for the other small discretes (diodes, ferrites, crystals, fuses,
inductors, electrolytic capacitors). Plain resistors and capacitors take any part of the same value,
rating and package.

## Parts JLCPCB does not stock

- **ESP32-P4NRW32X (U201)**: none at JLCPCB or LCSC; Espressif is the only maker. Order through JLCPCB's
  global sourcing (it buys from Espressif's distributors and holds the parts for the order) or send a
  consignment. Expect several weeks. Order 10 % more than the boards plus 5 for rework, and keep the
  spares. The order must say NRW32X (silicon v3.x): the variants without X are end of life.
- **ESP32-C5-MINI-1-N4-V1.2 (U301)**: a few hundred in stock, the only stocked C5 module with a PCB
  antenna (no ESP32-C5-WROOM-1 of any variant was stocked). Its alternates have no stock. Buy the
  modules for the planned production with the first order, or order them in through global sourcing.
- **DP9900M-5V (U102, Ethernet version only)**: a few dozen in stock, falling. Reserve them with the
  order, or source the Silvertel Ag9905M (or -MT) through a distributor and check its fit first.
- **PN532 (U501)**: the Tokmas part and the NXP original both fit, each with a few hundred in stock at
  most. NXP lists the PN532 as not recommended for new designs. Buy enough for the planned production
  with the first order. For revision B, plan a current reader IC (NXP PN7160 or ST ST25R3916); that
  needs a new firmware driver (the firmware talks the PN532 protocol) and a new matching network.
- **Display panel** (not assembled by JLCPCB): a commodity part without a guaranteed part number. Agree
  on a fixed type with the supplier and check every batch against the drawing
  ([design notes](hardware/touch-p4/design-notes.md#display-mounting-and-flex)).

The 3.3 V converters U103 and U302 are the same TLV62569 as the core converter U202: one parts line,
deep stock, with the SGM61020 as second source for U103 and U302.

## Cost

Prices as of November 2026, in USD, from JLCPCB.

### Parts per board

| | 5 boards | 100 boards |
|---|---|---|
| Wi-Fi version | 27.90 | 19.80 |
| Ethernet/PoE version | 38.70 | 27.60 |

The table was priced with an earlier parts list. Add to it:

- input filter, three resistors, a second level shifter and the buzzer resistor: about 0.3 per board;
- tamper sensors: about 2.7 per board (accelerometer 0.89, proximity sensor 1.57, hall switch 0.17,
  five capacitors, two resistors), plus a magnet of a few cents for the dock;
- the ESP32-C5 module and its own 3.3 V converter: about 0.4 per board from 100 pieces. The table was
  priced with the ESP32-C6-MINI-1U-H4 (4.13 / 3.42 / 3.20 for 1 / 30 / 100 pieces); the C5 module costs
  4.90 / 3.78 / 3.36, and its converter (TLV62569, 2.2 uH, 22 uF, 10 uF and small parts, all existing
  lines) about 0.22. No external antenna or cable is bought.

The largest lines are the ESP32-P4 (6.15), the PN532 (5.89), the Wi-Fi module (4.19 in the table) and
the flash (2.26); on the Ethernet/PoE version also the PoE module (6.70), the jack (2.60) and the PHY
(1.03).

### Per order

Once per order JLCPCB adds 3 USD for every extended part line (50 lines on the Wi-Fi version, 57 on the
Ethernet/PoE version; preferred parts not counted), the setup and stencil fees, the bare boards and
shipping. On five boards the extended-part fees alone are 30 to 34 USD per board, so a small prototype
costs far more per board than the parts table shows.

### Bare boards

From JLCPCB's order form filled in by hand (86 x 143.5 mm, 1.6 mm, green, slowest build time, without
shipping and tax), per order. JLCPCB's review of the Gerber files can still change them.

| Boards | Four layers, ENIG | Six layers, ENIG | Six layers, OSP | Six layers with ENIG, per board |
|---|---|---|---|---|
| 5 | 50.70 | 59.00 | 41.00 | 11.80 |
| 10 | 59.70 | 68.40 | 49.00 | 6.84 |
| 30 | 95.90 | 106.00 | 80.80 | 3.53 |
| 50 | 132.00 | 143.60 | 112.70 | 2.87 |
| 100 | 208.50 | 253.50 | 208.30 | 2.54 |

- Six layers cost 8 to 12 more per order up to 50 boards and 45 more on 100 (0.45 per board). They take 7
  to 9 working days, four layers 3 to 6.
- Vias cost nothing extra. The option "Min via hole size/diameter" stays at "0.3mm/(0.4/0.45mm)": on
  boards with inner layers a 0.2 mm hole is free when the via is 0.45 mm or wider, which is the board's
  smallest via. "0.2mm/(0.3/0.35mm)" would add 39 on 5 boards and 91 on 100 (the option, TG155 material
  and a four-wire test).
- ENIG is 18 of the price on 5 boards and 45 on 100. The board stays with ENIG: OSP protects copper only
  until it is soldered, and JLCPCB excludes it for contact areas. The board has them: the four bare ground
  pads for the display's metal back (on the side without parts, which assembly cannot tin) and the 30 test
  points, four of which carry the Wi-Fi module's first flash. Bare OSP boards also keep for three months
  only, and about a week once unpacked.
- Splitting the board into a six-layer MCU board (45 x 45 mm: 48.80 for 5, 97.10 for 100) and a carrier
  does not pay. With a four-layer carrier (50.70 and 208.50) the pair costs more at every quantity. With a
  two-layer carrier (28.00 and 148.70) it costs more on 5 boards and 0.08 less per reader on 100, before
  the board-to-board connectors and the second assembly order.

### Savings considered and not taken

| Change | Saves per board | Why not |
|---|---|---|
| 16 MB flash GD25Q128ESIG (C2758105) instead of the Winbond part | 0.5 to 0.8 | An extended part: the fee eats the saving below about ten boards. Same footprint, a change of the LCSC number |
| DC jack DC-005C-20A (C84007, 24 V, 3 A) instead of the PJ-002A | 0.8 | Pins 6.65 mm apart instead of 6.0 mm: the footprint needs wider slots |
| Generic 40-pin display connector instead of the Hirose FH12 | about 0.4 | Different solder tabs: a footprint change at the densest connector |
| RC522-family reader (FM17580, Si522, MFRC522 second sources, 0.3 to 1) instead of the PN532 | about 5 | Radio front ends only: the firmware would need a new driver including ISO 14443-4, which the PN532 runs itself, and the board a new matching network |
| SRV05-4-P-T7 (C85364, preferred part) instead of the USBLC6-2SC6 | 3 per order (one extended line less) | Same package and fits the wiring, but another maker's part at the one connector an ESD test hits, and its angle in JLCPCB's library is unchecked |

### Basic and extended parts

Where a part has an equivalent in JLCPCB's basic or preferred list, the design uses it (the TVS diodes of
USB and PoE, the DC input's reverse-polarity diode, 1 uF / 50 V, the NFC matching's 10 pF, the receive
divider's 3.9 k). The exceptions:

- The three capacitors of the DC input: the basic 10 uF / 50 V part fits their pads but is the wrong part
  there ([design notes](hardware/touch-p4/design-notes.md#power)).
- The core converter's 499 k divider resistor, which Espressif's checklist demands.
- 39 pF, 180 pF and 220 pF of the NFC matching, 1.5 ohm and 6.19 k: no basic or preferred part of that
  value exists. 39 pF, 180 pF and 1.5 ohm are tuning values the first boards will change anyway.
- The power path: eFuse, ideal-diode controller and its MOSFET, supervisor, the two TVS of the DC input
  (SMBJ28A, SMBJ28CA), the 47 uF electrolytic, the eFuse divider's three 0.1 % thin-film resistors, and
  1.65 k, 22.1 k and 2.2 nF. Whether a basic part exists for the last three has not been checked.

## Sourcing risks

Beyond the parts in [Parts JLCPCB does not stock](#parts-jlcpcb-does-not-stock):

| Part | Risk |
|---|---|
| PN532 (U501) | The Tokmas part (about 6 USD) has the NXP part's package and pinout, but its datasheet says nothing about the firmware inside, and it is not yet proven with ours. The NXP original (about 13 USD) fits the same pads. JLCPCB's library draws the two parts a quarter turn apart: the placement file corrects the angle for the Tokmas part only, so run `check-footprints` after changing the part number |
| DP9900M-5V (U102) | Stock falls quickly. JLCPCB lists no Ag9905 |
| DC jack PJ-002A (J102), inductor CKCSA252012-2.2uH/M (L103, L201, two per board) | About a thousand in stock: enough for a first order, low for a series |
| Inductor CKCSA4020-6.8uH/M (L102) | JLCPCB's library has no footprint for this part number, so `check-footprints` cannot compare it. It shares its 4 x 4 mm footprint with L101, has two pads and no polarity. Check it in the placement preview |

Every other line of both parts lists had more than 2000 pieces in stock.
