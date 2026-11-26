# Bauteile: Lebenszyklus, Alternativen und Beschaffung
<!-- llms-description: Lebenszyklus, freigegebene Alternativen und Beschaffung jedes Bauteils auf der Touch-P4-Platine. -->

Was jeder IC und jedes Modul auf der Touch-P4-Platine ist, ob sein Hersteller es noch fertigt,
was es ersetzen kann und wie man die Bauteile beschafft, die JLCPCB nicht führt. Die Stücklisten
in `fab/jlcpcb/` tragen dieselben Daten je Zeile (Spalten Manufacturer,
Description, Alternate, Lifecycle); die Daten liegen in
`scripts/bootstrap/parts_info.py`. Stand vom 25. November 2026; prüfen Sie vor einer
Bestellung erneut.

## Lebenszyklus der ICs und Module

Der eigene Status des Herstellers, wo der Hersteller einen veröffentlicht, sonst der Bauteilstatus,
den DigiKey zeigt. "Nicht angegeben" heißt, dass keiner einen nennt; der Lagerbestand bei LCSC ist dann das einzige
Signal.

| Bauteil | Ref | Status | Quelle |
|---|---|---|---|
| Espressif ESP32-P4NRW32X | U201 | Serienfertigung. Die Varianten ohne X (NRW32, NRW16) sind EOL: Bestellen Sie das X | [products.espressif.com](https://products.espressif.com/) |
| Espressif ESP32-C5-MINI-1-N4-V1.2 | U301 | Serienfertigung: sein Datenblatt ist v1.4, ein offizieller Release, den Espressif "for products in mass production" herausgibt (Datenblatt, "Datasheet Versioning") | [Datenblatt](https://documentation.espressif.com/esp32-c5-mini-1_mini-1u_datasheet_en.pdf) |
| Winbond W25Q128JVSIQ | U203 | Aktiv | [DigiKey](https://www.digikey.com/en/products/detail/winbond-electronics/W25Q128JVSIQ/5803943) |
| IC Plus IP101GRI | U401 | nicht angegeben (auf der Website des Herstellers gelistet) | [icplus.com.tw](https://www.icplus.com.tw/products/1?locale=en) |
| Tokmas PN5321A3HN | U501 | nicht angegeben | keine gefunden |
| NXP PN5321A3HN/C106 (Alternative zu U501) | | **Not Recommended for New Designs**; NXP verweist auf den PN7160 | [nxp.com](https://www.nxp.com/products/PN5321A3HN) |
| TI TLV62569DBVR | U103, U202, U302 | ACTIVE | [ti.com](https://www.ti.com/product/TLV62569/part-details/TLV62569DBVR) |
| TI TPS259470ARPWR | U105 | ACTIVE | [ti.com](https://www.ti.com/product/TPS25947/part-details/TPS259470ARPWR) |
| TI LM74700QDBVRQ1 | U106, U107 | ACTIVE | [ti.com](https://www.ti.com/product/LM74700-Q1/part-details/LM74700QDBVRQ1) |
| TI TLV803SDBZR | U204 | ACTIVE | [ti.com](https://www.ti.com/product/TLV803) |
| Diodes AP63205WU-7 | U104 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=AP63205WU-7) |
| Diodes AP3032KTR-G1 | U601 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=AP3032KTR-G1) |
| TI TCA9554PWR | U602 | ACTIVE | [ti.com](https://www.ti.com/product/TCA9554/part-details/TCA9554PWR) |
| TI SN74LV1T125DBVR | U701 | ACTIVE | [ti.com](https://www.ti.com/product/SN74LV1T125/part-details/SN74LV1T125DBVR) |
| ST LIS2DH12TR | U702 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=LIS2DH12TR) |
| TI DRV5032FADBZR | U703 | ACTIVE | [ti.com](https://www.ti.com/product/DRV5032/part-details/DRV5032FADBZR) |
| Vishay VCNL4040M3OE | U704 | Aktiv. Das Suffix -H3 ist abgekündigt: nicht bestellen | [DigiKey](https://www.digikey.com/en/products/detail/vishay-semiconductor-opto-division/VCNL4040M3OE/5171283) |
| ST USBLC6-2SC6 | U101, U603, U604 | Aktiv | [DigiKey](https://www.digikey.com/en/products/detail/stmicroelectronics/USBLC6-2SC6/1040559) |
| SDAPO DP9900M-5V | U102 | nicht angegeben (als aktuelles Produkt gelistet) | [sdapo.com](https://www.sdapo.com/show/102.html) |
| Silvertel Ag9905M (Alternative zu U102) | | nicht als NRND markiert; unter "Extended Range" geführt | [silvertel.com](https://silvertel.com/Ag9900/) |
| AOS AO3400A | Q701 | Full Production | [aosmd.com](https://aosmd.com/products/mosfets/low-voltage-mosfets-12v-30v/ao3400a) |
| Infineon IRLML0030TRPBF | Q101, Q102 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=IRLML0030TRPBF) |
| HanRun HY931147C | J401 | nicht angegeben | keine gefunden |
| Hirose FH12-40S-0.5SH(55) | J601 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=FH12-40S-0.5SH(55)) |
| HRO TYPE-C-31-M-12 | J101 | nicht angegeben | keine gefunden |
| Same Sky (CUI) PJ-002A | J102 | Aktiv | [DigiKey](https://www.digikey.com/en/products/detail/same-sky-formerly-cui-devices/PJ-002A/96962) |
| WAGO 250-202 | J103 | Aktiv | [DigiKey](https://www.digikey.com/en/products/detail/wago-corporation/250-202/15573398) |
| OPSCO SK6812MINI-E | D701 bis D708 | nicht angegeben | keine gefunden |
| Huaneng MLT-8530 | BZ701 | nicht angegeben | keine gefunden |

Für kein Bauteil liegt eine Abkündigung (End of Life) oder Last-Time-Buy-Mitteilung seines Herstellers vor.

## Freigegebene Alternativen

Eine Alternative wird aufgeführt, wenn Pintabelle und Gehäuse ihres Herstellers zum verbauten Bauteil passen.
Der Lagerbestand ist LCSC / JLCPCB am 25. November 2026.

| Verbaut | Alternative | Lager | Hinweis |
|---|---|---|---|
| Winbond W25Q128JVSIQ (C97521) | GigaDevice GD25Q128ESIGR (C2928891) | 19953 / 20899 | Gleiche SOP-8-208-mil-Pintabelle; ESP-IDF aktiviert seinen Quad-Modus |
| IC Plus IP101GRI (C703537) | dasselbe Bauteil, LCSC C910373 | 720 / 720 | Nicht der IP101GRR, der die Variante für den kommerziellen Temperaturbereich ist |
| Tokmas PN5321A3HN (C53457895) | NXP PN5321A3HN/C106 (C28925) | 324 / 490 | Gegenseitige Alternativen: Tokmas kopiert die Pintabelle von NXP. Prüfen Sie auf der ersten Platine die Firmware-Version und die Antennenabstimmung |
| TI TLV62569DBVR (C141836) | SGMICRO SGM61020XN5G/TR (C5153643) | 2930 / 2977 | Nur für U103 und U302. Gleiche SOT-23-5-Pins, 0,6 V Referenz, 2 A: Der Teiler bleibt. Der Kernwandler U202 muss der TLV62569 bleiben (Designnotizen, "Spannungsversorgung") |
| TI LM74700QDBVRQ1 (C2941042) | Maxinmicro MX74700T (C22468156) | 47392 / 48337 | Gleiche Pins; 300 uA statt 80 uA, nicht nach Automotive-Standard qualifiziert |
| TI TLV803SDBZR (C132016) | 3PEAK TPV803S-3STR (C2842356) | 9260 / 9265 | Gleiche Pins; setzt bei 2,85 bis 3,00 V zurück, hält den Reset 140 bis 280 ms |
| Infineon IRLML0030TRPBF (C67272) | Diodes DMN3023L-7 (C443825) | 6560 / 6902 | Gleiche SOT-23-Pins; 25 mOhm bei 10 V, +-20 V Gate |
| Littelfuse SMBJ28CA (C151259) | MDD SMBJ28CA (C115825) | 40020 / 40023 | Gleiche Nennwerte |
| R+O SS310 (C7420364) | MDD SS310 (C15874) | 240900 / 240870 | 100 V 3 A, 0,85 V bei 3 A; Sperrschicht für 125 C statt 150 C ausgelegt |
| YAGEO RT0603BRD07330KL, 330 k 0,1 % (C861327) | Uniroyal TC0325B3303T5F (C2989388) | 3100 / 3620 | Gleiche Nennwerte |
| YAGEO RT0402BRD0729K4L, 29,4 k 0,1 % (C852690) | Panasonic ERA-2AEB2942X (C2074881) | 0 / 0 | Gleiche Nennwerte. FH TD03G2942BT (C667085, 1160 / 1174) hat Wert und Toleranz, ist aber 0603 |
| YAGEO RT0402BRD0797K6L, 97,6 k 0,1 % (C852964) | Viking ARG02BTC9762 (C2686423) | 9700 / 9732 | Gleiche Nennwerte |
| Diodes AP63205WU-7 (C2071056) | SCT SCT2325TVBR (C509064) | 2272 / 2272 | Gleiche Pins, fest 5 V; die Beispiele von SCT verwenden 6,8 bis 10 uH |
| Diodes AP3032KTR-G1 (C264086) | MSKSEMI MSAP3032KTR-G1 (C49208388) | 2505 / 2539 | Gleiche Pins und 0,2 V Rückkopplung; 1,2 MHz, PWM-Dimmung 20 kHz bis 1 MHz |
| TI TCA9554PWR (C477924) | NXP PCA9554PW,118 (C17230) | 18272 / 18272 | Gleicher Adressbereich 0x20 bis 0x27; nicht der PCA9554A |
| TI SN74LV1T125DBVR (C473338) | I-core AiP74LV1T125GB235.TR (C5354320) | 2690 / 2694 | Gleiche Pins und Eingangsschwellen |
| TI DRV5032FADBZR (C140921) | TI DRV5032FBDBZR (C2655033) | 100 / 101 | Gleiche Pins, tastet mit 5 Hz statt 20 Hz ab |
| ST USBLC6-2SC6 (C7519) | ST USBLC6-2SC6Y (C2969755) | 5010 / 5157 | Automotive-Qualität, gleiche Pins |
| AOS AO3400A (C20917) | UMW AO3400A (C347475) | 964460 / 998789 | Gleiche SOT-23-Pins und Nennwerte |
| HRO TYPE-C-31-M-12 (C165948) | HRO TYPE-C-31-M-12A (C5337088) | 2865 / 2949 | Identische Zeichnung und identisches Land Pattern |
| CUI PJ-002A (C3096082) | Same Sky PJ-002AH (C2961147) | 925 / 1305 | Identische Zeichnung und identisches Land Pattern |
| OPSCO SK6812MINI-E (C5149201) | OPSCO SK6812MINI-EA (C5378731) | 29520 / 29520 | Gleiches Datenblatt bis auf die Teilenummer |
| Huaneng MLT-8530 (C94599) | XHXDZ SMD8530-16 ohm (C49246948) | 30830 / 30830 | 16 Ohm, 2,7 kHz, gleiche Größe; prüfen Sie, welches Pad + ist |
| ESP32-C5-MINI-1-N4-V1.2 (C54951860) | ESP32-C5-MINI-1-N4 (C50346179) | 0 / 0 | Dasselbe Modul ohne das Revisionssuffix gelistet. Das ESP32-C5-MINI-1-N8R2 hat die gleichen Pins und dasselbe Land Pattern (8 MB Flash, 2 MB PSRAM an IO15, der hier offen ist), ist aber weder bei JLCPCB noch bei LCSC zu haben |
| ESP32-P4NRW32X (C54540373) | ESP32-P4NRW16X (JLCPCB C55820335) | 0 / 0 | 16 MB PSRAM: Die Firmware muss passen |
| SDAPO DP9900M-5V (C5380106) | Silvertel Ag9905M | 0 | Gleiche Pintabelle und Pinpositionen (SDAPO-Datenblatt Abschnitt 4.1, Silvertel Ag9900 Abb. 3); prüfen Sie seine Einbauhöhe gegen das Gehäuse, das 13,9 mm lässt |

Für den IP101GRI von einem anderen Hersteller wurde keine Alternative gefunden, ebenso nicht für den LIS2DH12TR (der
SC7A20H sieht ähnlich aus, hat aber eine andere Pinreihenfolge und würde VDD auf ein Massepad legen;
der IIS2DHTR von ST passt, ein Stück auf Lager), den VCNL4040, den HY931147C (seine PoE-Brücken
sind ungewöhnlich), den FH12-40S (kein identisches Land Pattern), den WAGO 250-202 und
den eFuse TPS259470A (der TPS259470LRPWR von TI hat die gleichen Pins, schaltet aber nach einem
Fehler dauerhaft ab, und keiner war lieferbar). Die Stücklisten nennen eine Alternative für die anderen kleinen
Diskreten (Dioden, Ferrite, Quarze, Sicherungen, Induktivitäten, Elektrolytkondensatoren);
die einfachen Widerstände und Kondensatoren nehmen jedes Bauteil mit gleichem Wert, gleicher Spannungsfestigkeit und
gleichem Gehäuse.

Der LIS2DE12TR von ST (C155639) wurde als Ersatz für den Beschleunigungssensor U702 geprüft: gleiche
LGA-12-Pins, gleiche I2C-Adresse und gleicher WHO_AM_I-Wert (0x33), aber er liefert nur 8-Bit-
Daten (die oberen Bytes OUT_X_H, OUT_Y_H, OUT_Z_H; 15,6 mg je Digit bei ±2 g). Er
passt unverändert auf die Platine; die Firmware müsste 8-Bit-Daten lesen, was für
die Manipulationserkennung genügt. Ein Stück auf Lager, er ist also keine Beschaffungslösung und
wird nicht als freigegebene Alternative geführt.

## Beschaffungsplan für die Bauteile, die JLCPCB nicht führt

- **ESP32-P4NRW32X (U201)**: 0 bei JLCPCB und LCSC. Espressif ist der einzige Hersteller.
  Bestellen Sie über das Global Sourcing von JLCPCB (es kauft bei Espressifs Distributoren und
  hält die Bauteile für die Bestellung bereit) oder senden Sie eine Kundenbeistellung an JLCPCB. Rechnen Sie mit mehreren
  Wochen; bestellen Sie 10 % mehr als Platinen plus 5 Stück für Nacharbeit und behalten Sie die
  Reserve. Achten Sie darauf, dass die Bestellung NRW32X nennt: Die Varianten ohne X sind abgekündigt.
- **3,3-V-Wandler (U103)**: Vom zuerst verbauten AP63203WU-7 gab es bei JLCPCB und
  LCSC keinen Bestand und keinen lieferbaren Ersatz. U103 ist jetzt ein TI TLV62569DBVR (C141836), dasselbe
  Bauteil wie der Kernwandler U202: eine Stücklistenzeile für beide, 490416 bei JLCPCB, und
  der SGM61020 als zweite Quelle für U103 (siehe die Designnotizen, "Spannungsversorgung").
- **ESP32-C5-MINI-1-N4-V1.2 (U301)**: 614 bei JLCPCB am 25. November 2026, das einzige
  lieferbare C5-Modul mit Platinenantenne (kein ESP32-C5-WROOM-1 in irgendeiner Variante war
  lieferbar). Kaufen Sie die Module für die geplante Produktion mit der ersten Bestellung oder
  lassen Sie sie über das Global Sourcing von JLCPCB wie den ESP32-P4 beschaffen. Seine Alternativen
  haben keinen Bestand (Tabelle oben).
- **DP9900M-5V (U102, nur Ethernet-Version)**: 38 auf Lager. Reservieren Sie sie mit der
  Bestellung oder beschaffen Sie den Silvertel Ag9905M über einen Distributor, und prüfen Sie zuerst die Passung auf dem
  Footprint.
- **PN532 (U501)**: Tokmas 123, NXP 324 / 490. Beide passen. NXP führt den PN532 als
  nicht für Neuentwicklungen empfohlen; planen Sie für eine Revision B den Wechsel auf einen aktuellen
  Leser-IC (NXP PN7160 oder ST ST25R3916). Das braucht einen neuen Treiber in der Firmware,
  die heute das Protokoll des PN532 spricht, und ein neues Anpassnetzwerk. Kaufen Sie bis dahin
  mit der ersten Bestellung genug PN532 für die geplante Produktion.
- **Displaypanel** (nicht von JLCPCB bestückt): ein Standardteil ohne
  garantierte Teilenummer. Vereinbaren Sie mit dem Lieferanten einen festen Typ und prüfen Sie jede
  Charge gegen die Zeichnung (Designnotizen, "Display-Befestigung und Flexkabel").
