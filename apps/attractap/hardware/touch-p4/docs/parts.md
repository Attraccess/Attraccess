# Parts: lifecycle, alternates and sourcing

What every IC and module on the Touch P4 board is, whether its maker still makes it,
what can replace it, and how to get the parts that JLCPCB does not stock. The parts
lists in `fab/jlcpcb/` carry the same data per line (columns Manufacturer,
Description, Alternate, Lifecycle); the data lives in
`scripts/bootstrap/parts_info.py`. Read on 25 November 2026; check again before an
order.

## Lifecycle of the ICs and modules

The maker's own status where the maker publishes one, otherwise the part status
DigiKey shows. "Not stated" means neither gives one; LCSC's stock is then the only
signal.

| Part | Ref | Status | Source |
|---|---|---|---|
| Espressif ESP32-P4NRW32X | U201 | Mass Production. The variants without X (NRW32, NRW16) are EOL: order the X | [products.espressif.com](https://products.espressif.com/) |
| Espressif ESP32-C6-MINI-1U-H4 | U301 | Mass Production | [products.espressif.com](https://products.espressif.com/) |
| Winbond W25Q128JVSIQ | U203 | Active | [DigiKey](https://www.digikey.com/en/products/detail/winbond-electronics/W25Q128JVSIQ/5803943) |
| IC Plus IP101GRI | U401 | not stated (listed on the maker's site) | [icplus.com.tw](https://www.icplus.com.tw/products/1?locale=en) |
| Tokmas PN5321A3HN | U501 | not stated | none found |
| NXP PN5321A3HN/C106 (alternate of U501) | | **Not Recommended for New Designs**; NXP points to the PN7160 | [nxp.com](https://www.nxp.com/products/PN5321A3HN) |
| TI TLV62569DBVR | U103, U202 | ACTIVE | [ti.com](https://www.ti.com/product/TLV62569/part-details/TLV62569DBVR) |
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
| ST USBLC6-2SC6 | U101 | Active | [DigiKey](https://www.digikey.com/en/products/detail/stmicroelectronics/USBLC6-2SC6/1040559) |
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

No part has an end-of-life or last-time-buy notice from its maker.

## Approved alternates

An alternate is listed when its maker's pin table and package match the fitted part.
Stock is LCSC / JLCPCB on 25 November 2026.

| Fitted | Alternate | Stock | Note |
|---|---|---|---|
| Winbond W25Q128JVSIQ (C97521) | GigaDevice GD25Q128ESIGR (C2928891) | 19953 / 20899 | Same SOP-8 208 mil pin table; ESP-IDF enables its quad mode |
| IC Plus IP101GRI (C703537) | the same part, LCSC C910373 | 720 / 720 | Not the IP101GRR, which is the commercial-temperature part |
| Tokmas PN5321A3HN (C53457895) | NXP PN5321A3HN/C106 (C28925) | 324 / 490 | Mutual alternates: Tokmas copies NXP's pin table. Check the firmware version and the antenna tuning on the first board |
| TI TLV62569DBVR (C141836) | SGMICRO SGM61020XN5G/TR (C5153643) | 2930 / 2977 | For U103 only. Same SOT-23-5 pins, 0.6 V reference, 2 A: the divider stays. The core converter U202 must stay the TLV62569 (design notes, "Power") |
| TI LM74700QDBVRQ1 (C2941042) | Maxinmicro MX74700T (C22468156) | 47392 / 48337 | Same pins; 300 uA instead of 80 uA, not automotive-qualified |
| TI TLV803SDBZR (C132016) | 3PEAK TPV803S-3STR (C2842356) | 9260 / 9265 | Same pins; resets at 2.85 to 3.00 V, holds the reset 140 to 280 ms |
| Infineon IRLML0030TRPBF (C67272) | Diodes DMN3023L-7 (C443825) | 6560 / 6902 | Same SOT-23 pins; 25 mOhm at 10 V, +-20 V gate |
| Littelfuse SMBJ28CA (C151259) | MDD SMBJ28CA (C115825) | 40020 / 40023 | Same ratings |
| R+O SS310 (C7420364) | MDD SS310 (C15874) | 240900 / 240870 | 100 V 3 A, 0.85 V at 3 A; junction rated 125 C instead of 150 C |
| YAGEO RT0603BRD07330KL, 330 k 0.1 % (C861327) | Uniroyal TC0325B3303T5F (C2989388) | 3100 / 3620 | Same ratings |
| YAGEO RT0402BRD0729K4L, 29.4 k 0.1 % (C852690) | Panasonic ERA-2AEB2942X (C2074881) | 0 / 0 | Same ratings. FH TD03G2942BT (C667085, 1160 / 1174) has the value and tolerance but is 0603 |
| YAGEO RT0402BRD0797K6L, 97.6 k 0.1 % (C852964) | Viking ARG02BTC9762 (C2686423) | 9700 / 9732 | Same ratings |
| Diodes AP63205WU-7 (C2071056) | SCT SCT2325TVBR (C509064) | 2272 / 2272 | Same pins, fixed 5 V; SCT's examples use 6.8 to 10 uH |
| Diodes AP3032KTR-G1 (C264086) | MSKSEMI MSAP3032KTR-G1 (C49208388) | 2505 / 2539 | Same pins and 0.2 V feedback; 1.2 MHz, PWM dimming 20 kHz to 1 MHz |
| TI TCA9554PWR (C477924) | NXP PCA9554PW,118 (C17230) | 18272 / 18272 | Same address range 0x20 to 0x27; not the PCA9554A |
| TI SN74LV1T125DBVR (C473338) | I-core AiP74LV1T125GB235.TR (C5354320) | 2690 / 2694 | Same pins and input thresholds |
| TI DRV5032FADBZR (C140921) | TI DRV5032FBDBZR (C2655033) | 100 / 101 | Same pins, samples at 5 Hz instead of 20 Hz |
| ST USBLC6-2SC6 (C7519) | ST USBLC6-2SC6Y (C2969755) | 5010 / 5157 | Automotive grade, same pins |
| AOS AO3400A (C20917) | UMW AO3400A (C347475) | 964460 / 998789 | Same SOT-23 pins and ratings |
| HRO TYPE-C-31-M-12 (C165948) | HRO TYPE-C-31-M-12A (C5337088) | 2865 / 2949 | Identical drawing and land pattern |
| CUI PJ-002A (C3096082) | Same Sky PJ-002AH (C2961147) | 925 / 1305 | Identical drawing and land pattern |
| OPSCO SK6812MINI-E (C5149201) | OPSCO SK6812MINI-EA (C5378731) | 29520 / 29520 | Same datasheet apart from the part number |
| Huaneng MLT-8530 (C94599) | XHXDZ SMD8530-16 ohm (C49246948) | 30830 / 30830 | 16 ohm, 2.7 kHz, same size; check which pad is + |
| ESP32-C6-MINI-1U-H4 (C20627095) | ESP32-C6-MINI-1U-N4 (C7558096) | 0 / 0 | Rated to 85 C only |
| ESP32-P4NRW32X (C54540373) | ESP32-P4NRW16X (JLCPCB C55820335) | 0 / 0 | 16 MB PSRAM: the firmware must fit |
| SDAPO DP9900M-5V (C5380106) | Silvertel Ag9905M | 0 | Same pin table and pin positions (SDAPO datasheet section 4.1, Silvertel Ag9900 fig. 3); check its seated height against the case, which leaves 13.9 mm |

No alternate was found for the IP101GRI from another maker, the LIS2DH12TR (the
SC7A20H looks similar but has another pin order and would put VDD on a ground pad;
ST's IIS2DHTR fits, one piece in stock), the VCNL4040, the HY931147C (its PoE
bridges are unusual), the FH12-40S (no identical land pattern), the WAGO 250-202 and
the eFuse TPS259470A (TI's TPS259470LRPWR has the same pins but latches off after a
fault, and none was in stock). The parts lists name an alternate for the other small
discretes (diodes, ferrites, crystals, fuses, inductors, electrolytic capacitors);
the plain resistors and capacitors take any part of the same value, rating and
package.

ST's LIS2DE12TR (C155639) was checked as a stand-in for the accelerometer U702: same
LGA-12 pins, same I2C address and the same WHO_AM_I value (0x33), but it gives 8-bit
data only (the high bytes OUT_X_H, OUT_Y_H, OUT_Z_H; 15.6 mg per digit at ±2 g). It
fits the board unchanged; the firmware would have to read 8-bit data, which is
enough for the tamper detection. One piece in stock, so it is no sourcing fix and is
not listed as an approved alternate.

## Sourcing plan for the parts JLCPCB does not stock

- **ESP32-P4NRW32X (U201)**: 0 at JLCPCB and LCSC. Espressif is the only maker.
  Order through JLCPCB's global sourcing (it buys from Espressif's distributors and
  holds the parts for the order) or send a consignment to JLCPCB. Expect several
  weeks; order 10 % more than the boards plus 5 pieces for rework, and keep the
  spares. Make sure the order says NRW32X: the variants without X are end of life.
- **3.3 V converter (U103)**: the AP63203WU-7 fitted first had none at JLCPCB and
  LCSC and no stocked drop-in. U103 is now a TI TLV62569DBVR (C141836), the same
  part as the core converter U202: one parts line for both, 490416 at JLCPCB, and
  the SGM61020 as second source for U103 (see the design notes, "Power").
- **ESP32-C6-MINI-1U-H4 (U301)**: in stock (1851 / 3302). The -N4 is the fallback
  if the -H4 runs out, at the cost of its 85 C rating (the thermal estimate has the
  module at 79 C in a room of 40 C).
- **DP9900M-5V (U102, Ethernet version only)**: 38 in stock. Reserve them with the
  order or source Silvertel Ag9905M through a distributor, and check its fit on the
  footprint first.
- **PN532 (U501)**: Tokmas 123, NXP 324 / 490. Either fits. NXP lists the PN532 as
  not recommended for new designs; for a revision B plan the move to a current
  reader IC (NXP PN7160 or ST ST25R3916). That needs a new driver in the firmware,
  which today talks the PN532's protocol, and a new matching network. Until then,
  buy enough PN532 for the planned production with the first order.
- **Wi-Fi antenna** (not assembled by JLCPCB): the certified Shanghai Deman
  TFPD08H10060011 is not sold by LCSC, Mouser or DigiKey. Ask Espressif's sales or
  Deman for a quote and a minimum quantity. The stocked fallback is Taoglas
  GW.26.0111 on a CAB.A02 cable; see `docs/compliance.md` for what that changes for
  the radio approval.
- **Display panel** (not assembled by JLCPCB): a commodity part without a
  guaranteed part number. Agree on a fixed type with the supplier and check every
  batch against the drawing (design notes, "Display mounting and flex").
