# Pinbelegung und Firmware-Portierung
<!-- llms-description: Pinbelegung der Touch-P4-Platine und die Regeln, die die Leser-Firmware darauf einhalten muss: WLAN-Co-Prozessor, EU-Funkeinstellungen, Leistungs- und Wärmegrenzen. -->

Was die Firmware wissen muss, um auf der Touch-P4-Platine zu laufen: die Regeln, die sie einhalten muss,
die Pinbelegung, die I2C-Geräte, die Manipulationssensoren und was sich gegenüber der ESP32-S3-Firmware
ändert. Für Firmware-Entwickler. Angaben mit „simuliert“ stammen aus den
[Simulationen](hardware/touch-p4/simulations.md); nichts hier wurde bisher an Hardware gemessen. Es folgt
der Espressif-Dokumentation für die verwendeten Bauteile.

## Firmware-Regeln

Jede Regel beschreibt etwas, wogegen sich die Platine nicht selbst schützen kann, oder eine bekannte Falle
ihrer Bauteile. Mit **Harte Anforderung** markierte Regeln sind Pflicht, keine Empfehlung.

| # | Regel | Was sonst passiert | Detail |
|---|---|---|---|
| 1 | Den Buzzer-Pin (GPIO46) nie auf High lassen; den Ton in jedem Fehlerpfad beenden | 180 mA Gleichstrom durch die Spule, das Doppelte ihres Nennwerts; ihr Widerstand ist überlastet | [NFC, Buzzer und LEDs](#nfc-buzzer-und-leds) |
| 2 | LEDs: Weiß höchstens mit 70 %, nur für Sekunden. Dauerlicht mit 30 % oder weniger | Die LEDs sitzen auf schmalem Kupfer zwischen den Aussparungen; dauerhaft weißes Licht mit 70 % macht sie etwa 10 K wärmer als den Rest der Platine | [Temperatur](#temperatur) |
| 3 | Den Temperatursensor des Chips lesen; über etwa 80 °C erst die LEDs, dann die Hintergrundbeleuchtung dimmen | In einem Raum von 40 °C am PoE kommen das Display und das PoE-Modul nahe an ihre Grenzen | [Temperatur](#temperatur) |
| 4 | Den Reset des Ethernet-PHY über den IO-Expander pulsen, bevor der EMAC startet | Der PHY kann mit falscher Adresse oder ohne Takt hochkommen | [Ethernet](#ethernet) |
| 5 | esp-hosted: Board „none“, SDMMC-Slot 0, Reset-GPIO 45; die Reset-Leitung muss auf High enden | Die Vorgaben sind die von Espressifs Platine (Slot 1, GPIO54); der C5 bleibt im Reset: `send_op_cond returned 0x107` | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 6 | Dieselbe esp-hosted-Version auf P4 und C5, 3.1.0 oder neuer; `esp_wifi_remote` passend festgelegt | Keine Verbindung zum Access Point, verlorene Pakete, eine tote Verbindung, ein doppeltes Freigeben von Speicher (Double Free) | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 7 | Das erste in den C5 geflashte Image ist ein aktuelles Release | Nach einem ersten Image von 2.1 bis 2.8 lässt sich der C5 nicht mehr über SDIO aktualisieren | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 8 | Die Treiberstärke von GPIO33 bis 35 und GPIO39 bis 44 auf dem Standardwert oder darunter lassen | Keine Serienwiderstände. Simuliertes Überschwingen: 0,13 V beim Standardwert, 0,8 V bei der stärksten Einstellung | [Ethernet](#ethernet) |
| 9 | SDIO-Timing des C5 auf den Standardflanken; die Verbindung mit 20 MHz starten, dann 40 MHz | CRC-Fehler (`0x109`) | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 10 | Keine ROM-Cache-Funktionen (`Cache_WriteBack_Addr()` und verwandte) im Display-Code; `esp_cache_msync()` verwenden | SDIO läuft in ein Timeout: „Unrecoverable host sdio state“ | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 11 | Während eines NFC-Austauschs keine LED-Daten | Die LED-Daten (800 kHz) liegen neben der Antwort der Karte (848 kHz) | [NFC, Buzzer und LEDs](#nfc-buzzer-und-leds) |
| 12 | Hintergrundbeleuchtung per PWM mit 25 bis 40 kHz | Unter 2,5 kHz startet der Treiber seinen Sanftanlauf in jedem Zyklus neu | [Display und Hintergrundbeleuchtung](#display-und-hintergrundbeleuchtung) |
| 13 | GPIO34 bis 36 bis zu einem Reset auf High oder undefiniert (hochohmig) lassen | Strapping-Pins: auf Low getrieben, startet der Chip im falschen Modus | [GPIO-Belegung](#esp32-p4-gpio-belegung); die Pull-ups der Platine halten sie auf High, solange die Firmware sie nicht auf Low treibt |
| 14 | Am PoE die Platine über 100 mA halten: kein Deep Sleep mit ausgeschalteter Hintergrundbeleuchtung | Unter der Mindestlast des PoE-Moduls kann der Switch den Port aus- und wieder einschalten | [Designnotizen](hardware/touch-p4/design-notes.md#stromversorgung) |
| 15 | Bluetooth: Scan-Fenster deutlich kleiner als das Scan-Intervall; das Verbinden mit den verwendeten Geräten testen | WLAN und Bluetooth teilen sich den einen Funkteil des C5; das Verbinden als Central schlug bei einigen Geräten fehl, bis zu einer Korrektur vom Juli 2026 | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 16 | 802.11ax ist eine Einstellung, keine Konstante | Einige Access Points lassen die Verbindung im 802.11ax-Modus hängen | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |
| 17 | Secure Boot mit RSA-3072. Die Chip-Revision prüfen, bevor der Secure Download Mode aktiviert wird | ECDSA-Secure-Boot hat einen Erratum-Eintrag; bei v3.1 ließ sich der Chip über sein ROM nicht mehr flashen | [Secure Boot und Chip-Revision](#secure-boot-und-chip-revision) |
| 18 | Der Hall-Schalter zählt erst, nachdem er einmal 0 gelesen hat; den Beschleunigungssensor ignorieren, solange der Buzzer ertönt | Ein Leser ohne Dock-Magnet sieht aus wie ein abgenommener; der Buzzer lässt die Platine vibrieren | [Manipulationserkennung](#manipulationserkennung) |
| 19 | **Harte Anforderung.** Wenn USB die einzige Quelle ist, innerhalb dessen bleiben, was die USB-Quelle bietet | Ein USB-2.0-Port liefert 500 mA, die Platine zieht bis zu 0,9 A: Der Port schaltet ab, oder das eFuse schaltet die Platine aus | [Leistungsgrenzen je Quelle](#leistungsgrenzen-je-quelle) |
| 20 | **Harte Anforderung.** Alle LED-Kanäle zusammen unter 100 mA im Dauerbetrieb (Regel 2 hält sie dort) | Die 30 % Reserve der 5-V-Quellen setzen dies voraus ([Designnotizen](hardware/touch-p4/design-notes.md#leistungsbilanz)) | [NFC, Buzzer und LEDs](#nfc-buzzer-und-leds) |
| 21 | **Harte Anforderung.** Der Buzzer ertönt nur, solange das NFC-Feld aus ist | Die Leistungsbilanz zählt entweder den Buzzer oder den NFC-Sender, nicht beide | [NFC, Buzzer und LEDs](#nfc-buzzer-und-leds) |
| 22 | **Harte Anforderung.** WLAN-Land fest auf die EU-Regeln: Country-Policy manuell, 802.11d aus, 5-GHz-Kanäle nur 36 bis 140; keine Benutzereinstellung für Land oder Band | Das Funkmodul würde das Land eines Access Points übernehmen, oder der Benutzer könnte eines wählen; beides verbieten die Regeln für 5 GHz | [EU-Funkregeln](#eu-funkregeln) |
| 23 | **Harte Anforderung.** Kein SoftAP (Provisionierung) auf den Kanälen 52 bis 140: nur 2,4 GHz oder Kanäle 36 bis 48 | Der C5 hat keine eigene Radarerkennung | [EU-Funkregeln](#eu-funkregeln) |
| 24 | **Harte Anforderung.** Sendeleistung als Einstellung, begrenzt auf das, was das Prüflabor am Leser gemessen hat; nie über 20 dBm EIRP bei 2,4 GHz und von 5250 bis 5725 MHz | Das Zertifikat des Moduls liegt 0,15 dB unter dem Grenzwert bei 2,4 GHz, gemessen mit der Antenne an anderer Stelle | [EU-Funkregeln](#eu-funkregeln) |
| 25 | **Harte Anforderung.** Der C5 sendet im Minutenmittel höchstens 40 % der Zeit | Die Luft neben dem Modul würde am PoE in einem Raum von 40 °C dessen 85-°C-Angabe überschreiten | [Temperatur](#temperatur) |
| 26 | Das eFuse JTAG_SEL_ENABLE des C5 nie durchbrennen | Der C5 würde dann beim Start SDIO D1 (sein GPIO7) lesen, um seine JTAG-Quelle zu wählen | [WLAN-Co-Prozessor](#wlan-co-prozessor-esp-hosted) |

Was die Platine selbst erledigt: Widerstände halten die LEDs, die Hintergrundbeleuchtung, den Buzzer und
den PN532 ausgeschaltet, bis die Firmware ihre Pins treibt, und der Spannungswächter U204 hält die MCU
nach dem Hochlaufen der 3,3-V-Schiene 120 bis 280 ms im Reset (der Chip verlangt 50 us).

## ESP32-P4-GPIO-Belegung

| GPIO | Signal | Hinweise |
|---|---|---|
| 0 | TP_RST | Touch-Reset des GT911 |
| 1 | I2C0_SCL | Touch, IO-Expander, Manipulationssensoren; 2,2 k Pull-up |
| 2 | I2C0_SDA | |
| 3 | TP_INT | Interrupt des GT911; wählt beim Reset auch die I2C-Adresse des Touch |
| 4 bis 8 | LCD R5, R4, R3, R2, R1 | über 33 Ohm |
| 9 bis 14 | LCD G5, G4, G3, G2, G1, G0 | über 33 Ohm |
| 15 bis 19 | LCD B5, B4, B3, B2, B1 | über 33 Ohm |
| 20 / 21 / 22 / 23 | LCD_HSYNC / LCD_VSYNC / LCD_DE / LCD_PCLK | |
| 24 / 25 | USB D- / D+ | USB Serial/JTAG |
| 26 | BL_PWM | Hintergrundbeleuchtung, PWM 25 bis 40 kHz, High = an, beim Reset auf Low gezogen |
| 27 | nicht beschaltet | |
| 28 / 29 / 30 | RMII CRS_DV / RXD0 / RXD1 | |
| 31 | ETH MDC | |
| 32 | RMII REF_CLK | 50-MHz-Eingang vom PHY |
| 33 | RMII TX_EN | |
| 34 | RMII TXD0 | Strapping-Pin, 10 k Pull-up |
| 35 | RMII TXD1 | Strapping-Pin, BOOT-Taster, 10 k Pull-up |
| 36 | ETH MDIO | Strapping-Pin, 1,5 k Pull-up |
| 37 / 38 | UART0 TX / RX | Testpunkte TX0, RX0 |
| 39 bis 42 | SDIO D0 bis D3 | zum ESP32-C5, 51 k Pull-ups |
| 43 | SDIO CLK | 22 Ohm in Reihe |
| 44 | SDIO CMD | 51 k Pull-up |
| 45 | C5_EN | setzt den ESP32-C5 zurück, über 1 k |
| 46 | BUZZER | 2,7-kHz-Rechtecksignal, High = Spule an |
| 47 | LED_DATA | 16 x SK6812 im Ring, GRB, 800 kbit/s; 100 k Pull-down |
| 48 | nicht beschaltet | |
| 49 | NFC_IRQ | PN532 P70_IRQ, active low |
| 50 | NFC_RST | PN532 RSTPD_N, 10 k Pull-down: auf High treiben, damit er läuft |
| 51 / 52 | NFC_SDA / NFC_SCL | zweiter I2C-Bus, 2,2 k Pull-ups |
| 53, 54 | nicht beschaltet | |

Die Belegung stammt aus `P4_GPIO` in `scripts/bootstrap/circuit_core.py`, das auch die Kurzfassung auf
der Bestückungsseite der Platine erzeugt.

## IO-Expander

TCA9554 bei 0x20 an I2C0. Nach dem Einschalten sind alle Pins Eingänge mit schwachen Pull-ups. Sein
Interrupt-Ausgang ist nicht angeschlossen: das Eingangsregister abfragen.

| Pin | Signal | Richtung |
|---|---|---|
| P0 / P1 / P2 | LCD_CS / LCD_SCK / LCD_SDA | Ausgang |
| P3 | LCD_RST | Ausgang |
| P4 | ETH_RST_N | Ausgang, Low = PHY im Reset; muss gepulst werden (siehe [Ethernet](#ethernet)) |
| P5 | DC_PRESENT | Eingang: High, solange der Ausgang des DC-Wandlers an ist (+5V_DC über 51 k / 100 k) |
| P6 | DOCK_N | Eingang: Low, solange der Leser auf seinem Dock sitzt (Hall-Schalter U703) |
| P7 | POE_PRESENT | Eingang: High, solange der Ausgang des PoE-Moduls an ist (+5V_POE über 51 k / 100 k) |

## I2C-Adressen

| Bus | Gerät | Adresse |
|---|---|---|
| I2C0 (GPIO1/2) | GT911 Touch | 0x5D oder 0x14 (INT-Pegel beim Reset) |
| I2C0 | TCA9554 IO-Expander | 0x20 |
| I2C0 | LIS2DH12 Beschleunigungssensor | 0x19 |
| I2C0 | VCNL4040 Annäherungs- und Lichtsensor | 0x60 |
| I2C1 (GPIO51/52) | PN532 | 0x24 |

- Zwei Controller verwenden: `I2C_NUM_0` für GPIO1/2, `I2C_NUM_1` für GPIO51/52. Der einzelne gemeinsame
  Bus der Firmware (`getSharedI2CBus()`) muss aufgeteilt werden.
- Der PN532 hat einen eigenen Bus, daher ist kein Adressumsetzer nötig (`PN532_I2C_ADDRESS` ist 0x24; bei
  der Hardware `attractap-touch-v2` saß auch der Expander auf 0x24, und der PN532 wurde auf 0x64
  verschoben). Sein Clock Stretching verzögert das Touch-Polling nicht mehr.
- Die drei Adresspins des Expanders liegen auf Masse: 0x20. Das Bauteil muss der TCA9554 sein, nicht der
  TCA9554A (0x38).
- Der GT911 liest TP_INT, während TP_RST losgelassen wird: TP_INT für 0x5D auf Low halten.
- Der Ethernet-PHY antwortet an MDIO auf Adresse 1.

`scripts/bootstrap/check_netlist.py` gibt aus dem Schaltplan die Geräte und Adressen an jedem I2C-Bus aus.
Es schlägt fehl, wenn zwei Geräte an einem Bus dieselbe Adresse haben oder ein Gerät keinen Eintrag in
seiner Adresstabelle hat.

## Leistungsgrenzen je Quelle

USB, DC und PoE speisen alle dieselbe 5-V-Schiene; die Firmware kann nicht erkennen, welche gerade
liefert, nur ob DC und PoE vorhanden sind. Die Platine liest nicht, was eine USB-Quelle anbietet, daher
geht die Firmware bei USB allein vom kleinsten Angebot aus, 500 mA (ein USB-2.0-Port; eine Type-C-Quelle
bei Default USB Power liefert 500 oder 900 mA).

1. P5 (DC vorhanden) und P7 (PoE vorhanden) des Expanders mindestens alle 0,5 s lesen. Ist einer von
   beiden High, gilt keine USB-Grenze.
2. Andernfalls: LEDs aus, kein Buzzer, Hintergrundbeleuchtung bei 30 % oder weniger, NFC-Polling wie
   üblich. Geschätzte Stromaufnahme 0,43 A (3,3-V-Schiene mit ihren typischen 0,34 A,
   Hintergrundbeleuchtung bei 30 %, PN532); die Inbetriebnahme misst sie.

Ohne das bleibt die Hardware trotzdem sicher: Das eFuse begrenzt den USB-Strom auf 1,8 bis 2,2 A und
schaltet die Platine ab, wenn VBUS unter etwa 3,9 V fällt, und eine Quelle, die nicht liefern kann,
schützt sich selbst.

Würde man den CC-Pegel der Quelle lesen, könnte ein Ladegerät mit 1,5 oder 3 A die Platine ohne Grenzen
betreiben. Das ist nicht bestückt: Die einzigen freien ADC-Pins (GPIO53, GPIO54) sitzen hinter dem Quarz,
und auf keiner Lage blieb ein Weg zur USB-C-Buchse übrig. Ein Serviceanschluss braucht nicht die volle
Platine.

## Manipulationserkennung

Drei Sensoren; die Firmware nutzt sie noch nicht.

- **Hall-Schalter U703 (DRV5032FA)** am Expander-Pin P6, Netz `DOCK_N`. P6 als Eingang lassen. Er liest 0,
  solange der Magnet des Docks vor ihm ist, und 1 abseits des Docks. Er tastet 20-mal pro Sekunde ab,
  daher genügt es, den Expander ein paar Mal pro Sekunde zu lesen.
- **Beschleunigungssensor U702 (LIS2DH12)** an I2C0 bei 0x19 (`WHO_AM_I`, 0x0F, liest 0x33). Seine
  Interruptquellen rasten ein (Bit `LIR` in `CTRL_REG5`), also `INT1_SRC` und `CLICK_SRC` abfragen; kein
  Interrupt-Pin nötig. INT1 liegt auf Testpunkt TP814. Die Klickerkennung für Klopfen einrichten und die
  6D- oder Aktivitätsfunktion gegen die bei der Installation gespeicherte Richtung der Schwerkraft, für
  einen Leser, der aufgeschwenkt oder abgezogen wird.
- **Annäherungssensor U704 (VCNL4040)** an I2C0 bei 0x60 (ID-Register 0x0C liest 0x0186). Register sind
  16 Bit breit, niederwertiges Byte zuerst. Er misst das Infrarotlicht, das die Platte des Docks
  reflektiert, und ist der Sensor, dem man bei „auf dem Dock“ trauen sollte: Von außerhalb des Gehäuses
  erreicht nichts seinen Lichtweg, während ein an das Gehäuse gehaltener Magnet `DOCK_N` auf 0 hält.
  - Einrichtung: `PS_CONF1`/`PS_CONF2` (0x03) für Pulslänge, Wiederholung und 16-Bit-Ausgabe;
    `PS_CONF3`/`PS_MS` (0x04) für den Emitterstrom (50 bis 200 mA). Annäherungswert in 0x08. Das Bauteil
    startet mit ausgeschalteter Messung.
  - Bei der Inbetriebnahme den Wert des montierten Lesers als Referenz speichern und ein Band darum in
    `PS_THDL` (0x06) und `PS_THDH` (0x07) schreiben, Interrupt in beide Richtungen. Das Bauteil setzt dann
    ein Flag in `INT_Flag` (0x0B, High-Byte), wenn ein Wert das Band verlässt, sodass ein Abheben zwischen
    zwei Abfragen nicht verpasst wird. Das Lesen des Flags löscht es. INT liegt nur auf Testpunkt TP815.
  - Der Wert hängt von der Farbe des Docks ab: Kein fester Schwellwert passt für jeden Leser. Abseits des
    Docks liegt er nahe 0.
  - Umgebungslicht in 0x09 (`ALS_CONF`, 0x00, schaltet es ein). Hinter der Platine ist es auf dem Dock
    dunkel; Licht als Hinweis behandeln, nicht als Beweis, bis es an echten Geräten gemessen wurde.
- Den Beschleunigungssensor ignorieren, solange der Buzzer ertönt (2,7 kHz), und einige Millisekunden
  danach.
- Ein Leser auf dem Tischständer wird bewegt: Der Kippalarm sollte eine Einstellung sein.
- Ein Leser ohne Dock-Magnet liest die ganze Zeit `DOCK_N` = 1, wie ein abgenommener: den Hall-Schalter
  erst zählen, nachdem er einmal 0 gelesen hat.
- Vorgeschlagene Regel: Der Annäherungssensor entscheidet „auf dem Dock“; Hall-Schalter und
  Beschleunigungssensor ergänzen Einzelheiten (abgehoben, aufgeschwenkt, angestoßen).

## Unterschiede zur ESP32-S3-Firmware

### Ziel

`esp32p4`, Chip-Revision v3.x (ESP-IDF v6.1 nimmt sie standardmäßig; bei v6.0.x prüfen, ob
`CONFIG_ESP32P4_SELECTS_REV_LESS_V3` aus ist). 32 MB PSRAM im Gehäuse des Chips; der Flash bleibt bei
16 MB.

### Display und Hintergrundbeleuchtung

- Derselbe ST7701-Bildschirm und derselbe `esp_lcd_st7701`-Treiber, 16-Bit-RGB. Das 3-Draht-SPI für die
  Init-Sequenz läuft über den IO-Expander: `esp_lcd_panel_io_additions` akzeptiert Expander-Pins für
  CS/SCL/SDA (`esp_io_expander_tca9554`).
- Der Pixel-Processing-Accelerator (PPA) des P4 kann LVGL 9 als Zeichen-Einheit dienen.
- Hintergrundbeleuchtung: LEDC mit 25 bis 40 kHz auf GPIO26 statt eines Expander-Pins. GPIO26 ist eines der
  USB-Pads (24 bis 27), die nach dem Reset in ihrer USB-Funktion starten; Espressifs eigene Platine nutzt
  denselben Pin für ihre Hintergrundbeleuchtung. Bei der ersten Platine prüfen.

### WLAN-Co-Prozessor (esp-hosted)

Der P4 hat kein Funkmodul. Auf dem P4 `esp_wifi_remote` und `esp_hosted` (SDIO, 4 Bit) hinzufügen; der
ESP32-C5-MINI-1 (Leiterplattenantenne, 2,4 und 5 GHz) führt die Co-Prozessor-Firmware von esp-hosted aus.
Hintergrund zu dieser Paarung steht in den [Designnotizen](hardware/touch-p4/design-notes.md#wlan).

| esp-hosted-Einstellung (Main-Branch, November 2026) | Wert |
|---|---|
| Board | „No specific PCB board“ (`ESP_HOSTED_P4_DEV_BOARD_NONE`). Für einen P4-Host ist die Vorgabe „ESP32-P4-Function-EV-Board“, was den Reset auf GPIO54 und Slot 1 an GPIO14 bis 19 festlegt |
| Slot | „Slot 0 (IOMUX-fixed pins)“ (`ESP_HOSTED_SDIO_SLOT_0`) |
| Reset-GPIO | 45 (`ESP_HOSTED_HOST_RESET_GPIO`) |
| Reset-Polarität (2.x-Releases) | `ESP_HOSTED_SDIO_RESET_ACTIVE_HIGH`, der Standardwert: Die Leitung geht an EN, Low ist Reset, und sie muss auf High enden. Die andere Wahl lässt den C5 im Reset (`send_op_cond returned 0x107`). Die 3.x-Releases pulsen immer auf Low |
| SDIO-Timing des C5 | Standard (`EH_TRANSPORT_CP_SDIO_TIMING`: Senden und Abtasten mit der steigenden Flanke). Die Strapping-Pins des C5 für die Flanken (GPIO25, MTDI) bleiben offen |
| Partitionstabelle des C5 | `partitions_eh_cp_ota_4m.csv` (4-MB-Modul) |

- Die Pins des Slots bekommen ihre 3,3 V direkt von der Platine; die Einstellung der SD-Karten-Versorgung
  von Espressifs Platine ist nicht nötig.
- **Versionen.** Das C5-Image aus demselben esp-hosted-Release bauen wie die Komponente des P4, 3.1.0 oder
  neuer (das erste, das den C5 als SDIO-Co-Prozessor aufführt; 3.0.9 kann die Verbindung nach einer
  fehlgeschlagenen Pufferzuweisung dauerhaft verlieren). Die Version prüfen, die der C5 beim Start meldet,
  und sie zusammen mit der Leser-Firmware verwalten. `esp_wifi_remote` in `idf_component.yml` festlegen:
  esp-hosted ab 2.11 mit einem `esp_wifi_remote` älter als 1.3.1 gibt einen Empfangspuffer zweimal frei.
- **Flashen.** Das erste Flashen erfolgt über die Testpunkte des C5 (TX, RX, EN, BOOT neben dem Aufdruck
  „C5“); seine USB-Pins führen SDIO D2 und D3, der C5 hat hier also kein USB. Spätere Aktualisierungen
  laufen über SDIO vom P4. Das erste Image entscheidet, ob das funktioniert: Nach einem ersten Image von
  2.1 bis 2.8 schlagen Aktualisierungen auf neuere Releases fehl (verschiedene Flash-Modi in Bootloader und
  Image). Bei der Produktion ein aktuelles Release flashen.
- **Reset-Puls.** Mindestens 2 ms, weil er EN über 1 k auf 1 uF erreicht; der von esp-hosted dauert 10 ms.
- **Takt.** Die Verbindung mit 20 MHz starten, dann 40 MHz. Andere Flankeneinstellungen verursachten bei
  Espressif CRC-Fehler (`0x109`) auf der eigenen Platine (mit dem ESP32-C6). Die Inbetriebnahme misst
  Durchsatz und Fehlerzahl bei 40 und 50 MHz, bevor der Takt festgelegt wird.
- **Cache.** Display-Code, der `Cache_WriteBack_Addr()` oder verwandte Funktionen aufruft, während SDIO
  beschäftigt ist, lässt die Verbindung in ein Timeout laufen (`0x107`, „Unrecoverable host sdio state“).
  `esp_cache_msync()` verwenden.
- **802.11ax.** Bei einigen Access Points bleibt der Datenpfad beim ersten großen Download hängen, wenn
  sich die Station im 802.11ax-Modus anmeldet (beim ESP32-C6 berichtet; der C5 hat ebenfalls 802.11ax).
  Zeigt sich das, die Station mit `esp_wifi_set_protocol()` auf b/g/n begrenzen.
- **Bluetooth.** Der Controller läuft auf dem C5, NimBLE auf dem P4, mit HCI über dieselbe SDIO-Verbindung
  (`ESP_HOSTED_ENABLE_BT_NIMBLE`); die Controller-Einstellungen in der heutigen `sdkconfig.defaults`
  wandern in den Build des C5. Verbindungen als Central, die bei einigen Geräten nie zustande kamen,
  wurden durch einen Patch behoben, der im Juli 2026 in esp-hosted-Issue 204 gepostet wurde (das Issue war
  im November 2026 noch offen): prüfen, dass das verwendete Release ihn enthält, und mit den Geräten
  testen, mit denen die Plugins sprechen. Ein dauerhafter Scan (die Überwachung der Advertisements) nimmt
  dem WLAN Sendezeit weg: sein Fenster deutlich unter seinem Intervall halten.
- **JTAG.** Das eFuse JTAG_SEL_ENABLE des C5 nie durchbrennen (Regel 26).

### EU-Funkregeln

Quellen und Klauseln stehen unter [Konformität](hardware/touch-p4/compliance.md). Der C5 lauscht nur auf
Radar: „supports DFS channels in the 5 GHz band, but only supports passive radar detection“ und „cannot
operate as a DFS AP in SoftAP mode“ (ESP-IDF Wi-Fi guide, „Dynamic Frequency Selection“). Einmalig beim
Start setzen:

- **Land**: `esp_wifi_set_country()` mit `WIFI_COUNTRY_POLICY_MANUAL` (Kanäle und Grenzen Deutschlands
  für den EU-Build), damit das Funkmodul nie das Land übernimmt, das ein Access Point meldet. Die Vorgabe
  von ESP-IDF ist der Weltmodus mit der automatischen Policy, die dem Access Point folgt. Die
  EU-Entscheidung zu 5 GHz verlangt, dass der Benutzer Land oder Band nicht ändern kann, wo das die Regeln
  brechen würde: keine solche Einstellung in der Benutzeroberfläche oder der API.
- **5-GHz-Kanäle**: `wifi_5g_channel_mask` im selben `wifi_country_t` (wirkt nur unter der manuellen
  Policy): 36 bis 64 und 100 bis 140. Nicht 149 bis 165: In der EU sind das ein Band für Geräte kurzer
  Reichweite mit 25 mW, außerhalb der RLAN-Entscheidung, mit nationalen Bedingungen.
- **SoftAP**: Die Provisionierung läuft auf 2,4 GHz oder den Kanälen 36 bis 48 und bleibt aus, solange
  die Station auf einem DFS-Kanal verbunden ist, weil der C5 im STA+SoftAP-Modus seinen Access Point auf
  den Kanal der Station verlegt. ESP-IDF 6.0.2, die Version, die dieses Repository festlegt, hat keinen
  Hinweis, der den SoftAP von DFS-Kanälen aussperrt; die manuelle Policy mit der Kanalmaske erledigt das.
- **Sendeleistung**: eine Einstellung, begrenzt auf den Wert, den das Prüflabor am Leser als konform
  befindet (`esp_wifi_set_max_tx_power()`, in Schritten von 0,25 dB). Das Zertifikat des Moduls nennt
  19,85 dBm bei 2,4 GHz (Grenzwert 20 dBm EIRP) und 20,58 bis 20,77 dBm in den drei 5-GHz-Bändern,
  gemessen auf Espressifs Platine. Hier sitzt die Antenne an anderer Stelle, und im Vollwellenmodell
  strahlt sie in einigen 5-GHz-Kanälen bis zu 5,5 dB mehr ab als an Espressifs Position
  ([Designnotizen](hardware/touch-p4/design-notes.md#antenne)). Grenzen für eine Station ohne
  Radarerkennung: 20 dBm EIRP bei 2,4 GHz, 23 dBm von 5150 bis 5250 MHz, 20 dBm von 5250 bis 5725 MHz, es
  sei denn, die Firmware regelt die Sendeleistung (TPC), was das Labor dann bestätigen muss.
- Der Betrieb nur in Innenräumen für die Kanäle 36 bis 64 ist eine Pflicht der Anleitung und der
  Verpackung, nicht der Firmware.

### Ethernet

- Internes EMAC mit RMII statt des W5500. PHY-Treiber `ip101`, Adresse 1, externer 50-MHz-Takt auf
  GPIO32 (`EMAC_CLK_EXT_IN`), MDC 31, MDIO 36, Datenpins wie in der GPIO-Belegung.
- Die Treiberstärke der Sendepins (GPIO33 bis 35) auf den niedrigsten Wert setzen, der funktioniert, nie
  über den Standardwert (`GPIO_DRIVE_CAP_2`). Sie ersetzt Serienwiderstände, die diese Leitungen nicht
  haben (Empfangsleitungen und Takt haben 33 Ohm am PHY), und hält die Störaussendung niedrig. Simuliert
  mit den gerouteten Längen: 0,13 V Überschwingen beim Standardwert, 0,8 V bei der stärksten Einstellung.
  Dasselbe gilt für die SDIO-Daten- und Befehlsleitungen (GPIO39 bis 42, 44).
- Bei der WLAN-Version ist der PHY nicht bestückt: ihn abfragen und auf WLAN zurückfallen.
- **Den PHY zurücksetzen, bevor der Treiber startet.** Die Platine hat dafür keine Reset-Schaltung: Nach
  dem Einschalten ist der Expander-Pin ein Eingang mit Pull-up, sodass der PHY zusammen mit seiner
  Versorgung aus dem Reset kommt und seine Konfigurationspins (Adresse, RMII-Modus) falsch lesen kann.
  1. 0 in Bit 4 des Ausgangsregisters des Expanders schreiben (nach dem Einschalten ist es 1, daher ergibt
     das bloße Umschalten des Pins auf Ausgang keinen Puls).
  2. P4 auf Ausgang schalten, mindestens 10 ms warten.
  3. 1 schreiben, mindestens weitere 10 ms warten, dann den EMAC und den Treiber starten.

  Der ESP-IDF-Treiber `ip101` kann nur über einen GPIO der MCU zurücksetzen: ihm `reset_gpio_num = -1`
  geben.

### NFC, Buzzer und LEDs

- **NFC**: unverändertes PN532-Protokoll, jetzt an einem eigenen I2C-Bus, mit IRQ und einer Reset-Leitung,
  die die MCU steuert. Die LEDs nicht während eines Kartenaustauschs aktualisieren (Regel 11).
- **Buzzer**: passiv, an GPIO46. Für die Dauer eines Pieptons 2,7 kHz mit LEDC erzeugen. Den Pin nie auf
  High lassen: Die Spule führt dann 180 mA Gleichstrom, das Doppelte ihres Nennwerts, und ihr
  Vorwiderstand mehr, als er verträgt. Den Ton in jedem Fehlerpfad beenden und spätestens nach wenigen
  Sekunden; ihn nur ertönen lassen, solange das NFC-Feld aus ist.
- **LEDs**: 16 adressierbare LEDs an GPIO47 (`led_strip`, RMT, `max_leds` 16), gleichmäßig verteilt in
  einem quadratischen Ring unter dem Rand der Tap-Kachel, vier je Seite, keine auf einer Ecke. Aus Sicht
  des Benutzers beginnt die Kette am rechten Ende der Oberseite und läuft gegen den Uhrzeigersinn um den
  Ring: oben von rechts nach links (LED 1 bis 4), die linke Seite hinunter (LED 5 bis 8), unten von links
  nach rechts (LED 9 bis 12), die rechte Seite hinauf (LED 13 bis 16). Benachbarte LEDs stehen entlang
  des Rings 10,7 mm auseinander, auch um die Ecken, sodass eine Animation gleichmäßig nach dem Index
  fortschreitet. Weiß höchstens mit 70 % (die Grenze des LED-Datenblatts für alle drei Farben zusammen);
  siehe Regeln 2 und 20: Die 100-mA-Grenze gilt für alle 16 zusammen. Ein Widerstand hält die
  Datenleitung auf Low, daher bleiben die LEDs während des Resets dunkel.

### Secure Boot und Chip-Revision

- RSA-3072 Secure Boot v2 verwenden. ESP-IDF stuft ECDSA-Secure-Boot auf dem P4 wegen eines Chip-Erratums
  als nicht empfohlen ein. Flash-Verschlüsselung, HMAC und die Peripherie für digitale Signaturen gibt es.
- Dieselbe Teilenummer wird als v3.0, v3.1 und v3.2 ausgeliefert. Bevor der Secure Download Mode in der
  Produktion aktiviert wird, die Revision prüfen: Bei v3.1 kann das ROM dann im Download-Modus die
  Flash-Versorgung nicht einschalten (Erratum ROM-770, behoben in v3.2), und diese Platine versorgt den
  Flash nur aus dem Chip. Ein solcher Chip ließe sich über das ROM nicht mehr flashen.
- v3.0 braucht gelegentlich einen zweiten Start (Erratum MSPI-749; der Watchdog startet ihn neu) und darf
  die Peripherie-Spannungsdomäne im Light Sleep nicht abschalten, weil einer der Regler des Chips den
  Flash versorgt (Erratum Analog-765).

### Temperatur

Die Platine hat keinen eigenen Temperatursensor: den im ESP32-P4 verwenden (`temperature_sensor`-Treiber).
Er liest den Chip, den die thermische Schätzung 5 K über der Platine darunter und im typischen Betrieb 30
bis 40 K über dem Raum ansetzt.

- Das geschlossene Gehäuse enthält 2,5 bis 3,5 W, daher bestimmen Raumtemperatur und LEDs, wie warm es
  wird. Geschätzter Anstieg der Platine über den Raum im typischen Betrieb: 23 K (USB), 26 K (DC), 31 K
  (PoE); wenn lange alles an ist 39 bis 53 K, mit dem LED-Ring bei 50 bis 63 K.
- In einem Raum von 40 °C am PoE setzt die Schätzung das Display auf 63 °C (Grenze 70 °C) und die Luft um
  das PoE-Modul auf 71 °C (Grenze 85 °C) an: knapper, als die Schätzung genau ist.
- Über etwa 80 °C am Chip: erst die LEDs dimmen, dann die Hintergrundbeleuchtung, und das melden; reicht
  das nicht, auch das Funkmodul zurückhalten.
- Die 85-°C-Angabe des WLAN-Moduls bezieht sich auf die Luft unmittelbar außerhalb: bis zu 75 °C am PoE in
  einem Raum von 40 °C, wenn das Modul überwiegend empfängt, 84 °C, wenn es 40 % der Zeit sendet. Die
  Firmware hält das Senden daher auf 40 % der Zeit im Minutenmittel (aus den eingereihten Bytes und der
  Verbindungsrate oder aus den Statistiken von esp-hosted). Der eigene Verkehr des Lesers bleibt weit
  darunter; es greift nur bei langen Uploads wie Logs.
- Die Zahlen sind Schätzungen mit 40 % Genauigkeit; der [Inbetriebnahmeplan](hardware/touch-p4/bring-up.md)
  misst sie.
