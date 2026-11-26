# Pin-Belegung und Firmware-Portierung
<!-- llms-description: Pin-Belegung der Touch-P4-Platine und die Regeln, die die Leser-Firmware darauf einhalten muss: WLAN-Co-Prozessor, EU-Funkeinstellungen, Leistungs- und Wärmegrenzen. -->

Was die Firmware wissen muss, um auf der Attractap-Touch-P4-Platine zu laufen.

## Die Kurzliste

Lesen Sie dies, bevor Sie Firmware für diese Platine schreiben oder konfigurieren. Jede Zeile
beschreibt etwas, wogegen sich die Platine nicht selbst schützen kann, oder eine bekannte Falle
ihrer Bauteile. Die Nummern verweisen auf den Punkt unter
[„Was sich gegenüber der ESP32-S3-Firmware ändert“](#was-sich-gegenüber-der-esp32-s3-firmware-ändert), der
die Einzelheiten enthält. Wo eine Angabe „simuliert“ heißt, stammt sie aus den Simulationen
der gerouteten Platine ([Simulationen](hardware/touch-p4/simulations.md)). Nichts davon wurde bisher
an Hardware gemessen.

| | Regel | Was sonst passiert | Detail |
|---|---|---|---|
| 1 | Den Buzzer-Pin (GPIO46) nie auf High lassen; den Ton in jedem Fehlerpfad beenden | 180 mA Gleichstrom durch die Spule, das Doppelte ihres Nennwerts, und ihr Widerstand ist überlastet | 7 |
| 2 | Alle acht LEDs: Weiß höchstens mit 70 %, und das nur für Sekunden. Dauerlicht mit 30 % oder weniger | Die LED-Reihen sitzen auf schmalem Kupfer zwischen den Aussparungen der Platine. Geschätzt: Dauerhaft weißes Licht mit 70 % macht sie 30 K wärmer als den Rest der Platine, der schon 25 bis 30 K über dem Raum liegt | 8, 14 |
| 3 | Den Temperatursensor des Chips lesen und Hintergrundbeleuchtung und LEDs dimmen, wenn er etwa 80 °C überschreitet | In einem Raum von 40 °C am PoE schätzt man das Display auf 63 °C (Grenze: 70 °C) und die Luft um das PoE-Modul auf 71 °C (85 °C); das ist knapper, als die Schätzung genau ist. Die Luft neben dem WLAN-Modul, auf die sich dessen 85-°C-Angabe bezieht, erreicht 75 °C, wenn das Modul überwiegend empfängt, und 84 °C, wenn es 40 % der Zeit sendet (Regel 25) | 14 |
| 4 | Den Reset des Ethernet-PHY über den IO-Expander pulsen, bevor der EMAC startet | Der PHY hat keine Reset-Schaltung; er kann mit falscher Adresse oder ohne Takt hochkommen | 5 |
| 5 | esp-hosted: Board „none“, SDMMC-Slot 0, Reset-GPIO 45, und die Reset-Leitung muss auf High enden | Die Vorgaben sind die von Espressifs Platine (Slot 1, GPIO54). Mit der falschen Reset-Einstellung bleibt der C5 im Reset: `send_op_cond returned 0x107` | 4 |
| 6 | Dieselbe esp-hosted-Version auf dem P4 und im C5, 3.1.0 oder neuer, und `esp_wifi_remote` passend festgelegt | WLAN, das sich nicht verbindet, verlorene Pakete, eine Verbindung, die abbricht und nicht zurückkommt, ein doppeltes Freigeben von Speicher (Double Free) | 4 |
| 7 | Das erste in den C5 geflashte Image ist ein aktuelles Release | Nach einem ersten Image von 2.1 bis 2.8 lässt sich der C5 nicht mehr über SDIO aktualisieren | 4 |
| 8 | Die Treiberstärke von GPIO33 bis 35 und GPIO39 bis 44 auf dem Standardwert oder darunter lassen | Diese Leitungen haben keine Serienwiderstände. Simuliert: 0,13 V Überschwingen beim Standardwert, 0,8 V bei der stärksten Einstellung | 5 |
| 9 | Das SDIO-Timing des C5 auf den Standardflanken lassen (durch die Konfiguration des Slaves festgelegt; seine Strapping-Pins für die Flanken bleiben offen); die Verbindung mit 20 MHz starten, dann 40 MHz | CRC-Fehler (`0x109`) auf der Verbindung | 4 |
| 10 | Keine ROM-Cache-Funktionen (`Cache_WriteBack_Addr()` und verwandte) im Display-Code; `esp_cache_msync()` verwenden | Die SDIO-Verbindung läuft in ein Timeout: „Unrecoverable host sdio state“ | 4 |
| 11 | Während eines NFC-Austauschs keine LED-Daten senden | Die LED-Datenrate (800 kHz) liegt nahe der Frequenz, auf der eine Karte antwortet (848 kHz) | 6 |
| 12 | Hintergrundbeleuchtung per PWM mit 25 bis 40 kHz | Unter 2,5 kHz startet der Treiber seinen Sanftanlauf in jedem Zyklus neu | 3 |
| 13 | GPIO34 bis 36 bis zu einem Reset auf High oder undefiniert (hochohmig) lassen | Es sind Strapping-Pins; auf Low getrieben, startet der Chip im falschen Modus | 10 |
| 14 | Am PoE die Platine über 100 mA halten: kein Deep Sleep mit ausgeschalteter Hintergrundbeleuchtung | Das PoE-Modul braucht eine Mindestlast; darunter kann der Switch den Port aus- und wieder einschalten | Designnotizen, „Power“ |
| 15 | Bluetooth: Das Scan-Fenster deutlich kleiner als das Scan-Intervall halten und das Verbinden mit den verwendeten Geräten testen | WLAN und Bluetooth teilen sich den einen Funkteil des C5. Das Verbinden als Central schlug bei einigen Geräten fehl, bis zu einer Korrektur vom Juli 2026 | 4 |
| 16 | 802.11ax ist eine Einstellung, keine Konstante | Einige Access Points lassen die Verbindung im 802.11ax-Modus hängen | 4 |
| 17 | Secure Boot mit RSA-3072. Die Chip-Revision prüfen, bevor der Secure Download Mode aktiviert wird | ECDSA-Secure-Boot hat einen Erratum-Eintrag. Bei Revision v3.1 ließ sich der Chip über sein ROM nicht mehr flashen | 9, 13 |
| 18 | Der Hall-Schalter zählt erst, nachdem er einmal 0 gelesen hat; den Beschleunigungssensor ignorieren, solange der Buzzer ertönt | Ein Leser ohne Dock-Magnet sieht aus wie ein abgenommener; der Buzzer lässt die Platine vibrieren | „Manipulationserkennung“ |
| 19 | **Harte Anforderung.** Wenn USB die einzige Quelle ist, die Platine innerhalb des Stroms halten, den die USB-Quelle bietet: lesen, ob DC und PoE vorhanden sind (Expander P5, P7); bei keinem von beiden die Grenzen aus [„Leistungsgrenzen je Quelle“](#leistungsgrenzen-je-quelle) anwenden | Ein USB-2.0-Port liefert 500 mA; die Platine zieht bis zu 0,9 A. Der Port schaltet ab, oder das eFuse sieht VBUS einbrechen und schaltet die Platine aus | „Leistungsgrenzen je Quelle“ |
| 20 | **Harte Anforderung.** Alle LED-Kanäle zusammen unter 100 mA im Dauerbetrieb (Regel 2 hält sie dort) | Die 30 % Reserve der 5-V-Quellen setzen dies voraus (Designnotizen, „Power budget“) | 8 |
| 21 | **Harte Anforderung.** Der Buzzer ertönt nur, solange das NFC-Feld aus ist | Dasselbe Budget zählt entweder den Buzzer oder den NFC-Sender, nicht beide | 6, 7 |
| 22 | **Harte Anforderung.** Das WLAN-Land ist in der Firmware auf die EU-Regeln festgelegt: Country-Policy manuell, 802.11d aus, 5-GHz-Kanäle nur 36 bis 140. Keine Einstellung lässt den Benutzer Land oder Band ändern | Das Funkmodul würde das Land übernehmen, das ein Access Point meldet, oder der Benutzer könnte eines wählen, und damit die Regeln für 5 GHz verlassen, die beides verbieten | 4 |
| 23 | **Harte Anforderung.** Kein eigener Access Point des C5 (Provisionierung) auf den Kanälen 52 bis 140: nur 2,4 GHz oder Kanäle 36 bis 48 | Der C5 hat keine eigene Radarerkennung; als Access Point auf diesen Kanälen verstößt er gegen den 5-GHz-Funkstandard | 4 |
| 24 | **Harte Anforderung.** Die WLAN-Sendeleistung ist eine Einstellung, begrenzt auf das, was das Prüflabor am Leser gemessen hat; nie über 20 dBm EIRP bei 2,4 GHz und von 5250 bis 5725 MHz | Das Zertifikat des Moduls nennt 19,85 dBm bei 2,4 GHz, 0,15 dB unter dem Grenzwert, gemessen auf Espressifs Platine; die Antenne sitzt hier an anderer Stelle | 12 |
| 25 | **Harte Anforderung.** Der C5 sendet im Minutenmittel höchstens 40 % der Zeit | Geschätzt: Die Luft neben dem Modul überschreitet am PoE in einem Raum von 40 °C dessen 85-°C-Angabe | 14 |
| 26 | Das eFuse JTAG_SEL_ENABLE des C5 nie durchbrennen | Der C5 würde dann beim Start SDIO D1 (sein GPIO7) lesen, um zu wählen, woher sein JTAG kommt | 4 |

Worum sich die Firmware nicht kümmern muss, weil die Platine es erledigt: Die
LEDs, die Hintergrundbeleuchtung, der Buzzer und der PN532 werden durch Widerstände
ausgeschaltet gehalten, bis die Firmware ihre Pins treibt, und der Reset der MCU wartet auf die
3,3-V-Schiene (simuliert: 1,1 ms nachdem sie oben ist; der Chip verlangt 50 us).

## ESP32-P4-GPIO-Belegung

| GPIO | Signal | Hinweise |
|---|---|---|
| 0 | TP_RST | Touch-Reset des GT911 |
| 1 | I2C0_SCL | Touch + IO-Expander, 2,2 k Pull-up |
| 2 | I2C0_SDA | |
| 3 | TP_INT | Interrupt des GT911 (wählt beim Reset auch die I2C-Adresse des Touch) |
| 4 bis 8 | LCD R5, R4, R3, R2, R1 | über 33 Ohm |
| 9 bis 14 | LCD G5, G4, G3, G2, G1, G0 | über 33 Ohm |
| 15 bis 19 | LCD B5, B4, B3, B2, B1 | über 33 Ohm |
| 20 | LCD_HSYNC | |
| 21 | LCD_VSYNC | |
| 22 | LCD_DE | |
| 23 | LCD_PCLK | |
| 24 | USB D- | USB Serial/JTAG |
| 25 | USB D+ | |
| 26 | BL_PWM | Hintergrundbeleuchtung, PWM 25 bis 40 kHz, High = an, beim Reset auf Low gezogen |
| 27 | nicht beschaltet | |
| 28 | RMII CRS_DV | |
| 29 | RMII RXD0 | |
| 30 | RMII RXD1 | |
| 31 | ETH MDC | |
| 32 | RMII REF_CLK | 50-MHz-Eingang vom PHY |
| 33 | RMII TX_EN | |
| 34 | RMII TXD0 | Strapping-Pin, 10 k Pull-up |
| 35 | RMII TXD1 | Strapping-Pin: BOOT-Taster, 10 k Pull-up |
| 36 | ETH MDIO | Strapping-Pin, 1,5 k Pull-up |
| 37 | UART0 TX | Testpunkt TX0 |
| 38 | UART0 RX | Testpunkt RX0 |
| 39 bis 42 | SDIO D0 bis D3 | zum ESP32-C5, 51 k Pull-ups |
| 43 | SDIO CLK | 22 Ohm in Reihe |
| 44 | SDIO CMD | 51 k Pull-up |
| 45 | C5_EN | setzt den ESP32-C5 zurück (über 1 k) |
| 46 | BUZZER | 2,7-kHz-Rechtecksignal, High = Spule an |
| 47 | LED_DATA | 8 x SK6812, GRB, 800 kbit/s; 100 k Pull-down auf der Platine |
| 48 | nicht beschaltet | |
| 49 | NFC_IRQ | PN532 P70_IRQ, active low |
| 50 | NFC_RST | PN532 RSTPD_N, 10 k Pull-down: auf High treiben, damit er läuft |
| 51 | NFC_SDA | zweiter I2C-Bus, 2,2 k Pull-up |
| 52 | NFC_SCL | |
| 53, 54 | nicht beschaltet | |

Die Bestückungsseite der Platine trägt eine Kurzfassung dieser Belegung. Ihre Nummern werden aus derselben Tabelle
erzeugt wie der Schaltplan (`P4_GPIO` in `scripts/bootstrap/circuit_core.py`).

## IO-Expander (TCA9554 bei 0x20 an I2C0)

| Pin | Signal | Richtung |
|---|---|---|
| P0 | LCD_CS | Ausgang |
| P1 | LCD_SCK | Ausgang |
| P2 | LCD_SDA | Ausgang |
| P3 | LCD_RST | Ausgang |
| P4 | ETH_RST_N | Ausgang, Low = PHY im Reset. Muss auf Low gepulst werden, siehe „Ethernet“ unten |
| P5 | DC_PRESENT | Eingang: High, solange der Ausgang des DC-Wandlers an ist (+5V_DC über 51 k / 100 k) |
| P6 | DOCK_N | Eingang: Low, solange der Leser auf seinem Dock sitzt (Hall-Schalter U703), siehe „Manipulationserkennung“ unten |
| P7 | POE_PRESENT | Eingang: High, solange der Ausgang des PoE-Moduls an ist (+5V_POE über 51 k / 100 k) |

Nach dem Einschalten sind alle Expander-Pins Eingänge mit schwachen Pull-ups.

## Leistungsgrenzen je Quelle

Die Platine liest nicht, was eine USB-Quelle anbietet. Die Firmware muss die Last begrenzen, wenn USB die
einzige Quelle ist (Regel 19), und zwar immer auf das kleinste Angebot, 500 mA (ein USB-2.0-Port; eine Type-C-Quelle bei Default
USB Power liefert 500 oder 900 mA). Die Hardware bleibt auch ohne das sicher: Das eFuse begrenzt den USB-Strom
auf 1,8 bis 2,2 A und schaltet die Platine ab, wenn VBUS unter etwa 3,9 V fällt; eine Quelle, die nicht
liefern kann, schützt sich selbst. Das tut die Firmware:

1. P5 (DC vorhanden) und P7 (PoE vorhanden) des Expanders lesen. Ist einer von beiden High, gilt keine USB-Grenze.
   Beide mindestens alle 0,5 s erneut lesen (der Interrupt-Ausgang des Expanders ist nicht angeschlossen).
2. Andernfalls: LEDs aus, kein Buzzer, Hintergrundbeleuchtung bei 30 % oder weniger, NFC-Polling wie üblich. Geschätzte Stromaufnahme
   0,43 A (3,3-V-Schiene mit ihren typischen 0,34 A, Hintergrundbeleuchtung 30 %, PN532); die Inbetriebnahme misst sie.

Würde man den CC-Pegel der Quelle lesen, könnte ein Ladegerät, das 1,5 oder 3 A anbietet, die Platine ohne Grenzen betreiben.
Er wurde eingezeichnet (beide CC-Leitungen über 100 k an einen ADC-Pin), aber die einzigen freien ADC-Pins (GPIO53, GPIO54)
sitzen am linken Rand der MCU hinter dem Quarz, und von dort blieb auf keiner Lage ein Weg zur USB-C-Buchse übrig,
ohne das USB-Paar, die Leitung der Hintergrundbeleuchtung oder den RMII-Bus zu verschieben. Ein Serviceanschluss braucht
nicht die volle Platine; die obige Grenze ist das sichere Ende derselben Regel.

## I2C-Adressen

| Bus | Gerät | Adresse |
|---|---|---|
| I2C0 (GPIO1/2) | GT911 Touch | 0x5D oder 0x14 (gewählt durch den INT-Pegel beim Reset) |
| I2C0 | TCA9554 | 0x20 |
| I2C0 | LIS2DH12 Beschleunigungssensor | 0x19 |
| I2C0 | VCNL4040 Annäherungs- und Lichtsensor | 0x60 |
| I2C1 (GPIO51/52) | PN532 | 0x24 |

Der PN532 hat einen eigenen Bus. Seine Adresse ist fest 0x24, und bei der Hardware
`attractap-touch-v2` antwortete der IO-Expander auf derselben Adresse, sodass
jener Leser einen Adressumsetzer braucht (PN532 bei 0x64). Hier kann nichts anderes
am NFC-Bus landen, und ein belegter NFC-Austausch (der PN532 dehnt den Takt) verzögert
das Touch-Polling nicht mehr.

- Die Expander-Adresse ergibt sich aus seinen drei Adresspins, alle mit Masse verbunden:
  0x20. Das Bauteil muss der TCA9554 sein, nicht der TCA9554A (0x38).
- Der GT911 übernimmt seine Adresse von TP_INT, während TP_RST losgelassen wird: TP_INT
  für 0x5D auf Low halten. Beide Pins sind GPIOs der MCU, die Firmware entscheidet also.
- Zwei I2C-Controller verwenden: `I2C_NUM_0` für GPIO1/2 und `I2C_NUM_1` für
  GPIO51/52. Der einzelne gemeinsame Bus der Firmware (`getSharedI2CBus()`) muss
  entsprechend aufgeteilt werden.
- `PN532_I2C_ADDRESS` ist wieder 0x24; kein Adressumsetzer.
- Weitere Adressen: Der Ethernet-PHY antwortet an MDIO auf Adresse 1.

`scripts/bootstrap/check_netlist.py` liest den Schaltplan und gibt die Geräte
und Adressen an jedem I2C-Bus aus. Es schlägt fehl, wenn zwei Geräte an einem Bus dieselbe
Adresse haben oder wenn ein Gerät keinen Eintrag in seiner Adresstabelle hat.

## Manipulationserkennung

Die Platine hat dafür drei Sensoren, und die Firmware nutzt sie noch nicht.

- **Hall-Schalter U703 (DRV5032FA)** am Pin P6 des IO-Expanders, Netz `DOCK_N`. P6
  als Eingang lassen. Er liest 0, solange der Magnet im Dock vor dem
  Schalter ist, und 1, wenn der Leser vom Dock abgenommen ist. Der Schalter tastet sein Feld
  20-mal pro Sekunde ab, daher genügt es, das Eingangsregister des Expanders ein paar Mal pro
  Sekunde zu lesen. Der Interrupt-Ausgang des Expanders ist nicht angeschlossen.
- **Beschleunigungssensor U702 (LIS2DH12)** an I2C0 bei 0x19 (`WHO_AM_I`, Register
  0x0F, liest 0x33). Seine Interruptquellen rasten ein (Bit `LIR` in `CTRL_REG5`), sodass
  die Firmware `INT1_SRC` und `CLICK_SRC` abfragen kann und keinen Interrupt-Pin braucht.
  INT1 liegt für die Werkbank auf Testpunkt TP814. Die zwei Quellen, die sich einzurichten lohnen:
  die Klickerkennung für Klopfen und die 6D- oder Aktivitätsfunktion gegen die bei der
  Installation gespeicherte Richtung der Schwerkraft, für einen Leser, der aufgeschwenkt
  oder abgezogen wird.
- **Annäherungssensor U704 (VCNL4040)** an I2C0 bei 0x60 (ID-Register 0x0C
  liest 0x0186). Alle Register sind 16 Bit breit, niederwertiges Byte zuerst. Er misst
  das Infrarotlicht, das die Platte des Docks reflektiert, und ist der Sensor, dem man bei „auf dem Dock“
  trauen sollte: Von außerhalb des Gehäuses erreicht nichts seinen Lichtweg, während ein
  an das Gehäuse gehaltener Magnet `DOCK_N` auf 0 hält.
  - Einrichtung: `PS_CONF1`/`PS_CONF2` (0x03) für Pulslänge, Wiederholung und
    16-Bit-Ausgabe, `PS_CONF3`/`PS_MS` (0x04) für den Emitterstrom (50 bis
    200 mA). Annäherungswert in 0x08. Das Bauteil startet mit
    ausgeschalteter Messung.
  - Den Wert des montierten Lesers bei dessen Inbetriebnahme als Referenz speichern
    und ein Band darum in `PS_THDL` (0x06) und
    `PS_THDH` (0x07) schreiben, mit dem Interrupt für beide Richtungen. Das Bauteil
    prüft dann jede Messung selbst und setzt ein Flag in `INT_Flag` (0x0B,
    High-Byte), wenn der Wert das Band verlässt, sodass ein Abheben zwischen zwei Abfragen
    nicht verpasst wird. Das Lesen des Flag-Registers löscht es. INT liegt nur auf Testpunkt
    TP815, nicht auf einem GPIO.
  - Der Wert hängt von der Farbe des Docks ab, es gibt also keinen festen Schwellwert,
    der für jeden Leser passt. Abseits des Docks liegt er nahe 0.
  - Umgebungslicht in 0x09 (`ALS_CONF`, 0x00, schaltet es ein). Der Raum hinter der
    Platine ist dunkel, solange der Leser auf seinem Dock sitzt; Licht dort als
    Hinweis behandeln, nicht als Beweis, bis es an echten Geräten gemessen wurde.
- Der Buzzer lässt die Platine mit 2,7 kHz vibrieren: den Beschleunigungssensor ignorieren, solange er
  ertönt und für einige Millisekunden danach.
- Ein Leser auf dem Tischständer wird bewegt; der Kippalarm sollte eine Einstellung sein.
- Ein Leser ohne Dock-Magnet liest die ganze Zeit `DOCK_N` = 1. Die Firmware
  kann das nicht von einem abgenommenen Leser unterscheiden, daher sollte der Hall-Schalter erst
  zählen, nachdem er einmal als 0 gesehen wurde.
- Vorgeschlagene Regel: Der Annäherungssensor entscheidet, ob der Leser auf seinem
  Dock sitzt; der Hall-Schalter und der Beschleunigungssensor ergänzen den Bericht um Einzelheiten
  (abgehoben, aufgeschwenkt, angestoßen).

## Was sich gegenüber der ESP32-S3-Firmware ändert

1. **Ziel**: `esp32p4`, Chip-Revision v3.x (ESP-IDF v6.1 nimmt sie standardmäßig;
   bei v6.0.x prüfen, ob `CONFIG_ESP32P4_SELECTS_REV_LESS_V3` aus ist). Das PSRAM hat 32 MB
   im Gehäuse des Chips; der Flash bleibt bei 16 MB.
2. **Display**: derselbe ST7701-Bildschirm und derselbe `esp_lcd_st7701`-Treiber, 16-Bit-RGB. Das
   3-Draht-SPI für die Init-Sequenz läuft über den IO-Expander:
   `esp_lcd_panel_io_additions` akzeptiert Expander-Pins für CS/SCL/SDA
   (`esp_io_expander_tca9554`). Der P4 hat einen Pixel-Processing-Accelerator (PPA);
   LVGL 9 kann ihn als Zeichen-Einheit nutzen.
3. **Hintergrundbeleuchtung**: ein echter PWM-Pin statt des Expanders. LEDC mit 25 bis
   40 kHz auf GPIO26 verwenden. Unter etwa 2,5 kHz startet der Treiber seinen Sanftanlauf in
   jedem Zyklus neu. GPIO26 ist eines der vier USB-Pads des Chips (24 bis 27), die
   nach dem Reset in ihrer USB-Funktion starten. Espressifs eigene Platine hat
   ihre PWM der Hintergrundbeleuchtung auf demselben Pin, daher wird nichts Besonderes erwartet; es ist ein
   weiterer Punkt, den man sich bei der ersten Platine ansehen sollte.
4. **WLAN**: Der P4 hat kein Funkmodul. `esp_wifi_remote` + `esp_hosted` hinzufügen
   (SDIO, 4 Bit). Platinenspezifische Einstellungen: SDMMC-Slot 0, die oben genannten Pins,
   Reset-GPIO 45. In der Konfiguration von esp-hosted sind das drei Auswahlen, und die
   erste übersieht man leicht: Für einen P4-Host wählt sie von selbst die Platine
   „ESP32-P4-Function-EV-Board“, was den Reset auf GPIO54 und
   den Bus auf Slot 1 an GPIO14 bis 19 festlegt. Die Platine auf „No specific PCB board“
   (`ESP_HOSTED_P4_DEV_BOARD_NONE`) setzen, den Slot auf „Slot 0 (IOMUX-fixed pins)“
   (`ESP_HOSTED_SDIO_SLOT_0`) und den Reset-GPIO auf 45
   (`ESP_HOSTED_HOST_RESET_GPIO`). Die Namen sind die des Main-Branches von esp-hosted im
   November 2026. Die Pins des Slots werden direkt von der Platine mit 3,3 V versorgt, daher
   ist die Einstellung der SD-Karten-Versorgung von Espressifs Platine (einer der
   Regler des Chips) nicht nötig. Der ESP32-C5 braucht die
   Co-Prozessor-Firmware von esp-hosted (ab 3.1.0 ist der C5 als SDIO-
   Co-Prozessor aufgeführt), gebaut für das 4-MB-Modul (`partitions_eh_cp_ota_4m.csv`):
   Das erste Flashen erfolgt über die Testpunkte des C5 (TX, RX, EN, BOOT neben dem Aufdruck „C5“;
   seine USB-Pins führen SDIO D2 und D3, der C5 hat hier also kein USB), spätere
   Aktualisierungen laufen über die SDIO-Verbindung vom P4. Die Firmware-Version des C5 muss
   zusammen mit der Leser-Firmware verwaltet werden. Das Modul ist der
   ESP32-C5-MINI-1 mit seiner Antenne auf dem Modul, in der linken oberen Ecke der Platine,
   für 2,4 und 5 GHz.

   Diese Paarung hat eine Geschichte von Problemen, fast alle in Firmware-
   Versionen und Einstellungen. Was die Berichte ergaben, steht in den
   [Designnotizen](hardware/touch-p4/design-notes.md#wlan-und-bluetooth-der-esp32-c5-hinter-dem-esp32-p4);
   was daraus für die Firmware folgt:

   - **Eine Version auf beiden Seiten.** Das C5-Image aus demselben
     esp-hosted-Release bauen wie die Komponente des P4 und die Version prüfen, die der C5
     beim Start meldet. 3.1.0 oder neuer verwenden: 3.0.9 kann die Verbindung nach
     einer fehlgeschlagenen Pufferzuweisung dauerhaft verlieren.
   - **`esp_wifi_remote` passend.** In `idf_component.yml` festlegen. Ein
     esp-hosted ab 2.11, gebaut gegen ein `esp_wifi_remote` älter als
     1.3.1, gibt einen Empfangspuffer zweimal frei.
   - **Das erste in den C5 geflashte Image entscheidet, ob er später
     über SDIO aktualisiert werden kann.** Nach einem ersten Image von 2.1 bis 2.8 schlagen Aktualisierungen
     auf neuere Releases fehl (sein Bootloader und deren Images verwenden verschiedene Flash-
     Modi). Bei der Produktion ein aktuelles Release flashen.
   - **Reset-Polarität.** Die Leitung geht an den EN-Pin des Moduls: Low ist Reset,
     und sie muss auf High enden. In den 2.x-Releases ist das
     `ESP_HOSTED_SDIO_RESET_ACTIVE_HIGH`, der Standardwert; die andere Wahl lässt
     den C5 im Reset, und der P4 meldet dann `send_op_cond returned 0x107`.
     Die 3.x-Releases pulsen immer auf Low.
     Der Puls muss mindestens 2 ms dauern, weil er EN über 1 k
     auf 1 uF erreicht; der von esp-hosted dauert 10 ms.
   - **SDIO-Takt und Flanken.** Die Verbindung mit 20 MHz starten, dann auf 40 MHz gehen.
     Das Timing des C5 auf dem Standardwert lassen (`EH_TRANSPORT_CP_SDIO_TIMING`:
     Senden und Abtasten mit der steigenden Flanke); andere Flanken verursachten bei Espressif CRC-
     Fehler (`0x109`) auf der eigenen Platine mit dem C6. Die Strapping-Pins des C5 für
     die Flanken (GPIO25, MTDI) bleiben offen; die Konfiguration des Slaves legt
     die Flanken fest. Die Inbetriebnahme liest Durchsatz und Fehlerzahl bei 40 und
     50 MHz, bevor der Takt festgelegt wird.
   - **Keine ROM-Cache-Funktionen.** Display-Code, der `Cache_WriteBack_Addr()`
     oder verwandte Funktionen aufruft, während SDIO beschäftigt ist, lässt die Verbindung in ein Timeout laufen (`0x107`,
     „Unrecoverable host sdio state“). `esp_cache_msync()` verwenden.
   - **802.11ax.** Bei einigen Access Points bleibt der Datenpfad beim ersten
     großen Download hängen, wenn sich die Station im 802.11ax-Modus anmeldet (beim C6 gesehen;
     der C5 hat ebenfalls 802.11ax). Zeigt sich das, die Station
     mit `esp_wifi_set_protocol()` auf b/g/n begrenzen.
   - **Bluetooth.** Der Controller läuft auf dem C5 und NimBLE auf dem P4, mit
     HCI über dieselbe SDIO-Verbindung (`ESP_HOSTED_ENABLE_BT_NIMBLE`). Die
     Controller-Einstellungen in der heutigen `sdkconfig.defaults` gehören dann in den Build
     des C5. Der Proxy ist ein Central: Verbindungen, die bei einigen Geräten nie zustande
     kamen, wurden durch einen Patch behoben, der im Juli 2026 in esp-hosted-Issue 204 gepostet wurde (das Issue war im
     November 2026 noch offen). Prüfen, dass das verwendete Release ihn enthält, und mit den Geräten testen,
     mit denen die Plugins sprechen.
     WLAN und Bluetooth teilen sich den einen Funkteil des C5, daher nimmt ein Scan, der die ganze
     Zeit läuft (die Überwachung der Advertisements), dem WLAN Sendezeit weg: sein Fenster
     deutlich unter seinem Intervall halten.
   - **Die EU-Regeln für 5 GHz** (Quellen und Klauseln in
     [compliance.md](hardware/touch-p4/compliance.md#_5-ghz-wlan)). Der C5 ist eine Station, die
     nur auf Radar lauscht: „ESP32-C5 supports DFS channels in the 5 GHz
     band, but only supports passive radar detection“ und „cannot operate as a
     DFS AP in SoftAP mode“ (ESP-IDF Wi-Fi guide, „Dynamic Frequency
     Selection“). Das setzt die Firmware, einmalig beim Start:
     - Das Land, mit `esp_wifi_set_country()` und
       `WIFI_COUNTRY_POLICY_MANUAL` (Kanäle und Grenzen Deutschlands für den
       EU-Build), damit das Funkmodul nie das Land übernimmt, das ein Access Point
       meldet. Die Vorgabe von ESP-IDF ist der Weltmodus mit der automatischen Policy,
       die dem Access Point folgt. Die EU-Entscheidung zu 5 GHz verlangt, dass
       der Benutzer Land oder Band nicht ändern kann, wo das die
       Regeln brechen würde: keine solche Einstellung in der Benutzeroberfläche oder der API.
     - Die 5-GHz-Kanäle, mit `wifi_5g_channel_mask` im selben
       `wifi_country_t` (wirkt nur unter der manuellen Policy):
       Kanäle 36 bis 64 und 100 bis 140. Nicht 149 bis 165: In der EU sind das ein
       Band für Geräte kurzer Reichweite mit 25 mW, außerhalb der RLAN-Entscheidung, mit
       nationalen Bedingungen; der Leser braucht sie nicht.
     - Kein SoftAP auf den Kanälen 52 bis 140. Ein Provisionierungs-Access-Point läuft auf
       2,4 GHz (oder den Kanälen 36 bis 48) und bleibt aus, solange die Station
       auf einem DFS-Kanal verbunden ist, weil der C5 im STA+SoftAP-Modus seinen
       Access Point auf den Kanal der Station verlegt. ESP-IDF 6.0.2, die Version, die dieses Repository
       festlegt, hat den Hinweis zum Aussperren des SoftAP
       von DFS-Kanälen noch nicht; die manuelle Policy mit der obigen Kanalmaske erledigt das.
     - Der Betrieb nur in Innenräumen für die Kanäle 36 bis 64 ist eine Pflicht der Anleitung und
       der Verpackung, nicht der Firmware (der Leser ist ein Gerät für Innenräume).
5. **Ethernet**: internes EMAC mit RMII statt des W5500. PHY-Treiber
   `ip101`, Adresse 1, externer 50-MHz-Takt auf GPIO32
   (`EMAC_CLK_EXT_IN`), MDC 31, MDIO 36, Datenpins wie in der Tabelle. Die
   Treiberstärke der Sendepins (GPIO33 bis 35) auf den niedrigsten Wert setzen,
   der funktioniert; das hält die Störaussendung niedrig und ersetzt
   Serienwiderstände, die diese drei Leitungen nicht haben (die Empfangsleitungen und der
   Takt haben 33 Ohm am PHY). Sie nie über den Standardwert
   (`GPIO_DRIVE_CAP_2`) erhöhen: Simuliert mit den gerouteten Längen
   überschwingen diese Leitungen um 0,13 V beim Standardwert und um 0,8 V bei der stärksten Einstellung.
   Dasselbe gilt für die SDIO-Daten- und Befehlsleitungen zum WLAN-Modul
   (GPIO39 bis 42 und 44), die ebenfalls keine Serienwiderstände haben. Bei der WLAN-
   Version ist der PHY nicht bestückt: ihn abfragen und auf WLAN zurückfallen.

   **Den PHY zurücksetzen, bevor der Treiber startet.** Die Platine hat dafür keine Reset-Schaltung:
   Nach dem Einschalten ist der Expander-Pin ein Eingang mit Pull-up, sodass der
   PHY zusammen mit seiner Versorgung aus dem Reset kommt und seine
   Konfigurationspins falsch gelesen haben kann (Adresse, RMII-Modus). Die Firmware muss
   den Reset-Puls erzeugen, den das Datenblatt des PHY verlangt:
   1. 0 in Bit 4 des Ausgangsregisters des Expanders schreiben (nach dem
      Einschalten ist es 1, daher ergibt das bloße Umschalten des Pins auf Ausgang keinen Puls),
   2. P4 auf Ausgang schalten und mindestens 10 ms warten,
   3. 1 schreiben, mindestens weitere 10 ms warten, dann den EMAC und den Treiber starten.

   Der ESP-IDF-Treiber `ip101` kann das nicht selbst: Sein Reset arbeitet nur mit einem GPIO
   der MCU. Ihm `reset_gpio_num = -1` geben.
6. **NFC**: unverändertes PN532-Protokoll, jetzt an einem eigenen I2C-Bus, mit IRQ und einer
   Reset-Leitung, die die MCU steuert. Die LEDs nicht während eines Kartenaustauschs aktualisieren:
   ihr 800-kHz-Datensignal liegt nahe den 848 kHz, auf denen die Karte antwortet.
7. **Buzzer**: ein passiver Buzzer an einem GPIO. Für die Dauer eines Pieptons 2,7 kHz mit LEDC erzeugen,
   statt einen Expander-Pin zu schalten. Den Pin nie
   auf High lassen: Die Spule führt dann 180 mA Gleichstrom, das Doppelte ihres Nennwerts,
   und ihr Vorwiderstand mehr, als er verträgt. Den Ton in jedem Fehlerpfad beenden
   und spätestens nach wenigen Sekunden.
8. **LEDs**: 8 adressierbare LEDs an GPIO47 (`led_strip`, RMT). Aus Sicht des
   Benutzers beginnt die Kette oben rechts am NFC-Feld, läuft von rechts
   nach links am oberen Rand entlang (LED 1 bis 4), dann von links nach rechts am unteren Rand
   (LED 5 bis 8). Weiß auf 70 % begrenzen (das Datenblatt der LED gilt für alle drei
   Farben zusammen). Die Datenleitung wird von einem Widerstand auf Low gehalten, bis die
   Firmware sie treibt, daher bleiben die LEDs während des Resets dunkel.
9. **Secure Boot**: RSA-3072 Secure Boot v2 auf dem P4 verwenden. ESP-IDF stuft
   ECDSA-Secure-Boot auf dem P4 wegen eines Chip-Errata als nicht empfohlen ein.
   Flash-Verschlüsselung, HMAC und die Peripherie für digitale Signaturen gibt es auf dem P4.
   Bevor der Secure Download Mode in der Produktion aktiviert wird, die Chip-
   Revision prüfen: Bei v3.1 kann das ROM dann im Download-Modus die Flash-Versorgung nicht einschalten
   (Erratum ROM-770, behoben in v3.2), und diese Platine versorgt den Flash nur
   aus dem Chip. Ein solcher Chip ließe sich über das ROM nicht mehr flashen.
10. **Strapping-Pins**: GPIO34, 35 und 36 führen Ethernet-Signale. Sie beim Reset
    hochohmig oder auf High halten; die Pull-ups auf der Platine tun das,
    solange die Firmware sie vor einem Reset nicht auf Low treibt.
11. **Stromquelle**: USB, DC und PoE enden an derselben 5-V-Schiene. Die Firmware
    kann sie nicht unterscheiden.
12. **WLAN-Sendeleistung**: Sie soll eine Einstellung sein, keine Konstante, begrenzt durch den
    Wert, den das Prüflabor am Leser als konform befindet
    (`esp_wifi_set_max_tx_power()`, in Schritten von 0,25 dB). Das Zertifikat des Moduls
    nennt 19,85 dBm bei 2,4 GHz gegenüber einem Grenzwert von 20 dBm
    EIRP und 20,58 bis 20,77 dBm in den drei 5-GHz-Bändern, gemessen mit
    Espressifs Platine. Hier
    sitzt die Antenne an anderer Stelle, die im Vollwellenmodell
    in einigen 5-GHz-Kanälen bis zu 5,5 dB mehr abstrahlt als Espressifs Position auf derselben
    Platine (Designnotizen, „Wi-Fi module“), daher misst das Labor sie. Die Grenzen für eine Station
    ohne Radarerkennung: 20 dBm EIRP bei 2,4 GHz, 23 dBm von 5150 bis
    5250 MHz und 20 dBm von 5250 bis 5725 MHz, es sei denn, die Firmware regelt die Sende-
    leistung (TPC), was das Labor dann bestätigen muss.
13. **Chip-Revision**: Dieselbe Teilenummer wird als v3.0, v3.1 und v3.2 ausgeliefert. v3.0
    braucht gelegentlich einen zweiten Start (Erratum MSPI-749; der Watchdog
    startet ihn neu) und darf die Peripherie-Spannungsdomäne im Light Sleep nicht abschalten,
    weil der Flash von einem der Regler des Chips versorgt wird
    (Erratum Analog-765).
14. **Temperatur**: Die Platine hat keinen eigenen Temperatursensor; den
    im ESP32-P4 (`temperature_sensor`-Treiber) verwenden. Er liest den Chip,
    den die thermische Schätzung 5 K über der Platine darunter und im typischen Betrieb 30 bis
    40 K über dem Raum ansetzt. Der Leser ist ein geschlossenes Kunststoffgehäuse
    mit 2,5 bis 3,6 W im Inneren, daher bestimmen die Raumtemperatur und die LEDs,
    wie warm er wird: Nach der Schätzung läuft die Platine im typischen Betrieb 23 K (USB), 26 K (DC) oder
    31 K (PoE) über dem Raum und 42 bis 55 K, wenn lange alles
    an ist, wobei die LED-Reihen 70 bis 80 K über dem Raum erreichen.
    Hintergrundbeleuchtung und LEDs dimmen, in der Reihenfolge ihrer Wirkung (LEDs
    zuerst), wenn der Chip etwa 80 °C überschreitet, und das melden; reicht das nicht,
    auch das Funkmodul zurückhalten. Das WLAN-Modul hat seine eigene Grenze:
    Seine 85-°C-Angabe bezieht sich auf die Luft unmittelbar außerhalb, die die Schätzung
    am PoE in einem Raum von 40 °C auf bis zu 75 °C ansetzt, wenn das Modul überwiegend
    empfängt, und auf 84 °C, wenn es 40 % der Zeit sendet. Die Firmware hält das Senden
    des Moduls daher auf 40 % der Zeit im Minutenmittel
    (gezählt aus den an das Funkmodul eingereihten Bytes und der Verbindungsrate oder aus
    den Statistiken von esp-hosted). Der eigene Verkehr des Lesers bleibt weit darunter;
    es greift nur bei langen Uploads wie Logs. Die Zahlen sind Schätzungen
    mit 40 % Genauigkeit; der Inbetriebnahmeplan misst sie.

Nicht an Hardware geprüft: alles in dieser Liste. Es folgt der Espressif-
Dokumentation für die verwendeten Bauteile.
