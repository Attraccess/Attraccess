# Inbetriebnahmeplan für die ersten Platinen
<!-- llms-description: Schritt-für-Schritt-Plan zum Einschalten und Testen der ersten bestückten Touch-P4-Platinen, von den Versorgungsschienen bis zu WLAN, NFC, Wärme und Vorab-Konformitätsprüfungen. -->

Arbeiten Sie dies an den ersten bestückten Platinen der Reihe nach ab. Halten Sie an und
untersuchen Sie die Ursache, wenn ein Schritt fehlschlägt. Verwenden Sie für das erste Einschalten ein strombegrenztes Labornetzteil.

## Vor der Bestellung

1. Legen Sie ein Muster-Display auf einen 1:1-Ausdruck der Platine (die Pläne der
   [Bestückungsseite](_media/hardware/touch-p4/board-front.pdf ':ignore') und der
   [Displayseite](_media/hardware/touch-p4/board-back.pdf ':ignore'), Rücken an Rücken auf 1,6 mm Karton geklebt), auf einen Abstandshalter von
   1,5 mm: Prüfen Sie, dass das Flexkabel J601 durch den Schlitz mit der in den
   Designnotizen beschriebenen Faltung erreicht, dass seine steifen Teile flach hinter der
   Platine liegen, dass es bis zum Anschlag in den Steckverbinder geht, ohne gedehnt zu werden,
   und dass die Kontakte zur Platine zeigen. Probieren Sie auch 2,0 mm; das ist die Grenze
   laut Zeichnung. Das ist die eine Prüfung, die keine Rechnung ersetzt: Eine Platine
   mit einem zu kurzen Flexkabel lässt sich nicht reparieren.
2. Lassen Sie einen Elektronikingenieur die offenen Punkte ansehen, die in den Designnotizen unter „Design
   review“ aufgeführt sind.
3. Prüfen Sie, dass JLCPCB (oder der gewählte Bestücker) jede Zeile der Stückliste liefern kann, insbesondere
   den ESP32-P4NRW32X (am 22. November 2026 keiner auf Lager), und für
   die Ethernet-Version das PoE-Modul DP9900M-5V (38 auf Lager, fallend). Die Liste der knappen Zeilen steht unter „Sourcing risks“
   in den Designnotizen.
4. Führen Sie die Ziele `check` und `check-footprints` aus ([Übersicht](hardware/touch-p4/overview.md#arbeiten-am-design)) und sehen Sie sich die
   Gerbers in einem Viewer an. `check` enthält die Simulationen; ihr Bericht ist
   `fab/reports/simulation.txt`.
5. Wenn die unbestückten Platinen vor der Bestückung eintreffen: Setzen Sie eine LED in eines ihrer
   Fenster. Sie muss sich ohne Gewalt einsetzen lassen.

## Spannungsversorgung, ohne Display

1. Sichtprüfung: Ausrichtung von U201 (Pin 1), U301, J601, U105 bis U107, U204,
   Q101, Q102, der Dioden D101, D103, D105 und D106, C103, C120, der LEDs.
2. Widerstand von den Testpunkten `5V`, `3V3`, `VDD_HP`, `5V_USB`, `VDC` und `5V_DC`
   gegen Masse: kein Kurzschluss.
3. 5 V in USB-C einspeisen, das Netzteil auf 200 mA begrenzt.
   - Testpunkt `5V`: etwa 5 V. Das eFuse U105 verliert einige Millivolt; es gibt
     keinen Diodenabfall mehr.
   - `3V3`: 3,3 V +/- 3 %.
   - `EN`: steigt 120 bis 280 ms nach `3V3`. Der Supervisor U204 hält CHIP_PU
     der MCU bis dahin auf Low.
   - `VDD_HP`: etwa 1,1 V, auch ohne Firmware. Der Chip erzeugt sie mit einem
     internen Regler, bis die Firmware den Wandler U202 einschaltet (sein
     Freigabesignal EN_DCDC ist ohne Firmware und im Download-Modus 0 V). 0 V
     an `VDD_HP` bedeuten einen Fehler: ein Kurzschluss auf der Schiene, keine 3,3 V am Chip oder
     der Chip im Reset gehalten.
4. Strom ohne Firmware: einige zehn mA. Die Grenze auf 1 A anheben.
5. Überspannungsabschaltung des eFuse, weiterhin an USB-C: Die Spannung langsam
   ab 5 V erhöhen. `5V` muss zwischen 5,53 und 5,74 V auf 0 V fallen, während `5V_USB`
   der Spannung folgt. Wieder senken: `5V` kommt unter 5,03 bis 5,23 V zurück.
   Bei 6 V anhalten; die TVS D101 beginnt knapp darüber ein wenig zu leiten.
6. DC-Klemme, USB abgezogen: 12 V, auf 200 mA begrenzt, einspeisen (`+` und `-` sind
   neben der Klemme aufgedruckt). Testpunkt `5V`: etwa 5,0 V. Bei
   24 V wiederholen.
7. DC-Buchse: Prüfen Sie vor der ersten Benutzung mit einem Messgerät, dass der Mittelkontakt der Buchse
   das `+` der Klemme ist. Dann 12 V über einen Stecker einspeisen.
8. DC-Eingang mit vertauschter Polarität: Es fließt kein Strom und nichts wird warm.
9. Ein 24-V-Netzteil einige Male unter Spannung einstecken, mit einem Oszilloskop am Testpunkt `VDC`
   (der Eingang des Wandlers, wo die TVS D106 sitzt): Die Spitze muss
   unter 40 V bleiben. Auf die steigende Flanke bei 30 V triggern. Laut
   Simulation zu erwarten: unter 35 V, auch bei einem 26,4-V-Netzteil; der Elektrolytkondensator C120
   dämpft das Schwingen (Designnotizen, „Power“). Einmal mit einigen Metern
   dickem Draht zu einem Labor- oder Hutschienen-Netzteil durchführen (5 m 1,5-mm2-Draht in der
   Klemme), das ist der schlimmste Fall: Dicker Draht hat wenig Widerstand, um das Schwingen
   zu dämpfen, und sehr kurzer Draht zu wenig Induktivität, um eines zu erzeugen. Ist
   die Spitze höher als erwartet, prüfen, dass C120 bestückt ist und dass C112,
   C113 und C117 die 100-V-Teile (2,2 uF) sind.
10. Wechsel der Versorgung: Bei gleichzeitig angeschlossenem DC und USB den DC-Stecker ziehen
    und wieder einstecken, dann dasselbe mit USB. Die Platine läuft weiter. Laut
    Simulation bleibt `3V3` über 2,99 V, dem höchsten Pegel, bei dem der
    Supervisor die MCU zurücksetzen darf.
11. Bei Betrieb der Platine am DC-Eingang VBUS des nicht eingesteckten USB-C-Steckverbinders
    messen (an F101): unter 0,5 V. Dann in einen USB-C-Port eines
    Computers stecken: Der Port muss hochkommen. Beides wiederholen, nachdem der Leser
    eine halbe Stunde in seinem Gehäuse gelaufen ist. Das eFuse U105 sperrt die 5-V-Schiene gegen VBUS,
    lässt aber einige Mikroampere zurückfließen, die R104 nahe 0 V halten muss. Über
    0,8 V bleibt ein USB-C-Port aus; dann 1 k für R104 bestücken.
12. Laststufe an der 3,3-V-Schiene, aus USB gespeist mit der Grenze bei 1,5 A: eine
    elektronische Last an den Testpunkten `3V3` und `GND`, die zwischen 0,1
    und 1 A springt, und das Oszilloskop an `3V3` (AC-gekoppelt, Massefeder am
    Testpunkt). Das Nachschwingen nach jeder Stufe ansehen. Dann den
    Feed-Forward-Kondensator C108 (12 pF) entfernen und wiederholen. Die Kondensatoren der Schiene
    kommen auf etwa 49 uF effektiv, am oberen Ende dessen, was TI für diesen Wandler
    als stabil nachgewiesen hat (Designnotizen, „Power“), und das Nachschwingen zeigt, wie viel
    Phasenreserve bleibt (die Methode des Application Reports SLVA289 von TI).
    Die Variante behalten, die schneller und mit weniger Überschwingen einschwingt, und sie
    in der Schaltungsbeschreibung festhalten.
13. Surge am DC-Eingang, wenn ein Surge-Generator verfügbar ist (ein Prüflabor
    bietet ihn an): die Prüfung Leitung gegen Erde nach EN 50130-4 über 42 Ohm, beide
    Polaritäten, mit der Platine im Betrieb bei 12 V und bei 24 V. Die Platine
    muss danach weiterlaufen, und D105, D106 und D107 müssen unbeschädigt sein. Der
    simulierte Fall (1 kV) und der Schutz stehen in den Designnotizen,
    „Power“.

Weitere Schienen und wo man sie misst. Die kleinen Testpunkte tragen den Namen
der Schiene:

| Schiene | Erwartet | Messen an |
|---|---|---|
| USB-Eingang hinter Sicherung und Ferrit | 5 V | `5V_USB` |
| DC-Eingang am Wandler | die Spannung des Netzteils abzüglich 0,5 bis 0,7 V | `VDC` |
| Ausgang des DC-Wandlers | 5,0 V | `5V_DC` |
| Ausgang des PoE-Moduls | 5,0 V | `5V_POE` |
| Flash-Versorgung (von der MCU) | 3,3 V | `VDD_FLASH` |
| PSRAM-Versorgung (von der MCU) | 0 V ohne Firmware, 1,9 V mit | C226 (0402, neben der MCU) |
| PN532-Versorgung | etwa 5 V | C501 |
| Reglerausgang des PN532 | 3,0 V, sobald NFC_RST High ist | `DVDD` (`AVDD` und `TVDD` hinter ihren Ferriten) |
| PHY-Versorgung und sein 1,1-V-Regler | 3,3 V und 1,1 V | `PHY_3V3` und C404 |
| Anode der Hintergrundbeleuchtung | 11 bis 13 V bei Betrieb, etwa die Spannung der 5-V-Schiene im ausgeschalteten Zustand | `BL_A` |

## MCU

1. USB-C an einen PC anschließen. Der ESP32-P4 meldet sich als USB Serial/JTAG. Wenn nicht,
   BOOT gedrückt halten, RST antippen, BOOT loslassen und es erneut versuchen.
2. `esptool.py chip_id` / `flash_id`: ESP32-P4 Revision v3.x und ein
   16-MB-Flash erwartet.
3. Ein Hello-World flashen. Prüfen, dass der 40-MHz-Quarz anschwingt (die App läuft, UART0 am
   Testpunkt TX0 zeigt das Boot-Log). Seine Frequenz messen: mit einem
   Frequenzzähler und einem aktiven Tastkopf von 1 pF oder weniger an C239 (der Tastkopf
   zieht sie um einige ppm), oder indem der P4 eine Stunde lang seine eigene Zeit gegen einen
   NTP-Server zählt (10 ppm sind 36 ms pro Stunde; das WLAN-Modul hat einen
   eigenen Quarz und sagt nichts über diesen aus). Innerhalb von +-10 ppm
   (+-400 Hz) ist richtig. Läuft er um mehr als das zu langsam, die
   Lastkondensatoren C238 und C239 von 12 pF auf 10 pF (C32949) ändern; bei zu schnell auf
   15 pF (Designnotizen, „Decoupling and crystal at the MCU“).
4. `VDD_HP` erneut messen: etwa 1,1 V mit einer Welligkeit unter 30 mV.
5. Abblockung (Designnotizen, „Decoupling and crystal at the MCU“): einen CPU-
   und PSRAM-Stresstest mit vollem Takt laufen lassen (beide Kerne ausgelastet, das Display
   wird aktualisiert, Ethernet- oder WLAN-Verkehr) eine Stunde lang bei Raumtemperatur und
   zehn Minuten, nachdem sich der Leser in seinem Gehäuse erwärmt hat. Kein Reset, kein
   PSRAM- oder Flash-Fehler; `VDD_HP`, `VDD_PSRAM` (C226) und `VDD_FLASH`
   mit dem Oszilloskop bei 20 MHz Bandbreite beobachten: Einbrüche unter 1,05 V an `VDD_HP` oder unter
   1,8 V an `VDD_PSRAM` sind das Zeichen, dass die Abblockung einer späteren Revision
   nötig ist (Designnotizen, „Accepted deviations“); bis dahin die CPU
   mit niedrigerem Takt betreiben.

## WLAN-Co-Prozessor

Das Modul ist der ESP32-C5-MINI-1 mit seiner Antenne auf dem Modul, in der linken oberen
Ecke der Platine. Seine USB-Pins führen SDIO D2 und D3, es wird also nur
über UART geflasht.

1. Die Co-Prozessor-Firmware von esp-hosted über die Testpunkte neben dem Aufdruck „C5“ in den C5 flashen
   (TX, RX, EN und BOOT beim Reset auf Low gehalten). Dasselbe Release wie bei der esp-hosted-Komponente des P4
   nehmen, 3.1.0 oder neuer, gebaut für das 4-MB-Modul.
2. Das esp-hosted-Host-Beispiel auf dem P4 mit SDMMC-Slot 0 und Reset-GPIO
   45 ausführen, zuerst mit 20 MHz. Die Log-Zeile „INIT event from ESP32 peripheral“
   und keine Versionswarnung erwarten. Meldet der P4 `send_op_cond returned
   0x107`, zuerst den Reset ansehen: EN des Moduls (Testpunkt EN neben
   dem Aufdruck „C5“) muss auf High enden.
3. Bevor WLAN verwendet wird, den Raw-Throughput-Test von esp-hosted in beiden
   Richtungen mit 40 MHz und dann mit 50 MHz ausführen, je zehn Minuten, bei
   laufendem Display: kein CRC-Fehler (`0x109`) und kein Timeout (`0x107`). Das
   testet allein die SDIO-Verbindung. Fehler hier liegen an der Platine (Timing, Versorgung
   des Moduls) oder an der SDIO-Einheit des C5 und werden nicht durch Firmware oberhalb der
   Verbindung behoben; notieren, bei welchem Takt sie aufhören, und den Takt der Firmware
   eine Stufe darunter festlegen. Simuliert verlässt die Platine die Verbindung mit 10,0 ns bei 40 MHz und 5,0 ns
   bei 50 MHz (Designnotizen, „Simulation“).
4. Die Länder-Einstellungen vor dem Verbinden prüfen: Der C5 meldet das EU-
   Land mit der manuellen Policy, und ein Scan listet 5-GHz-Access-Points nur
   auf den Kanälen 36 bis 64 und 100 bis 140 auf, keine auf 149 bis 165
   ([firmware-port.md](hardware/touch-p4/firmware-port.md), Regel 22). Den Provisionierungs-
   Access-Point starten und prüfen, dass er auf 2,4 GHz oder den Kanälen 36 bis 48 hochkommt.
5. Scannen und verbinden, auf beiden Bändern. RSSI neben einem aktuellen Leser (mit
   dem ESP32-C6 und seiner externen Antenne) notieren, im geschlossenen Gehäuse an der Wand, auf
   den Kanälen 1 und 13, 36 und 64, 100 und 140, wo der Access Point es zulässt.
   Das Vollwellenmodell setzt diesen Platz in jedem Kanal innerhalb von 3 dB von Espressifs an
   (Designnotizen, „Wi-Fi module“); der aktuelle Leser ist die
   Referenz für die Reichweite. Auf jedem Band einige Megabyte herunterladen, auch an einem Wi-Fi-6-
   Access-Point. Einen 5-GHz-Kanal mit dem Leser an einer Metallwand wiederholen.
6. Bluetooth bei verbundenem WLAN: zehn Minuten scannen (die Meldungen müssen
   weiter eintreffen), dann mit den Geräten verbinden, die die Plugins verwenden.

## Display und Touch

1. Das Display einsetzen. Den IO-Expander (0x20) initialisieren, LCD_RST pulsen, die
   ST7701-Init-Sequenz über die Expander-Pins senden, das RGB-Panel starten.
2. Der 3,3-V-Strom des Panels, Hintergrundbeleuchtung aus, an einem 5-V-Labornetzteil an USB-C:
   den Eingangsstrom notieren, bevor das Panel eingesteckt ist, und mit laufendem Panel.
   Die Differenz mal 1,4 ist etwa der Strom des Panels bei 3,3 V (sie enthält auch,
   was die MCU für den RGB-Bus mehr zieht, ist also eine obere Schranke).
   Das Leistungsbudget geht von 60 mA aus (Designnotizen, „Power“).
3. Hintergrundbeleuchtung: PWM an GPIO26. Bei voller Aussteuerung etwa 0,2 V an R603 messen
   (39 mA).
4. Touch: Der GT911 antwortet an I2C0. Die Ausrichtung der Koordinaten prüfen.
5. Auf Tearing oder Drift bei aktivem WLAN achten.

## NFC

1. Der PN532 antwortet an I2C1 bei 0x24, nachdem NFC_RST auf High geht; die Firmware-
   Version lesen. Das bestückte Teil ist eine zweite Bezugsquelle: Es muss sich als PN532
   melden (IC 0x32, Version 1.6). Tut es das nicht, das NXP-Teil bestücken.
2. Bevor das Feld zum ersten Mal eingeschaltet wird, die Schleife messen: mit
   eingesetztem Display ein LCR-Messgerät oder Netzwerkanalysator über R504/R505 auf der
   Antennenseite (dafür beide Widerstände entfernen). Laut Simulation zu erwarten:
   1,25 uH mit dem Leser auf der Werkbank oder an einer Wand aus Holz oder Stein, 1,20 uH
   auf einer Metallplatte. Die bestückten Anpasswerte sind sicher für 1,12 bis 1,25 uH,
   gleich welche Toleranz die Teile auf dieser Platine haben, und für 0,93 bis 1,39 uH
   bei Teilen mit exaktem Wert. Dazwischen das Feld beim ersten Mal höchstens eine Sekunde lang
   einschalten und den Strom lesen (nächster Schritt), bevor man es
   eingeschaltet lässt: Bei 1,0 uH zieht eine von fünf Platinen mehr als 100 mA, bei 1,3 uH eine von
   zwanzig. Außerhalb von 0,93 bis 1,39 uH zuerst die Werte ändern.
3. Das Feld einschalten und den Senderstrom messen: die Spannung an
   FB503 (0,15 Ohm) oder den Anstieg des 5-V-Stroms. Er muss unter 100 mA bleiben
   (erwartet 35 bis 45 mA bei einer Schleife von 1,20 bis 1,25 uH). Ein Telefon und eine
   Karte an den Leser halten und beobachten: Sie senken die Induktivität der Schleife, und der
   Strom muss auch mit ihnen unter 100 mA bleiben.
4. Die Spannung am Empfängereingang mit einem Tastkopf von 10 pF oder weniger
   an dem Pad von R507 messen, das nicht an C521 (VMID) liegt: erwartet 1,2 bis 1,9 Vss, und
   sie muss unter 4 Vss bleiben, auch mit einer Karte oder einem Telefon im Feld. Ist sie
   höher, ein größeres R506 bestücken (jetzt 3,9 k).
5. Die Antenne mit einem Netzwerkanalysator zwischen dem EMV-Filter und dem
   Anpassnetzwerk abgleichen (siehe Designnotizen). Die endgültigen Werte von C513 bis
   C519, R504, R505 und R506 in der Schaltungsbeschreibung festhalten. Die Ethernet-Version
   für sich abgleichen, mit eingestecktem Kabel: Stecker und Kabel liegen neben der Schleife.
6. Die Lesedistanz mit den verwendeten Karten und Tags messen (DESFire, NTAG 424),
   mit Display an, LEDs an und sendendem WLAN. Das auf der Werkbank und
   mit dem Leser auf einer Metallplatte tun: Die Platte senkt die Induktivität der Schleife um
   0,05 uH. Laut Simulation zu erwarten: Das Feld ist stark genug für jede
   Standardkarte bis zu 19 mm vor dem Gehäuse, 15 mm auf der Metallplatte;
   die meisten Karten lesen weiter. Ist die Reichweite kurz, obwohl die Schleife und der
   Strom wie erwartet sind, hat der Sender Spielraum: Er läuft mit etwa 40 mA
   von seinen 100 mA. Eine Anpassung näher an 40 Ohm oder 1,0 Ohm für R504 und R505
   erhöht den Schleifenstrom; danach den Strom, den Empfängereingang und das
   Feld an einer Karte auf dem Gehäuse (höchstens 7,5 A/m) erneut prüfen.

## Wärme

Der Leser ist ein geschlossenes Kunststoffgehäuse. Die Schätzung in den Designnotizen
(„Simulation“) setzt die Platine im typischen Betrieb je nach Versorgung 23 bis 31 K über den Raum
und ist bestenfalls auf 40 % genau.

1. Geschlossenes Gehäuse an der Wand, Firmware im Normalzustand (Display an, WLAN
   verbunden, NFC-Polling, LEDs auf ihrem Ruhepegel), jede Versorgung nacheinander.
   Nach einer Stunde den Temperatursensor des Chips lesen und die Vorderseite des
   Displays sowie durch die untere Aussparung die Luft im Inneren messen.
   Erwartet: Chip 30 bis 40 K über dem Raum, Displayvorderseite 15 bis 25 K.
2. Dasselbe mit allen LEDs auf ihrem hellsten Dauerpegel und der Hintergrundbeleuchtung
   auf voll. Die LED-Reihen sind dann die wärmste Stelle; ein Thermoelement neben
   D702 und D707. Die LED-Grenze der Firmware daraus festlegen; das Leistungsbudget
   hält sie für alle LEDs zusammen in jedem Fall unter 100 mA.
3. Am PoE: das Modul U102 nach einer Stunde (es steht in Luft, die so warm ist wie
   die Platine).
4. Die Luft neben dem WLAN-Modul, auf die sich dessen 85-°C-Angabe bezieht: ein feines
   Thermoelement in der Lücke zwischen der rechten Kante des Moduls und den Pull-ups,
   ohne Kupfer zu berühren, geschlossenes Gehäuse am PoE. Einmal mit dem Leser im normalen
   Zustand, einmal mit dem Modul, das 40 % der Zeit sendet (ein Upload in Stufen,
   die Grenze der Firmware). Erwartet in einem Raum von 40 °C: 63 bis 75 °C und 65 bis
   84 °C (Designnotizen, „Wi-Fi module“; mit der Raumtemperatur im
   Test skalieren). Lässt die zweite Messung bei 40 °C weniger als 5 K bis 85 °C, die
   Sendegrenze der Firmware senken.
5. Wird der Leser in Räumen über 30 °C eingesetzt, Schritt 1 in einem Wärmeschrank
   bei dieser Temperatur wiederholen. Das Display ist bis 70 °C spezifiziert.

## Ethernet und PoE (LAN-Version)

1. USB-versorgt: Die Verbindung kommt mit 100 Mbit/s Vollduplex hoch, DHCP funktioniert, Ping
   ohne Verlust. Einen zweiten Switch und ein gekreuztes Kabel ausprobieren. Die Firmware muss
   zuerst den PHY-Reset über den IO-Expander auf Low pulsen (siehe firmware-port.md);
   ohne diesen Puls kann der PHY mit falscher Adresse oder ohne Takt hochkommen.
2. PoE-versorgt, USB abgezogen: Die Platine startet.
3. Zwei Versorgungen gleichzeitig angeschlossen (PoE oder DC zusammen mit USB): keine Rückspeisung
   in den USB-Host (VBUS bei getrennter PC-Seite messen: Er muss
   0 V lesen) und keine Spannung an den offenen DC-Anschlüssen.
4. Temperatur des PoE-Moduls nach 30 Minuten bei voller Last.
5. PoE zehnmal abziehen und wieder einstecken: Die Platine startet jedes Mal sauber neu.
6. Bevor das Display aufgesetzt wird: messen, wie weit die Pins der Buchse aus der
   Displayseite der Platine ragen (erwartet 1,5 bis 1,9 mm). Alle, die
   beiden Schirmlaschen und die zwei Kunststoffzapfen mit einem Seitenschneider auf 1 mm kürzen; über
   dem Lot schneiden, nicht durch es hindurch. Polyimidband auf die Metallrückseite des LCD
   über der Ecke kleben, die auf ihnen liegen wird, 2 mm um die
   Kante des Moduls bei den beiden 48-V-Pins herumgeschlagen (die beiden dem Platinenrand nächsten in den oberen Reihen).
   Das Display sitzt 1,5 mm über der Platine. Nichts vom Display oder vom Gehäuse
   darf die Pins berühren.
7. Isolation, an einem Gerät, das Sie entbehren können: 1500 V effektiv (oder 2250 V DC) eine
   Minute lang zwischen den acht miteinander verbundenen Kontakten der Buchse und der Masse der Platine.
   Zuvor das Display entfernen.

## Stromquellen und die Grenzen der Firmware

1. DC und PoE vorhanden: P5 des Expanders liest nur High, solange ein DC-Netzteil
   angeschlossen ist, P7 nur, solange der PoE-Port Strom liefert.
2. USB als einzige Quelle (ein USB-2.0-Port, über ein USB-Messgerät): Mit
   eingeschalteten Grenzen der Firmware bleibt der Strom der Platine im Leerlauf unter 500 mA, während sie
   nach Karten fragt und bei WLAN-Verkehr (über 1 s gemittelt). DC einstecken:
   Die Grenzen werden aufgehoben; ziehen: Sie kommen innerhalb von 0,5 s zurück.
3. Ohne Firmware (MCU im Reset gehalten) an einem USB-2.0-Port zieht die Platine weit
   unter 500 mA: LEDs, Hintergrundbeleuchtung und Buzzer werden durch Widerstände ausgeschaltet gehalten.

## LEDs und Buzzer

1. Die MCU im Reset halten: Alle LEDs bleiben dunkel. Dann jede LED der Reihe nach einschalten:
   Reihenfolge und Farben. Nicht alle acht mit vollem Weiß betreiben: Das Datenblatt der LED
   erlaubt 70 % für Weiß.
2. Die LED-Grenze der Firmware: Das Leistungsbudget verlässt sich darauf, dass die LEDs zusammen
   unter 100 mA ziehen, alle Kanäle aller acht LEDs gezählt (Designnotizen,
   „Power“). Das hellste Muster einstellen, das die Firmware erlaubt, und den
   Anstieg des 5-V-Stroms gegenüber allen dunklen LEDs messen: unter 100 mA.
3. Piepton mit 2,7 kHz: in der Werkstatt laut genug, kein hörbares Rauschen und keine
   Störung auf dem Display während des Piepens. Der Schall verlässt den Buzzer
   an seiner Seite, die zum unteren Platinenrand zeigt. Den Buzzer-Pin nie
   auf High lassen: Die Spule und ihr Widerstand sind für einen Ton gemacht, nicht für Gleichstrom.
4. Die Firmware piept nur, während das NFC-Feld aus ist; das Leistungsbudget verlässt sich
   ebenfalls darauf. Einen Piepton anfordern, während der Leser nach Karten fragt: Der
   Senderstrom (NFC, Schritt 3) muss weg sein, solange der Buzzer ertönt.

## Manipulationssensoren

1. I2C0-Scan: Der Beschleunigungssensor antwortet bei 0x19, Register 0x0F liest 0x33.
2. Seine drei Achsen lesen, mit der Platine flach liegend, dann stehend: 1 g wandert auf
   die Achse, die nach unten zeigt.
3. Hall-Schalter: P6 des IO-Expanders lesen. Er ist auf der Werkbank 1. Den Magneten des Docks
   von der Bestückungsseite an U703 (markiert `DOCK`) heranführen: den
   Abstand notieren, bei dem P6 auf 0 geht, und den Abstand, bei dem er auf 1 zurückkehrt.
   Erwartet: an bei 19 mm oder mehr, spätestens bei 45 mm wieder aus.
4. Leser auf seinem Dock mit eingesetztem Magneten: P6 = 0. Abheben: P6 = 1.
5. Den Buzzer mit und ohne Magnet vor der Platine ertönen lassen: Der
   Ton darf sich nicht ändern. Den Ausgang des Beschleunigungssensors beobachten, während er ertönt.
6. Annäherungssensor (U704, markiert `PROX`): Er antwortet bei 0x60 und sein ID-
   Register 0x0C liest 0x0186. Die Annäherungsmessung einschalten (16 Bit,
   8T, zunächst 100 mA) und Register 0x08 lesen:
   - Platine auf der Werkbank, Bestückungsseite zum offenen Raum: nahe 0;
   - ein Blatt weißes Papier 14 mm davor: den Wert notieren, dann das
     Blatt 2 mm weiter weg bewegen und ihn erneut notieren;
   - Leser auf seinem Dock, Gehäuse geschlossen: den Wert für jede verwendete Dock-Farbe
     notieren. Den Leser abheben: Der Wert muss sofort auf nahe 0 fallen.
7. Mit dem Leser auf seinem Dock eine starke Lampe und, wenn möglich, Sonnenlicht
   von jeder Seite auf das Gehäuse richten. Der Annäherungswert muss dort bleiben, wo er war.
   Den Umgebungslichtwert (Register 0x09) im geschlossenen Gehäuse mit
   ausgeschalteten Status-LEDs und mit vollem Weiß sowie mit dem Leser abseits des Docks notieren.
8. Die beiden Schwellwerte (Register 0x06 und 0x07) um den Wert auf dem
   Dock setzen, Interrupt für beide Richtungen: TP815 (`INT` neben `PROX`) ist auf dem Dock High
   und geht auf Low, wenn der Leser abgehoben wird. Er bleibt Low, bis
   das Flag-Register 0x0B gelesen wird.

## Vor dem Prüflabor

1. Dauertest: 24 Stunden im Gehäuse mit normalem Nutzungsmuster.
2. ESD-Vortest vor dem Labor, an einem geschlossenen Leser auf seinem Dock, im Betrieb mit
   aktiven Display, WLAN und NFC (ESD-Pistole, Aufbau nach IEC 61000-4-2): 8 kV Luftentladung
   rundum auf die Glaskanten, jedes LED-Fenster, die Buzzer-Löcher, die Fugen
   und die Kabelaussparungen; 4 kV Kontaktentladung auf die zwei Verschlussschrauben. Zehn Entladungen
   je Polarität und Punkt. Der Leser darf zurücksetzen, muss sich aber
   selbst erholen, danach mit funktionierendem Touch, WLAN und NFC (Kriterium B). Das
   sind die Punkte, die der Entwurf aus Datenblättern nicht zeigen konnte (Designnotizen,
   „ESD per port“ und „Accepted deviations“).
3. Abgestrahlte Störaussendung vorab scannen, bei laufendem Display und aktivem Ethernet, wenn eine
   Nahfeldsonde oder eine Vorab-Konformitätskammer verfügbar ist.
4. WLAN-Sendeleistung: die EIRP des geschlossenen Lesers auf beiden
   Bändern messen, im Testmodus der Firmware bei höchster Leistung und auf den Kanälen,
   die das Labor verwenden wird (niedrigster, mittlerer und höchster jedes Bandes), und die
   Obergrenze der Firmware daraus festlegen: 20 dBm EIRP bei 2,4 GHz und von 5250 bis
   5725 MHz, 23 dBm von 5150 bis 5250 MHz ([compliance.md](hardware/touch-p4/compliance.md),
   „5 GHz Wi-Fi“).
