# Inbetriebnahmeplan
<!-- llms-description: Schritt-für-Schritt-Plan zum Einschalten und Testen der ersten bestückten Touch-P4-Platinen, von den Versorgungsschienen bis zu WLAN, NFC, Wärme und Vorab-Konformitätsprüfungen. -->

Die Prüfschritte für die ersten bestückten Platinen, mit erwarteten Werten und Bestehenskriterien. Für alle, die sie aufbauen und prüfen.

Arbeiten Sie die Abschnitte der Reihe nach ab. Halten Sie an und untersuchen Sie die Ursache, wenn ein Schritt fehlschlägt. Verwenden Sie für das erste Einschalten ein strombegrenztes Labornetzteil.

## Vor der Bestellung

- [ ] **Passung des Display-Flexkabels.** 1:1-Ausdrucke der [Bestückungsseite](_media/hardware/touch-p4/board-front.pdf ':ignore') und der [Displayseite](_media/hardware/touch-p4/board-back.pdf ':ignore') Rücken an Rücken auf 1,6 mm Karton kleben. Das Flexkabel des Displays flach auf seine Metallrückseite falten und das Display auf einem Abstandshalter von 1,7 mm auf die Displayseite des Kartons legen. Bestanden: Der steife Teil mit dem Touch-Controller liegt flach vor dem Schlitz hinter dem Display, der Kontaktstreifen geht in einer S-Biegung durch den Schlitz wie in [design-notes.md](hardware/touch-p4/design-notes.md) beschrieben, er geht bis zum Anschlag in J601, ohne gedehnt zu werden, die Kontakte zeigen zur Platine. Bei 2,0 mm wiederholen, der oberen Grenze. Keine Rechnung ersetzt das: Ein zu kurzes Flexkabel lässt sich nicht reparieren.
- [ ] Ein Elektronikingenieur sieht sich die offenen Punkte unter [Bekannte Einschränkungen](hardware/touch-p4/limitations.md) an.
- [ ] JLCPCB (oder der gewählte Bestücker) kann jede Zeile der Stückliste liefern, insbesondere den ESP32-P4NRW32X und für die LAN-Version das PoE-Modul DP9900M-5V. Knappe Zeilen: [parts.md](hardware/touch-p4/parts.md), Beschaffungsrisiken.
- [ ] Die Ziele `check` und `check-footprints` ausführen ([development.md](hardware/touch-p4/development.md)) und die Gerbers in einem Viewer ansehen. `check` enthält die Simulationen; Bericht: `fab/reports/simulation.txt`.
- [ ] Unbestückte Platinen, vor der Bestückung: Eine LED lässt sich ohne Gewalt in jedes ihrer Fenster setzen.

## Spannungsversorgung, ohne Display

| # | Schritt | Bestanden |
|---|---|---|
| 1 | Sichtprüfung der Ausrichtung: U201 (Pin 1), U301, J601, U105 bis U107, U204, Q101, Q102, D101, D103, D105, D106, C103, C120, die LEDs | alles richtig |
| 2 | Widerstand gegen Masse an den Testpunkten `5V`, `3V3`, `VDD_HP`, `5V_USB`, `VDC` und `5V_DC` | kein Kurzschluss |
| 3 | 5 V in USB-C, Netzteil auf 200 mA begrenzt | `5V`: etwa 5 V (das eFuse U105 verliert einige mV; kein Diodenabfall). `3V3`: 3,3 V ±3 %. `EN`: steigt 120 bis 280 ms nach `3V3` (der Spannungswächter U204 hält CHIP_PU bis dahin auf Low). `VDD_HP`: etwa 1,1 V ohne Firmware, aus dem internen Regler des Chips; der Wandler U202 bleibt aus, bis die Firmware EN_DCDC setzt (0 V ohne Firmware und im Download-Modus). 0 V an `VDD_HP` bedeuten einen Kurzschluss auf der Schiene, keine 3,3 V am Chip oder den Chip im Reset gehalten. |
| 4 | Strom ohne Firmware | einige zehn mA. Dann die Grenze auf 1 A anheben. |
| 5 | Überspannungsabschaltung des eFuse, an USB-C: die Spannung langsam ab 5 V erhöhen; bei 6 V anhalten (die TVS D101 beginnt knapp darüber ein wenig zu leiten) | `5V` fällt zwischen 5,53 und 5,74 V auf 0 V, während `5V_USB` der Spannung folgt; wieder gesenkt, kommt `5V` unter 5,03 bis 5,23 V zurück |
| 6 | DC-Klemme, USB abgezogen: 12 V, auf 200 mA begrenzt (`+` und `-` neben der Klemme aufgedruckt), dann 24 V | `5V`: etwa 5,0 V |
| 7 | DC-Buchse: mit einem Messgerät prüfen, dass der Mittelkontakt das `+` der Klemme ist; dann 12 V über einen Stecker | Polarität richtig, Platine läuft |
| 8 | DC-Eingang mit vertauschter Polarität | kein Strom, nichts wird warm |
| 9 | Ein 24-V-Netzteil einige Male unter Spannung einstecken; Oszilloskop an `VDC` (Wandlereingang, TVS D106), Trigger auf die steigende Flanke bei 30 V. Einmal mit 5 m 1,5-mm²-Draht in der Klemme zu einem Labor- oder Hutschienen-Netzteil: der schlimmste Fall (dicker Draht hat wenig Widerstand, um das Schwingen zu dämpfen; sehr kurzer Draht zu wenig Induktivität, um eines zu erzeugen) | Spitze unter 40 V. Simuliert: unter 35 V, auch aus 26,4 V; der Elektrolytkondensator C120 dämpft das Schwingen. Wenn höher: prüfen, dass C120 bestückt ist und C112, C113, C117 die 100-V-Teile mit 2,2 uF sind. |
| 10 | DC und USB beide angeschlossen: DC ziehen und wieder einstecken, dann dasselbe mit USB | Platine läuft weiter. Simuliert: `3V3` bleibt über 2,99 V, dem höchsten Pegel, bei dem der Spannungswächter die MCU zurücksetzen darf. |
| 11 | Betrieb am DC-Eingang: VBUS des nicht eingesteckten USB-C-Steckverbinders messen (an F101), dann in einen USB-C-Port eines Computers stecken. Beides nach einer halben Stunde im Gehäuse wiederholen. | VBUS unter 0,5 V; der Port kommt hoch. Das eFuse U105 sperrt die 5-V-Schiene gegen VBUS, lässt aber einige uA zurückfließen, die R104 nahe 0 V hält. Über 0,8 V bleibt ein USB-C-Port aus: 1 k für R104 bestücken. |
| 12 | Laststufe an der 3,3-V-Schiene, aus USB mit der Grenze bei 1,5 A: elektronische Last an den Testpunkten `3V3` und `GND`, die zwischen 0,1 und 1 A springt; Oszilloskop an `3V3`, AC-gekoppelt, Massefeder am Testpunkt. Mit entferntem Feed-Forward-Kondensator C108 (12 pF) wiederholen. | Die Variante behalten, die schneller und mit weniger Überschwingen einschwingt; in der Schaltungsbeschreibung festhalten. Die Kapazität der Schiene (etwa 49 uF effektiv) liegt am oberen Ende dessen, was TI für diesen Wandler als stabil nachgewiesen hat; das Nachschwingen zeigt die verbleibende Phasenreserve (Methode aus TI SLVA289). |
| 13 | Surge am DC-Eingang, wenn ein Surge-Generator verfügbar ist (ein Prüflabor hat einen): EN 50130-4 Leitung gegen Erde über 42 Ohm, beide Polaritäten, im Betrieb an 12 V und an 24 V | Platine läuft weiter; D105, D106, D107 unbeschädigt. Simulierter Fall (1 kV) und Schutz: [design-notes.md](hardware/touch-p4/design-notes.md#stromversorgung). |

Weitere Schienen. Die kleinen Testpunkte tragen den Namen der Schiene:

| Schiene | Erwartet | Messen an |
|---|---|---|
| USB-Eingang hinter Sicherung und Ferrit | 5 V | `5V_USB` |
| DC-Eingang am Wandler | Spannung des Netzteils abzüglich 0,5 bis 0,7 V | `VDC` |
| Ausgang des DC-Wandlers | 5,0 V | `5V_DC` |
| Ausgang des PoE-Moduls | 5,0 V | `5V_POE` |
| Flash-Versorgung (von der MCU) | 3,3 V | `VDD_FLASH` |
| PSRAM-Versorgung (von der MCU) | 0 V ohne Firmware, 1,9 V mit | C226 (0402, neben der MCU) |
| PN532-Versorgung | etwa 5 V | C501 |
| Reglerausgang des PN532 | 3,0 V, sobald NFC_RST High ist | `DVDD` (`AVDD` und `TVDD` hinter ihren Ferriten) |
| PHY-Versorgung und sein 1,1-V-Regler | 3,3 V und 1,1 V | `PHY_3V3` und C404 |
| Anode der Hintergrundbeleuchtung | 11 bis 13 V bei Betrieb; etwa die 5-V-Schiene, wenn aus | `BL_A` |

## MCU

| # | Schritt | Bestanden |
|---|---|---|
| 1 | USB-C an einen PC | meldet sich als USB Serial/JTAG. Wenn nicht: BOOT gedrückt halten, RST antippen, BOOT loslassen, erneut versuchen. |
| 2 | `esptool.py chip_id` / `flash_id` | ESP32-P4 Revision v3.x, 16 MB Flash |
| 3 | Ein Hello-World flashen; Boot-Log an UART0 am Testpunkt TX0. Den 40-MHz-Quarz messen: Frequenzzähler mit einem aktiven Tastkopf von 1 pF oder weniger an C239 (der Tastkopf zieht ihn um einige ppm), oder den P4 eine Stunde lang seine eigene Zeit gegen einen NTP-Server zählen lassen (10 ppm = 36 ms pro Stunde; der eigene Quarz des WLAN-Moduls sagt nichts über diesen aus) | Quarz schwingt an; innerhalb ±10 ppm (±400 Hz). Um mehr zu langsam: C238 und C239 von 12 pF auf 10 pF (C32949). Zu schnell: 15 pF. Siehe [design-notes.md](hardware/touch-p4/design-notes.md#abblockung-am-mcu). |
| 4 | `VDD_HP` mit Firmware | etwa 1,1 V, Welligkeit unter 30 mV |
| 5 | CPU- und PSRAM-Stresstest mit vollem Takt (beide Kerne ausgelastet, Display wird aktualisiert, Ethernet- oder WLAN-Verkehr): eine Stunde bei Raumtemperatur, zehn Minuten nach dem Erwärmen im Gehäuse. Oszilloskop mit 20 MHz Bandbreite an `VDD_HP`, `VDD_PSRAM` (C226), `VDD_FLASH`. | kein Reset, kein PSRAM- oder Flash-Fehler. Einbrüche unter 1,05 V an `VDD_HP` oder unter 1,8 V an `VDD_PSRAM` bedeuten, dass eine spätere Revision mehr Abblockung braucht ([Bekannte Einschränkungen](hardware/touch-p4/limitations.md)); bis dahin die CPU mit niedrigerem Takt betreiben. |

## WLAN-Co-Prozessor

Der ESP32-C5-MINI-1 sitzt in der linken oberen Ecke, mit seiner Antenne auf dem Modul. Seine USB-Pins führen SDIO D2 und D3, er wird also nur über UART geflasht.

| # | Schritt | Bestanden |
|---|---|---|
| 1 | Die Co-Prozessor-Firmware von esp-hosted über die Testpunkte neben dem Aufdruck „C5“ in den C5 flashen (TX, RX, EN; BOOT beim Reset auf Low gehalten). Dasselbe Release wie die esp-hosted-Komponente des P4, 3.1.0 oder neuer, gebaut für das 4-MB-Modul. | lässt sich flashen |
| 2 | esp-hosted-Host-Beispiel auf dem P4: SDMMC-Slot 0, Reset-GPIO 45, zuerst 20 MHz | Log-Zeile „INIT event from ESP32 peripheral“, keine Versionswarnung. Bei `send_op_cond returned 0x107` zuerst den Reset prüfen: EN des Moduls (Testpunkt EN neben dem Aufdruck „C5“) muss auf High enden. |
| 3 | Bevor WLAN verwendet wird: Raw-Throughput-Test von esp-hosted, beide Richtungen, mit 40 MHz, dann 50 MHz, je zehn Minuten, Display läuft. Testet allein die SDIO-Verbindung. | kein CRC-Fehler (`0x109`), kein Timeout (`0x107`). Fehler hier liegen an der Platine (Timing, Versorgung des Moduls) oder an der SDIO-Einheit des C5, nicht an Firmware oberhalb der Verbindung: notieren, bei welchem Takt sie aufhören, und den Takt der Firmware eine Stufe darunter festlegen. Simulierte Reserve: 10,0 ns bei 40 MHz, 5,0 ns bei 50 MHz ([Simulationen](hardware/touch-p4/simulations.md)). |
| 4 | Länder-Einstellungen, vor dem Verbinden. Den Provisionierungs-Access-Point starten. | Der C5 meldet das EU-Land mit der manuellen Policy; ein Scan listet 5-GHz-Access-Points nur auf den Kanälen 36 bis 64 und 100 bis 140, keine auf 149 bis 165 ([firmware-port.md](hardware/touch-p4/firmware-port.md), WLAN-Länderregel). Der Access Point kommt auf 2,4 GHz oder den Kanälen 36 bis 48 hoch. |
| 5 | Auf beiden Bändern scannen und verbinden. RSSI neben einem vorhandenen Leser mit externer Antenne (die Referenz für die Reichweite), geschlossenes Gehäuse an der Wand, auf den Kanälen 1 und 13, 36 und 64, 100 und 140, wo der Access Point es zulässt. Auf jedem Band einige MB herunterladen, auch von einem Wi-Fi-6-Access-Point. Einen 5-GHz-Kanal an einer Metallwand wiederholen. | Das Vollwellenmodell setzt diesen Antennenplatz in jedem Kanal innerhalb von 3 dB von Espressifs an ([design-notes.md](hardware/touch-p4/design-notes.md#antenne)). |
| 6 | Bluetooth bei verbundenem WLAN: zehn Minuten scannen, dann mit den Geräten verbinden, die die Plugins verwenden | Meldungen treffen weiter ein; Verbindungen funktionieren |

## Display und Touch

| # | Schritt | Bestanden |
|---|---|---|
| 1 | Das Display einsetzen. Den IO-Expander (0x20) initialisieren, LCD_RST pulsen, die ST7701-Init-Sequenz über die Expander-Pins senden, das RGB-Panel starten. | Bild |
| 2 | Strom des Panels, Hintergrundbeleuchtung aus, 5-V-Labornetzteil an USB-C: Eingangsstrom, bevor das Panel eingesteckt ist, und mit laufendem Panel | Differenz x 1,4 ≈ Strom des Panels bei 3,3 V (obere Schranke: enthält den Mehrverbrauch der MCU für den RGB-Bus). Die Leistungsbilanz geht von 60 mA aus ([design-notes.md](hardware/touch-p4/design-notes.md#stromversorgung)). |
| 3 | PWM der Hintergrundbeleuchtung an GPIO26, volle Aussteuerung | etwa 0,2 V an R603 (39 mA) |
| 4 | Touch | GT911 antwortet an I2C0; Ausrichtung der Koordinaten richtig |
| 5 | Display bei aktivem WLAN | kein Tearing, keine Drift |

## NFC

| # | Schritt | Bestanden |
|---|---|---|
| 1 | Die Firmware-Version des PN532 an I2C1 bei 0x24 lesen, nachdem NFC_RST auf High geht | antwortet als PN532: IC 0x32, Version 1.6. Das bestückte Teil ist eine zweite Bezugsquelle; tut es das nicht, das NXP-Teil bestücken. |
| 2 | Bevor das Feld zum ersten Mal eingeschaltet wird: R504 und R505 entfernen; mit eingesetztem Display die Schleife mit einem LCR-Messgerät oder Netzwerkanalysator über deren antennenseitige Pads messen | Simuliert: 1,25 uH auf der Werkbank oder an einer Wand aus Holz oder Stein, 1,20 uH auf einer Metallplatte. Die bestückte Anpassung ist mit den Bauteiltoleranzen dieser Platine sicher für 1,12 bis 1,25 uH, mit exakten Werten für 0,93 bis 1,39 uH. Dazwischen: das Feld beim ersten Mal höchstens eine Sekunde einschalten und zuerst den Strom lesen (Schritt 3); bei 1,0 uH zieht eine von fünf Platinen mehr als 100 mA, bei 1,3 uH eine von zwanzig. Außerhalb von 0,93 bis 1,39 uH: zuerst die Werte ändern. |
| 3 | Feld an: Senderstrom aus der Spannung an FB503 (0,15 Ohm) oder dem Anstieg des 5-V-Stroms. Dann ein Telefon und eine Karte an den Leser halten (sie senken die Induktivität der Schleife). | unter 100 mA, auch mit Telefon und Karte. Erwartet 35 bis 45 mA bei 1,20 bis 1,25 uH. |
| 4 | Empfängereingang: Tastkopf von 10 pF oder weniger an dem Pad von R507, das nicht an C521 (VMID) liegt | erwartet 1,2 bis 1,9 Vss; muss unter 4 Vss bleiben, auch mit einer Karte oder einem Telefon im Feld. Höher: ein größeres R506 bestücken (jetzt 3,9 k). |
| 5 | Die Antenne mit einem Netzwerkanalysator zwischen EMV-Filter und Anpassnetzwerk abgleichen ([design-notes.md](hardware/touch-p4/design-notes.md)). Die LAN-Version für sich abgleichen, mit eingestecktem Kabel (Stecker und Kabel liegen neben der Schleife). | endgültige Werte von C513 bis C519, R504, R505, R506 in der Schaltungsbeschreibung festhalten |
| 6 | Lesedistanz mit den verwendeten Karten (DESFire, NTAG 424), Display und LEDs an, WLAN sendet; auf der Werkbank und auf einer Metallplatte (senkt die Schleife um 0,05 uH) | Simuliert: Feld stark genug für jede Standardkarte bis 19 mm vor dem Gehäuse, 15 mm auf Metall; die meisten Karten lesen weiter. Wenn zu kurz, obwohl Schleife und Strom wie erwartet sind: Der Sender läuft mit etwa 40 seiner 100 mA. Eine Anpassung näher an 40 Ohm oder 1,0 Ohm für R504 und R505 erhöht den Schleifenstrom; danach Strom, Empfängereingang und das Feld an einer Karte auf dem Gehäuse (höchstens 7,5 A/m) erneut prüfen. |

## Wärme

Die Schätzung setzt die Platine im typischen Betrieb je nach Versorgung 23 bis 31 K über den Raum und ist bestenfalls auf 40 % genau ([Simulationen](hardware/touch-p4/simulations.md)). Das Gehäuse ist aus geschlossenem Kunststoff.

| # | Schritt | Bestanden |
|---|---|---|
| 1 | Geschlossenes Gehäuse an der Wand, Firmware im Normalzustand (Display an, WLAN verbunden, NFC-Polling, LEDs auf Ruhepegel), jede Versorgung nacheinander. Nach einer Stunde: Temperatursensor des Chips, Vorderseite des Displays, Luft im Inneren durch die untere Aussparung. | Chip 30 bis 40 K über dem Raum, Displayvorderseite 15 bis 25 K |
| 2 | Alle LEDs auf ihrem hellsten Dauerpegel, Hintergrundbeleuchtung voll; Thermoelement neben D702 und D707 (die LED-Reihen sind dann die wärmste Stelle) | die LED-Grenze der Firmware daraus festlegen; die Leistungsbilanz hält alle LEDs zusammen in jedem Fall unter 100 mA |
| 3 | Am PoE: das Modul U102 nach einer Stunde (es steht in Luft, die so warm ist wie die Platine) | Wert notieren |
| 4 | Luft neben dem WLAN-Modul (darauf bezieht sich seine 85-°C-Angabe): feines Thermoelement in der Lücke zwischen der rechten Kante des Moduls und den Pull-ups, ohne Kupfer zu berühren, geschlossenes Gehäuse am PoE. Einmal im Normalzustand, einmal mit dem Modul, das 40 % der Zeit sendet (ein Upload in Stufen, die Grenze der Firmware). | Erwartet in einem Raum von 40 °C: 63 bis 75 °C und 65 bis 84 °C (mit der Raumtemperatur im Test skalieren; [design-notes.md](hardware/touch-p4/design-notes.md#wärme)). Weniger als 5 K bis 85 °C bei 40 °C im zweiten Fall: die Sendegrenze der Firmware senken. |
| 5 | Für Räume über 30 °C: Schritt 1 in einem Wärmeschrank bei dieser Temperatur wiederholen | Display bis 70 °C spezifiziert |

## Ethernet und PoE (LAN-Version)

| # | Schritt | Bestanden |
|---|---|---|
| 1 | USB-versorgt. Die Firmware pulst zuerst den PHY-Reset über den IO-Expander auf Low ([firmware-port.md](hardware/touch-p4/firmware-port.md)); ohne das kann der PHY mit falscher Adresse oder ohne Takt hochkommen. Einen zweiten Switch und ein gekreuztes Kabel ausprobieren. | Verbindung mit 100 Mbit/s Vollduplex, DHCP funktioniert, Ping ohne Verlust |
| 2 | PoE-versorgt, USB abgezogen | Platine startet |
| 3 | Zwei Versorgungen gleichzeitig (PoE oder DC mit USB). VBUS bei getrennter PC-Seite messen. | VBUS 0 V (keine Rückspeisung in den USB-Host); keine Spannung an den offenen DC-Anschlüssen |
| 4 | Temperatur des PoE-Moduls nach 30 Minuten bei voller Last | Wert notieren |
| 5 | PoE zehnmal abziehen und wieder einstecken | jedes Mal sauberer Neustart |
| 6 | Bevor das Display aufgesetzt wird: messen, wie weit die Pins der Buchse aus der Displayseite ragen (erwartet 1,5 bis 1,9 mm). Alle Pins, die beiden Schirmlaschen und die zwei Kunststoffzapfen mit einem Seitenschneider auf 1 mm kürzen, über dem Lot, nicht durch es hindurch. Polyimidband auf die Metallrückseite des LCD über der Ecke, die auf ihnen liegt, 2 mm um die Kante des Moduls bei den beiden 48-V-Pins herumgeschlagen (die beiden dem Platinenrand nächsten in den oberen Reihen). | Display sitzt 1,7 mm über der Platine; nichts von Display oder Gehäuse berührt die Pins |
| 7 | Isolation, an einem Gerät, das Sie entbehren können, Display entfernt: 1500 V effektiv (oder 2250 V DC) eine Minute lang zwischen den acht miteinander verbundenen Kontakten der Buchse und der Masse der Platine | kein Durchschlag |

## Stromquellen und Grenzen der Firmware

| # | Schritt | Bestanden |
|---|---|---|
| 1 | DC und PoE vorhanden | P5 des Expanders nur High, solange ein DC-Netzteil angeschlossen ist; P7 nur High, solange der PoE-Port Strom liefert |
| 2 | USB als einzige Quelle (USB-2.0-Port, über ein USB-Messgerät), Grenzen der Firmware eingeschaltet: Leerlauf, Abfrage nach Karten, WLAN-Verkehr (Mittel über 1 s). DC einstecken, dann wieder ziehen. | in allen drei Fällen unter 500 mA. Mit DC werden die Grenzen aufgehoben; ohne kommen sie innerhalb von 0,5 s zurück. |
| 3 | Ohne Firmware (MCU im Reset gehalten), USB-2.0-Port | weit unter 500 mA: LEDs, Hintergrundbeleuchtung und Buzzer werden durch Widerstände ausgeschaltet gehalten |

## LEDs und Buzzer

| # | Schritt | Bestanden |
|---|---|---|
| 1 | MCU im Reset gehalten; dann jede LED der Reihe nach einschalten. Nie alle acht mit vollem Weiß (das Datenblatt der LED erlaubt 70 % für Weiß). | dunkel im Reset; Reihenfolge und Farben richtig |
| 2 | Hellstes Muster, das die Firmware erlaubt, 5-V-Strom gegenüber allen LEDs dunkel (alle Kanäle aller acht LEDs zählen; [design-notes.md](hardware/touch-p4/design-notes.md#stromversorgung)) | Anstieg unter 100 mA |
| 3 | Piepton mit 2,7 kHz. Der Schall verlässt den Buzzer an der Seite, die zum unteren Platinenrand zeigt. Den Buzzer-Pin nie auf High lassen: Spule und Widerstand sind für einen Ton gemacht, nicht für Gleichstrom. | in einer Werkstatt laut genug; kein hörbares Rauschen, keine Störung auf dem Display |
| 4 | Einen Piepton anfordern, während der Leser nach Karten fragt (die Leistungsbilanz verlässt sich darauf, dass nur bei ausgeschaltetem Feld gepiept wird) | NFC-Senderstrom (NFC, Schritt 3) weg, solange der Buzzer ertönt |

## Manipulationssensoren

| # | Schritt | Bestanden |
|---|---|---|
| 1 | I2C0-Scan | Beschleunigungssensor bei 0x19, Register 0x0F liest 0x33 |
| 2 | Drei Achsen, Platine flach, dann stehend | 1 g wandert auf die Achse, die nach unten zeigt |
| 3 | Hall-Schalter: P6 des Expanders lesen. Den Magneten des Docks von der Bestückungsseite an U703 (markiert `DOCK`) heranführen; Einschalt- und Ausschaltabstand notieren. | P6 = 1 auf der Werkbank. An bei 19 mm oder mehr, spätestens bei 45 mm wieder aus. |
| 4 | Leser auf seinem Dock mit Magnet; abheben | P6 = 0 auf dem Dock, 1 abgehoben |
| 5 | Den Buzzer mit und ohne Magnet vor der Platine ertönen lassen; dabei den Beschleunigungssensor beobachten | Ton unverändert; Ausgang des Beschleunigungssensors notieren |
| 6 | Annäherungssensor U704 (markiert `PROX`): Messung an (16 Bit, 8T, zunächst 100 mA), Register 0x08 lesen: Werkbank mit der Bestückungsseite zum offenen Raum; weißes Papier bei 14 mm, dann 16 mm; auf dem Dock, Gehäuse geschlossen, jede verwendete Dock-Farbe; abgehoben | antwortet bei 0x60, ID-Register 0x0C liest 0x0186. Werkbank: nahe 0. Papier- und Dock-Werte notieren. Abgehoben: fällt sofort auf nahe 0. |
| 7 | Auf dem Dock: starke Lampe und, wenn möglich, Sonnenlicht von jeder Seite auf das Gehäuse. Den Umgebungslichtwert (Register 0x09) im geschlossenen Gehäuse mit ausgeschalteten Status-LEDs und mit vollem Weiß notieren, und abseits des Docks. | Annäherungswert bleibt, wo er war |
| 8 | Schwellwerte (Register 0x06, 0x07) um den Dock-Wert setzen, Interrupt für beide Richtungen | TP815 (`INT` neben `PROX`) High auf dem Dock, Low beim Abheben, und bleibt Low, bis das Flag-Register 0x0B gelesen wird |

## Vor dem Prüflabor

Warum diese Punkte wichtig sind, steht unter [compliance.md](hardware/touch-p4/compliance.md).

| # | Schritt | Bestanden |
|---|---|---|
| 1 | Dauertest: 24 Stunden im Gehäuse mit normalem Nutzungsmuster | kein Fehler |
| 2 | ESD-Vortest (Aufbau nach IEC 61000-4-2), geschlossener Leser auf seinem Dock, Display, WLAN und NFC aktiv: 8 kV Luftentladung rundum auf die Glaskanten, jedes LED-Fenster, die Buzzer-Löcher, die Fugen und die Kabelaussparungen; 4 kV Kontaktentladung auf die zwei Verschlussschrauben. Zehn Entladungen je Polarität und Punkt. Diese Punkte ließen sich aus Datenblättern nicht zeigen ([design-notes.md](hardware/touch-p4/design-notes.md#esd-je-anschluss); [Bekannte Einschränkungen](hardware/touch-p4/limitations.md)). | darf zurücksetzen, erholt sich aber selbst, danach funktionieren Touch, WLAN und NFC (Kriterium B) |
| 3 | Abgestrahlte Störaussendung vorab scannen, bei laufendem Display und aktivem Ethernet, wenn eine Nahfeldsonde oder eine Vorab-Konformitätskammer verfügbar ist | Ergebnis für das Labor festhalten |
| 4 | WLAN-EIRP des geschlossenen Lesers auf beiden Bändern, Testmodus der Firmware bei höchster Leistung, auf den Kanälen des Labors (niedrigster, mittlerer, höchster jedes Bandes) | die Obergrenze der Firmware daraus festlegen: 20 dBm EIRP bei 2,4 GHz und von 5250 bis 5725 MHz, 23 dBm von 5150 bis 5250 MHz ([compliance.md](hardware/touch-p4/compliance.md)) |
