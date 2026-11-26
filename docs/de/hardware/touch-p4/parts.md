# Bauteile und Beschaffung
<!-- llms-description: Lebenszyklus, freigegebene Alternativen, Beschaffungsplan, Kosten und Beschaffungsrisiken der Bauteile auf der Touch-P4-Platine. -->

Was jeder IC und jedes Modul auf der Platine ist, ob sein Hersteller es noch fertigt, was es ersetzen
kann, wie man die Bauteile beschafft, die JLCPCB nicht führt, und was die Platine kostet. Für alle, die
Bauteile bestellen oder ändern.

Die Stücklisten in `fab/jlcpcb/` tragen dieselben Daten je Zeile (Spalten Manufacturer, Description,
Alternate, Lifecycle). Die Daten liegen in `scripts/bootstrap/parts_info.py`. Lebenszyklus, Bestand und
Preise wurden im November 2026 abgelesen; prüfen Sie sie vor einer Bestellung erneut.

## Lebenszyklus der ICs und Module

Der eigene Status des Herstellers, wo der Hersteller einen veröffentlicht, sonst der Bauteilstatus, den
DigiKey zeigt. „Nicht angegeben“ heißt, dass keiner einen nennt; der Lagerbestand bei LCSC ist dann das
einzige Signal. Für kein Bauteil liegt eine Abkündigung (End of Life) oder Last-Time-Buy-Mitteilung
seines Herstellers vor.

| Bauteil | Ref | Status | Quelle |
|---|---|---|---|
| Espressif ESP32-P4NRW32X | U201 | Serienfertigung. Die Varianten ohne X (NRW32, NRW16) sind EOL: Bestellen Sie das X | [products.espressif.com](https://products.espressif.com/) |
| Espressif ESP32-C5-MINI-1-N4-V1.2 | U301 | Serienfertigung: Sein Datenblatt ist v1.4, ein offizieller Release, den Espressif „for products in mass production“ herausgibt (Datenblatt, „Datasheet Versioning“) | [Datenblatt](https://documentation.espressif.com/esp32-c5-mini-1_mini-1u_datasheet_en.pdf) |
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
| Silvertel Ag9905M (Alternative zu U102) | | nicht als NRND markiert; unter „Extended Range“ geführt | [silvertel.com](https://silvertel.com/Ag9900/) |
| AOS AO3400A | Q701 | Full Production | [aosmd.com](https://aosmd.com/products/mosfets/low-voltage-mosfets-12v-30v/ao3400a) |
| Infineon IRLML0030TRPBF | Q101, Q102 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=IRLML0030TRPBF) |
| HanRun HY931147C | J401 | nicht angegeben | keine gefunden |
| Hirose FH12-40S-0.5SH(55) | J601 | Aktiv | [DigiKey](https://www.digikey.com/en/products/result?keywords=FH12-40S-0.5SH(55)) |
| HRO TYPE-C-31-M-12 | J101 | nicht angegeben | keine gefunden |
| Same Sky (CUI) PJ-002A | J102 | Aktiv | [DigiKey](https://www.digikey.com/en/products/detail/same-sky-formerly-cui-devices/PJ-002A/96962) |
| WAGO 250-202 | J103 | Aktiv | [DigiKey](https://www.digikey.com/en/products/detail/wago-corporation/250-202/15573398) |
| OPSCO SK6812MINI-E | D701 bis D708 | nicht angegeben | keine gefunden |
| Huaneng MLT-8530 | BZ701 | nicht angegeben | keine gefunden |

## Freigegebene Alternativen

Eine Alternative wird aufgeführt, wenn Pintabelle und Gehäuse ihres Herstellers zum verbauten Bauteil
passen. „Kein Bestand“ heißt: keiner bei LCSC oder JLCPCB im November 2026.

| Verbaut | Alternative | Hinweis |
|---|---|---|
| Winbond W25Q128JVSIQ (C97521) | GigaDevice GD25Q128ESIGR (C2928891) | Gleiche SOP-8-208-mil-Pintabelle; ESP-IDF aktiviert seinen Quad-Modus |
| IC Plus IP101GRI (C703537) | dasselbe Bauteil, LCSC C910373 | Nicht der IP101GRR, der die Variante für den kommerziellen Temperaturbereich ist |
| Tokmas PN5321A3HN (C53457895) | NXP PN5321A3HN/C106 (C28925) | Gegenseitige Alternativen: Tokmas kopiert die Pintabelle von NXP. Prüfen Sie auf der ersten Platine die Firmware-Version und die Antennenabstimmung |
| TI TLV62569DBVR (C141836) | SGMICRO SGM61020XN5G/TR (C5153643) | Nur für U103 und U302. Gleiche SOT-23-5-Pins, 0,6 V Referenz, 2 A: Der Teiler bleibt. Der Kernwandler U202 muss der TLV62569 bleiben ([Designnotizen](hardware/touch-p4/design-notes.md#stromversorgung)) |
| TI LM74700QDBVRQ1 (C2941042) | Maxinmicro MX74700T (C22468156) | Gleiche Pins; 300 uA statt 80 uA, nicht nach Automotive-Standard qualifiziert |
| TI TLV803SDBZR (C132016) | 3PEAK TPV803S-3STR (C2842356) | Gleiche Pins; setzt bei 2,85 bis 3,00 V zurück, hält den Reset 140 bis 280 ms |
| Infineon IRLML0030TRPBF (C67272) | Diodes DMN3023L-7 (C443825) | Gleiche SOT-23-Pins; 25 mOhm bei 10 V, +-20 V Gate |
| Littelfuse SMBJ28CA (C151259) | MDD SMBJ28CA (C115825) | Gleiche Nennwerte |
| R+O SS310 (C7420364) | MDD SS310 (C15874) | 100 V 3 A, 0,85 V bei 3 A; Sperrschicht für 125 C statt 150 C ausgelegt |
| YAGEO RT0603BRD07330KL, 330 k 0,1 % (C861327) | Uniroyal TC0325B3303T5F (C2989388) | Gleiche Nennwerte |
| YAGEO RT0402BRD0729K4L, 29,4 k 0,1 % (C852690) | Panasonic ERA-2AEB2942X (C2074881) | Gleiche Nennwerte; kein Bestand. FH TD03G2942BT (C667085) hat Wert und Toleranz, ist aber 0603 |
| YAGEO RT0402BRD0797K6L, 97,6 k 0,1 % (C852964) | Viking ARG02BTC9762 (C2686423) | Gleiche Nennwerte |
| Diodes AP63205WU-7 (C2071056) | SCT SCT2325TVBR (C509064) | Gleiche Pins, fest 5 V; die Beispiele von SCT verwenden 6,8 bis 10 uH |
| Diodes AP3032KTR-G1 (C264086) | MSKSEMI MSAP3032KTR-G1 (C49208388) | Gleiche Pins und 0,2 V Rückkopplung; 1,2 MHz, PWM-Dimmung 20 kHz bis 1 MHz |
| TI TCA9554PWR (C477924) | NXP PCA9554PW,118 (C17230) | Gleicher Adressbereich 0x20 bis 0x27; nicht der PCA9554A |
| TI SN74LV1T125DBVR (C473338) | I-core AiP74LV1T125GB235.TR (C5354320) | Gleiche Pins und Eingangsschwellen |
| TI DRV5032FADBZR (C140921) | TI DRV5032FBDBZR (C2655033) | Gleiche Pins, tastet mit 5 Hz statt 20 Hz ab; geringer Bestand |
| ST USBLC6-2SC6 (C7519) | ST USBLC6-2SC6Y (C2969755) | Automotive-Qualität, gleiche Pins |
| AOS AO3400A (C20917) | UMW AO3400A (C347475) | Gleiche SOT-23-Pins und Nennwerte |
| HRO TYPE-C-31-M-12 (C165948) | HRO TYPE-C-31-M-12A (C5337088) | Identische Zeichnung und identisches Land Pattern |
| CUI PJ-002A (C3096082) | Same Sky PJ-002AH (C2961147) | Identische Zeichnung und identisches Land Pattern |
| OPSCO SK6812MINI-E (C5149201) | OPSCO SK6812MINI-EA (C5378731) | Gleiches Datenblatt bis auf die Teilenummer |
| Huaneng MLT-8530 (C94599) | XHXDZ SMD8530-16 ohm (C49246948) | 16 Ohm, 2,7 kHz, gleiche Größe; prüfen Sie, welches Pad + ist |
| ESP32-C5-MINI-1-N4-V1.2 (C54951860) | ESP32-C5-MINI-1-N4 (C50346179) | Dasselbe Modul ohne das Revisionssuffix gelistet; kein Bestand. Das ESP32-C5-MINI-1-N8R2 hat die gleichen Pins und dasselbe Land Pattern (8 MB Flash, 2 MB PSRAM an IO15, der hier offen ist), ist aber weder bei JLCPCB noch bei LCSC zu haben |
| ESP32-P4NRW32X (C54540373) | ESP32-P4NRW16X (JLCPCB C55820335) | 16 MB PSRAM: Die Firmware muss passen; kein Bestand |
| SDAPO DP9900M-5V (C5380106) | Silvertel Ag9905M | Gleiche Pintabelle und Pinpositionen (SDAPO-Datenblatt Abschnitt 4.1, Silvertel Ag9900 Abb. 3). Nur die Ag9905-M und Ag9905-MT passen; die -MTB und -LPB haben fünf Pins in anderer Reihenfolge. Prüfen Sie seine Einbauhöhe gegen das Gehäuse, das 13,9 mm lässt. Nicht bei JLCPCB |

Keine Alternative gefunden für:

- den IP101GRI von einem anderen Hersteller;
- den LIS2DH12TR: Der SC7A20H sieht ähnlich aus, hat aber eine andere Pinreihenfolge und würde VDD auf
  ein Massepad legen; der IIS2DHTR von ST passt, hatte aber ein Stück auf Lager. Der LIS2DE12TR von ST
  (C155639) passt unverändert auf die Platine (gleiche LGA-12-Pins, I2C-Adresse und WHO_AM_I 0x33),
  liefert aber nur 8-Bit-Daten (OUT_X_H, OUT_Y_H, OUT_Z_H; 15,6 mg je Digit bei ±2 g), was für die
  Manipulationserkennung genügt; mit einem Stück auf Lager wird er nicht aufgeführt;
- den VCNL4040, den HY931147C (seine PoE-Brücken sind ungewöhnlich), den FH12-40S (kein identisches Land
  Pattern) und den WAGO 250-202;
- den eFuse TPS259470A: Der TPS259470LRPWR von TI hat die gleichen Pins, schaltet aber nach einem Fehler
  dauerhaft ab und hatte keinen Bestand.

Die Stücklisten nennen eine Alternative für die anderen kleinen Diskreten (Dioden, Ferrite, Quarze,
Sicherungen, Induktivitäten, Elektrolytkondensatoren). Einfache Widerstände und Kondensatoren nehmen jedes
Bauteil mit gleichem Wert, gleicher Spannungsfestigkeit und gleichem Gehäuse.

## Bauteile, die JLCPCB nicht führt

- **ESP32-P4NRW32X (U201)**: keiner bei JLCPCB oder LCSC; Espressif ist der einzige Hersteller. Bestellen
  Sie über das Global Sourcing von JLCPCB (es kauft bei Espressifs Distributoren und hält die Bauteile für
  die Bestellung bereit) oder senden Sie eine Kundenbeistellung. Rechnen Sie mit mehreren Wochen.
  Bestellen Sie 10 % mehr als Platinen plus 5 Stück für Nacharbeit und behalten Sie die Reserve. Die
  Bestellung muss NRW32X nennen (Silizium v3.x): Die Varianten ohne X sind abgekündigt.
- **ESP32-C5-MINI-1-N4-V1.2 (U301)**: einige hundert auf Lager, das einzige lieferbare C5-Modul mit
  Leiterplattenantenne (kein ESP32-C5-WROOM-1 in irgendeiner Variante war lieferbar). Seine Alternativen
  haben keinen Bestand. Kaufen Sie die Module für die geplante Produktion mit der ersten Bestellung oder
  lassen Sie sie über das Global Sourcing beschaffen.
- **DP9900M-5V (U102, nur Ethernet-Version)**: einige Dutzend auf Lager, sinkend. Reservieren Sie sie mit
  der Bestellung oder beschaffen Sie den Silvertel Ag9905M (oder -MT) über einen Distributor und prüfen
  Sie zuerst die Passung.
- **PN532 (U501)**: Das Tokmas-Bauteil und das NXP-Original passen beide, jedes mit höchstens einigen
  hundert auf Lager. NXP führt den PN532 als nicht für Neuentwicklungen empfohlen. Kaufen Sie mit der
  ersten Bestellung genug für die geplante Produktion. Planen Sie für Revision B einen aktuellen Leser-IC
  (NXP PN7160 oder ST ST25R3916); das braucht einen neuen Treiber in der Firmware (die Firmware spricht
  das Protokoll des PN532) und ein neues Anpassnetzwerk.
- **Displaypanel** (nicht von JLCPCB bestückt): ein Standardteil ohne garantierte Teilenummer.
  Vereinbaren Sie mit dem Lieferanten einen festen Typ und prüfen Sie jede Charge gegen die Zeichnung
  ([Designnotizen](hardware/touch-p4/design-notes.md#displaymontage-und-flexkabel)).

Die 3,3-V-Wandler U103 und U302 sind derselbe TLV62569 wie der Kernwandler U202: eine Stücklistenzeile,
hoher Bestand, mit dem SGM61020 als zweiter Quelle für U103 und U302.

## Kosten

Preise vom November 2026, in USD, von JLCPCB.

### Bauteile pro Platine

| | 5 Platinen | 100 Platinen |
|---|---|---|
| WLAN-Version | 27,90 | 19,80 |
| Ethernet/PoE-Version | 38,70 | 27,60 |

Die Tabelle wurde mit einer früheren Stückliste berechnet. Hinzu kommen:

- Eingangsfilter, drei Widerstände, ein zweiter Pegelwandler und der Summerwiderstand: etwa 0,3 pro
  Platine;
- Manipulationssensoren: etwa 2,7 pro Platine (Beschleunigungssensor 0,89, Annäherungssensor 1,57,
  Hall-Schalter 0,17, fünf Kondensatoren, zwei Widerstände), dazu ein Magnet für wenige Cent für das Dock;
- das ESP32-C5-Modul und sein eigener 3,3-V-Wandler: etwa 0,4 pro Platine ab 100 Stück. Die Tabelle wurde
  mit dem ESP32-C6-MINI-1U-H4 berechnet (4,13 / 3,42 / 3,20 für 1 / 30 / 100 Stück); das C5-Modul kostet
  4,90 / 3,78 / 3,36, und sein Wandler (TLV62569, 2,2 uH, 22 uF, 10 uF und Kleinteile, alle schon Zeilen
  der Stückliste) etwa 0,22. Es wird keine externe Antenne und kein Kabel gekauft.

Die größten Zeilen sind der ESP32-P4 (6,15), der PN532 (5,89), das WLAN-Modul (4,19 in der Tabelle) und
der Flash (2,26); bei der Ethernet/PoE-Version außerdem das PoE-Modul (6,70), die Buchse (2,60) und der
PHY (1,03).

### Pro Bestellung

Einmal pro Bestellung berechnet JLCPCB 3 USD für jede Extended-Bauteilzeile (50 Zeilen bei der
WLAN-Version, 57 bei der Ethernet/PoE-Version; bevorzugte Bauteile nicht mitgezählt), die Einrichtungs-
und Schablonengebühren, die unbestückten Platinen und den Versand. Bei fünf Platinen machen allein die
Gebühren für Extended-Bauteile 30 bis 34 USD pro Platine aus, sodass ein kleiner Prototyp pro Platine weit
mehr kostet, als die Bauteiltabelle zeigt.

### Unbestückte Platinen

Aus dem von Hand ausgefüllten Bestellformular von JLCPCB (86 x 143,5 mm, 1,6 mm, grün, langsamste
Fertigungszeit, ohne Versand und Steuer), pro Bestellung. JLCPCBs Prüfung der Gerber-Dateien kann sie noch
ändern.

| Platinen | Vier Lagen, ENIG | Sechs Lagen, ENIG | Sechs Lagen, OSP | Sechs Lagen mit ENIG, pro Platine |
|---|---|---|---|---|
| 5 | 50,70 | 59,00 | 41,00 | 11,80 |
| 10 | 59,70 | 68,40 | 49,00 | 6,84 |
| 30 | 95,90 | 106,00 | 80,80 | 3,53 |
| 50 | 132,00 | 143,60 | 112,70 | 2,87 |
| 100 | 208,50 | 253,50 | 208,30 | 2,54 |

- Sechs Lagen kosten bis 50 Platinen 8 bis 12 mehr pro Bestellung und bei 100 45 mehr (0,45 pro Platine).
  Sie brauchen 7 bis 9 Werktage, vier Lagen 3 bis 6.
- Die Vias kosten nichts extra. Die Option „Min via hole size/diameter“ bleibt bei „0.3mm/(0.4/0.45mm)“:
  Bei Platinen mit Innenlagen ist ein 0,2-mm-Loch kostenlos, wenn das Via 0,45 mm oder breiter ist, und
  das ist das kleinste Via der Platine. „0.2mm/(0.3/0.35mm)“ würde bei 5 Platinen 39 und bei 100 91 mehr
  kosten (die Option, TG155-Material und ein Vierdrahttest).
- ENIG macht bei 5 Platinen 18 des Preises aus und bei 100 45. Die Platine bleibt bei ENIG: OSP schützt
  das Kupfer nur, bis es gelötet wird, und JLCPCB schließt es für Kontaktflächen aus. Die Platine hat
  solche: die vier blanken Masse-Pads für die Metallrückseite des Displays (auf der Seite ohne Bauteile,
  wo die Bestückung sie nicht verzinnen kann) und die 30 Testpunkte, von denen vier das erste Flashen des
  WLAN-Moduls tragen. Unbestückte Platinen mit OSP halten sich außerdem nur drei Monate, und nach dem
  Auspacken etwa eine Woche.
- Die Platine in eine Sechslagenplatine für den MCU (45 x 45 mm: 48,80 für 5, 97,10 für 100) und einen
  Träger aufzuteilen, lohnt sich nicht. Mit einem Vierlagenträger (50,70 und 208,50) kostet das Paar bei
  jeder Menge mehr. Mit einem Zweilagenträger (28,00 und 148,70) kostet es bei 5 Platinen mehr und bei
  100 0,08 weniger pro Leser, vor den Steckverbindern zwischen den Platinen und der zweiten
  Bestückungsbestellung.

### Geprüfte und nicht übernommene Einsparungen

| Änderung | Spart pro Platine | Warum nicht |
|---|---|---|
| 16-MB-Flash GD25Q128ESIG (C2758105) statt des Winbond-Bauteils | 0,5 bis 0,8 | Ein Extended-Bauteil: Die Gebühr frisst die Einsparung unterhalb von etwa zehn Platinen auf. Gleiches Footprint, eine Änderung der LCSC-Nummer |
| DC-Buchse DC-005C-20A (C84007, 24 V, 3 A) statt der PJ-002A | 0,8 | Pins 6,65 mm statt 6,0 mm auseinander: Das Footprint braucht breitere Langlöcher |
| Generischer 40-poliger Displaysteckverbinder statt des Hirose FH12 | etwa 0,4 | Andere Lötlaschen: eine Footprint-Änderung am dichtesten Steckverbinder |
| Lesechip der RC522-Familie (FM17580, Si522, MFRC522-Zweitquellen, 0,3 bis 1) statt des PN532 | etwa 5 | Nur Funk-Frontends: Die Firmware bräuchte einen neuen Treiber einschließlich ISO 14443-4, das der PN532 selbst ausführt, und die Platine ein neues Anpassnetzwerk |
| SRV05-4-P-T7 (C85364, bevorzugtes Bauteil) statt des USBLC6-2SC6 | 3 pro Bestellung (eine Extended-Zeile weniger) | Gleiches Gehäuse und passt zur Verdrahtung, aber das Bauteil eines anderen Herstellers am einen Steckverbinder, den ein ESD-Test trifft, und sein Winkel in JLCPCBs Bibliothek ist ungeprüft |

### Basic- und Extended-Bauteile

Wo ein Bauteil in JLCPCBs Basic- oder Preferred-Liste ein Äquivalent hat, verwendet das Design dieses (die
TVS-Dioden von USB und PoE, die Verpolschutzdiode des DC-Eingangs, 1 uF / 50 V, die 10 pF der
NFC-Anpassung, die 3,9 k des Empfangsteilers). Die Ausnahmen:

- Die drei Kondensatoren des DC-Eingangs: Das Basic-Bauteil 10 uF / 50 V passt auf ihre Pads, ist dort
  aber das falsche Bauteil ([Designnotizen](hardware/touch-p4/design-notes.md#stromversorgung)).
- Der 499-k-Teilerwiderstand des Kernwandlers, den Espressifs Checkliste verlangt.
- 39 pF, 180 pF und 220 pF der NFC-Anpassung, 1,5 Ohm und 6,19 k: Es gibt kein Basic- oder
  Preferred-Bauteil mit diesem Wert. 39 pF, 180 pF und 1,5 Ohm sind Abstimmwerte, die die ersten Platinen
  ohnehin ändern werden.
- Der Strompfad: eFuse, Ideal-Dioden-Controller und sein MOSFET, Supervisor, die zwei TVS des DC-Eingangs
  (SMBJ28A, SMBJ28CA), der 47-uF-Elektrolytkondensator, die drei 0,1-%-Dünnschichtwiderstände des
  eFuse-Teilers sowie 1,65 k, 22,1 k und 2,2 nF. Ob für die letzten drei ein Basic-Bauteil existiert,
  wurde nicht geprüft.

## Beschaffungsrisiken

Über die Bauteile unter [Bauteile, die JLCPCB nicht führt](#bauteile-die-jlcpcb-nicht-führt) hinaus:

| Bauteil | Risiko |
|---|---|
| PN532 (U501) | Das Tokmas-Bauteil (etwa 6 USD) hat Gehäuse und Pinbelegung des NXP-Bauteils, aber sein Datenblatt sagt nichts über die enthaltene Firmware, und es ist mit unserer noch nicht erprobt. Das NXP-Original (etwa 13 USD) passt auf dieselben Pads. JLCPCBs Bibliothek zeichnet die beiden Bauteile um eine Vierteldrehung versetzt: Die Platzierungsdatei korrigiert den Winkel nur für das Tokmas-Bauteil, also nach einer Änderung der Teilenummer `check-footprints` ausführen |
| DP9900M-5V (U102) | Der Bestand sinkt schnell. JLCPCB führt keinen Ag9905 |
| DC-Buchse PJ-002A (J102), Induktivität CKCSA252012-2.2uH/M (L103, L201, zwei pro Platine) | Etwa tausend auf Lager: genug für eine erste Bestellung, knapp für eine Serie |
| Induktivität CKCSA4020-6.8uH/M (L102) | JLCPCBs Bibliothek hat kein Footprint für diese Teilenummer, sodass `check-footprints` sie nicht vergleichen kann. Sie teilt ihr 4 x 4 mm großes Footprint mit L101, hat zwei Pads und keine Polarität. In der Platzierungsvorschau prüfen |

Jede andere Zeile beider Stücklisten hatte mehr als 2000 Stück auf Lager.
