# Designnotizen
<!-- llms-description: Warum die Touch-P4-Platine so entworfen ist: Bauteile, Stromversorgung, Layout, Antennen, Simulationen, das Design-Review und die akzeptierten Abweichungen. -->

Warum die Platine so aussieht, wie sie aussieht, und was noch eine Annahme ist.

## Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| MCU | ESP32-P4NRW32X-Chip + ESP32-C5-MINI-1 | Gewählt wegen der Display-Leistung. Der P4 hat kein Funkmodul, daher läuft WLAN (2,4 und 5 GHz) über SDIO auf einem zertifizierten C5-Modul; siehe „WLAN-Modul: ESP32-C5-MINI-1“. |
| Display | handelsübliches 4,0-Zoll-RGB-Panel mit 480x480 (ST7701S, GT911) | Größe und Auflösung der heutigen Leser; die MIPI-Versionen dieser Größe kosten ein Mehrfaches. |
| NFC | PN532 auf der Platine | Der NFC-Stack der Firmware bleibt unverändert. |
| NFC-Position | eigener Bereich unterhalb des Displays | Die Metallrückseite des LCD schirmt 13,56 MHz ab; eine Antenne hinter dem Bildschirm funktioniert nicht. |
| LAN/PoE | gleiche Platine, bei der WLAN-Version nicht bestückt | Ein Entwurf, der zu pflegen und zu zertifizieren ist. |
| PoE | fertiges, isoliertes Modul | Kein Transformator-Entwurf; das Footprint nimmt SDAPO DP9900M-5V oder Silvertel Ag9905M auf. |
| Versorgung | DC 12 bis 24 V, PoE oder USB-C, jeweils über einen Schalter, der Rückstrom sperrt (eFuse für USB, ideale Dioden für DC und PoE), auf eine 5-V-Schiene | Jede Kombination darf angeschlossen sein; keine Quelle speist eine andere. Die Schalter verlieren fast nichts, daher folgt die 5-V-Schiene ihrer Quelle. |
| DC-Anschlüsse | Hohlsteckerbuchse (5,5 / 2,1 mm) und WAGO-250-Drucktasten-Klemme parallel | Steckernetzteile und blanke Drähte einer bestehenden Installation funktionieren beide. Das Klemmen-Footprint nimmt auch die WAGO-2601-Hebelklemme auf, die das 13-Fache kostet. |
| Ethernet-Buchse | hinter der unteren rechten Ecke des Displays, 51 mm über dem unteren Platinenrand | Ein Stecker mit Knickschutz und der Bogen des Kabels in die Wand brauchen 49 mm unterhalb der Buchse, innerhalb des Gehäuses. Der Preis: Die Pins der Buchse ragen auf der Displayseite hinter dem Display heraus. Das Display sitzt 1,5 bis 2 mm von der Platine entfernt und die Pins werden gekürzt (siehe „Displaymontage und Flexkabel“). Unterhalb des Displays bräuchte die Buchse ein um 19 mm längeres Gehäuse. |
| USB-C | Service-Anschluss am Platinenrand neben der MCU | Nur zum Flashen und Debuggen genutzt, nie für Nutzer vorgesehen. |
| Manipulationserkennung | ein Beschleunigungssensor, ein Infrarot-Näherungssensor, der auf die Platte des Docks blickt, und ein Hall-Schalter, der einem Magneten im Dock gegenübersteht | Der Beschleunigungssensor bemerkt Stöße, Kippen und Abreißen. Der Näherungssensor meldet, dass der Leser sein Dock verlassen hat; sein Lichtweg liegt im geschlossenen Gehäuse und ist unerreichbar. Der Hall-Schalter meldet dasselbe auf eine zweite, einfachere Weise, lässt sich aber mit einem ans Gehäuse gehaltenen Magneten täuschen. Alle drei werden über I2C gelesen, weil die vier freien Pins der MCU an der Pad-Reihe durch Kondensatoren blockiert sind. |
| WLAN-Antenne | die eigene Dualband-Platinenantenne des Moduls, über einem Ausschnitt im oberen Rand | Am 25. November 2026 mit dem C5 entschieden (vom Nutzer). Die externen Antennen des C6-MINI-1U und ihr Schacht entfallen. Siehe „WLAN-Antenne“ und die zugehörige akzeptierte Abweichung. |
| Bestückung | alle Bauteile auf einer Seite | Das Display wird auf die andere Seite geklebt; günstigere Bestückung. |
| Lagen | sechs: Signale auf beiden äußeren Lagen und einer inneren Lage, jeweils neben einer eigenen Massefläche | Zwei Signallagen reichen um die MCU nicht aus. Bei vier Lagen teilte sich die dritte ihre Lage mit der 3,3-V-Kupferfläche und zerschnitt sie, sodass die schnellen Busse keine ununterbrochene Massefläche für den Rückstrom hatten (siehe [Review anhand der Layout-Regeln](#review-gegen-layout-regeln)). |

Alternativen, die betrachtet wurden (November 2026): ESP32-S31-WROOM-1 (ein Modul
mit Wi-Fi 6 und Ethernet-MAC, aber noch nicht lieferbar und in ESP-IDF nur mit
Preview-Unterstützung), Waveshare-ESP32-P4-Modul (keine Funkzertifikate),
ESP32-S3 (kein Geschwindigkeitsgewinn).

### WLAN-Modul: ESP32-C5-MINI-1

Vom Nutzer am 25. November 2026 entschieden: der ESP32-C5 statt des C6, für
Wi-Fi 6 auf 2,4 und 5 GHz, mit der eigenen Platinenantenne des Moduls. Die Regel
des Nutzers: höchstens etwa 2 USD mehr pro Platine bei 100 Stück als das C6-Modul
mit seiner Antenne, und lieferbar. Die erste Wahl war das größere
ESP32-C5-WROOM-1; es wurde am selben Tag verworfen, weil keine Variante davon
lieferbar war (unten), und der Nutzer wählte das ESP32-C5-MINI-1-N4-V1.2.

| | ESP32-C5-MINI-1-N4-V1.2 (bestückt) | ESP32-C5-WROOM-1 (erste Wahl) | ESP32-C6-MINI-1U-H4 (vorher) |
|---|---|---|---|
| JLCPCB / LCSC | C54951860: 614 auf Lager, 3,36 USD bei 100 (LCSC 3,38) | jede Variante (-N4, -N4-V1.2, -N8R8, -N8R8-V1.2, -N16R4, -N16R8, -N16R8-V1.2) 0 bei JLCPCB und LCSC; -N4 3,65 USD bei 200 | C20627095: 3248 auf Lager, 3,20 USD bei 100, plus eine Antenne und ihr Kabel |
| Größe | 15,4 x 21,3 x 2,4 mm | 18,0 x 27,5 x 3,3 mm | 13,2 x 12,5 mm (16,6 mit Antenne) |
| Antenne | Platinenantenne, 2,4 und 5 GHz | Platinenantenne | keine: Steckverbinder |
| EU-Baumusterprüfbescheinigung | 44024-05-2026-260268, Eurofins (benannte Stelle 0980), 27. Mai 2026, Modell ESP32-C5-MINI-1 mit seiner internen Antenne; EN 300 328 V2.2.2, EN 301 893 V2.2.1, EN 301 489-1 V2.2.3, EN 301 489-17 V3.3.1, EN 55032, EN 62368-1, EN 50665, EN 62311 | SN25C0185, Sporton (2907), 2. Juli 2025; EN 301 893 V2.1.1, EN 300 440 V2.2.1 | SN24C0053, Sporton (2907) |
| FCC | 2AC7Z-ESPC5MINI1 (Part 15E erteilt am 28. Mai 2026, Single Modular) | 2AC7Z-ESPC5WROOM1 | 2AC7Z-ESPC6MINIU |
| Zulässiger Bereich | -40 bis 85 °C Umgebung, „the environment immediately outside the Espressif module“ (Datenblatt v1.4, Tabelle 1-1 Anmerkung 3, Tabelle 6-2) | dasselbe | -40 bis 105 °C |

Bestand und Preise wurden am 25. November 2026 aus der Teilebibliothek von
JLCPCB und von den Produktseiten von LCSC gelesen. Das Modul kostet 0,16 USD
mehr als das C6-Modul; die Antenne, die nie bepreist wurde (die zertifizierte
musste bei Espressif oder Deman angefragt werden), und ihr Kabel entfallen. Der
eigene 3,3-V-Wandler des Funkmoduls (unten) fügt etwa 0,22 USD an Teilen hinzu,
die schon auf der Platine sind, also keine neuen Zeilen in der Stückliste.
Insgesamt etwa 0,4 USD mehr auf der bestückten Platine, abzüglich der Antenne:
innerhalb der 2 USD des Nutzers.

Warum diese Variante:

- 4 MB Flash und kein PSRAM: Die eigene Partitionstabelle von esp-hosted für
  einen Co-Prozessor mit 4 MB enthält zwei Images zu je 1,75 MB für Updates über
  SDIO (`partitions_eh_cp_ota_4m.csv`, esp-hosted-mcu 3.1.0); der Co-Prozessor
  braucht kein PSRAM. Das -N8R2 (8 MB, 2 MB PSRAM) gibt es bei JLCPCB nicht.
- Der Chip darin ist der ESP32-C5HF4, Revision v1.0 oder v1.2 (Chip-Datenblatt
  v1.5, Tabelle 1-1). Der SDIO-Slave funktioniert ab Revision v1.0, „not supported
  by chip revision v0.0 and v0.1“ (Moduldatenblatt v1.4, 5.2.1.13).

esp-hosted: esp-hosted-mcu 3.1.0 (ESP-IDF 5.5 oder neuer) führt den ESP32-C5
als SDIO-Co-Prozessor und den ESP32-P4 als dessen Host auf, an den festen Pins
des C5: CLK 9, CMD 10, D0 8, D1 7, D2 14, D3 13, Reset auf dessen EN, mit „external
51 kOhm pull-ups on CMD, DAT0-DAT3“ ([Erste Schritte](https://github.com/espressif/esp-hosted-mcu/blob/v3.1.0/docs/getting-started-mcu.md#1-sdio),
Anschlüsse des Co-Prozessors). Das sind die Modulpins 21, 22, 20, 19, 24 und 23,
alle am unteren Rand des Moduls, auf der Seite, die zur MCU zeigt.

Strapping-Pins (Moduldatenblatt v1.4, Kapitel 4; HDG 1.3.9):

| Pin | Strap | Standard | Hier |
|---|---|---|---|
| GPIO28 (Pin 4) | Boot-Modus: 1 = Boot aus dem Flash; 0 mit GPIO27 = 1 = Download über UART0 | interner Pull-up | 10-k-Pull-up, wie das HDG empfiehlt („place a pull-up resistor at the GPIO28 pin“; kein Kondensator bestückt). Der Boot-Testpunkt: beim ersten Flashen beim Reset auf Masse gehalten |
| GPIO27 (Pin 35) | Boot-Modus, ROM-Meldungen auf UART0 | interner Pull-up | offen: nichts darf ihn nach unten ziehen |
| GPIO26 (Pin 34) | Boot-Modus (nur bei GPIO27 und GPIO28 low) | schwebend | offen |
| GPIO25 (Pin 33), MTDI = GPIO3 (Pin 7) | SDIO-Abtast- und Treiberflanken beim Reset | schwebend | offen, wie beim C6. Der Slave-Treiber setzt die Flanken in seiner Konfiguration (ESP-IDF `sdio_slave_config_t.timing`); `EH_TRANSPORT_CP_SDIO_TIMING` von esp-hosted sendet und tastet standardmäßig mit der steigenden Flanke ab. Bei diesem Standard bleiben |
| GPIO7 (Pin 19) = SDIO D1 | JTAG-Quelle, erst wenn das eFuse JTAG_SEL_ENABLE gebrannt ist | kein Pull (der Pin braucht einen definierten Pegel) | der 51-k-SDIO-Pull-up hält ihn auf high. Firmware-Regel: JTAG_SEL_ENABLE nie brennen |
| MTMS = GPIO2 (Pin 6) | als Strapping-Pin aufgeführt, schwebend | schwebend | offen |

Die Straps werden in den 3 ms gelesen, nachdem EN ansteigt (tH). Der P4 treibt
keinen dieser Pins zu dieser Zeit: Beim Einschalten wird er 120 bis 280 ms nach
der 3,3-V-Schiene im Reset gehalten, und später setzt esp-hosted das Modul
zurück, bevor es den SDIO-Host startet, dessen Datenleitungen außerhalb einer
Übertragung Eingänge sind.

SDIO D2 und D3 sind USB D+ und D- des C5 (GPIO14, GPIO13). Mit 4-Bit-SDIO darauf
lässt sich sein USB Serial/JTAG nicht nutzen, also sind UART0 (TX0 Pin 39 = GPIO11,
das im Modul 499 Ohm in Reihe hat, RX0 Pin 40 = GPIO12), GPIO28, EN und Masse auf
Testpunkten der einzige kabelgebundene Weg, das Modul zu flashen und
wiederherzustellen. Sie bekommen Netzbezeichnungen im Bestückungsdruck; aus den
C6_*-Netzen werden C5_*.

Stromversorgung. Das C5-MINI-1 zieht höchstens 426 mA (802.11a bei 16,5 dBm,
100 % Einschaltdauer; 338 mA bei 2,4 GHz; Datenblatt v1.4, Tabellen 6-4 und 6-5),
und Espressif verlangt von der Versorgung „no less than 600 mA“ (HDG 1.3.2;
Datenblatt Tabelle 6-2: IVDD 0,6 A). Mit 0,6 A statt der 0,382 A des C6 würde der
gemeinsame 3,3-V-Wandler bei den Auslegungswerten 1,49 A tragen, 25,6 % unter
seinen 2 A, unter dem Ziel von 30 %. Das Modul trägt außerdem eigene Kondensatoren
an seinem 3,3-V-Pin (Datenblatt Abbildung 8-1): drei mit 10 uF (C6, C21, C29),
drei mit 1 uF (C19, C20, C26), vier mit 100 nF und einen mit 10 nF, bei ihren
Werten 33,4 uF, alles an der Schiene des Wandlers, der das Modul speist. Die
3,3-V-Schiene zählt bereits 48,9 uF gegen die 52,8 uF, die TIs Tabelle dem
TLV62569 erlaubt (siehe „3,3-V-Wandler“). Also bekommt das Modul einen eigenen
Wandler: einen zweiten TLV62569 aus der 5-V-Schiene, mit derselben Spule,
demselben Teiler und demselben Feed-forward-Kondensator wie U103, und
Espressifs 22 uF und 100 nF am Pin des Moduls (Datenblatt Abbildung 9-1). An
dieser Schiene: 22 uF (13,7 uF bei 3,3 V) + 0,1 uF + die 33,4 uF des Moduls =
47,2 uF, innerhalb von 52,8 uF, ohne die Kondensatoren des Moduls
abzuwerten. U103 trägt dann bei den Auslegungswerten 0,89 A (55 % Reserve) und
der Wandler des Funkmoduls 0,6 A (70 %).

Wärme. Was die 85-°C-Angabe begrenzt, ist die Luft unmittelbar außerhalb des
Moduls, nicht sein Inneres; der alte Wert von 79 °C (40 °C Raum + die Platine
unter dem C6 + 15 K/W x 0,30 W, das Innere des Moduls) lässt sich ihr also nicht
entgegenhalten. Das Wärmemodell (`sim/thermal.py`) hat keinen Luftknoten. Es gibt
zwei Grenzen für diese Luft: unten die Luft im Hohlraum zwischen Platine und
Dock-Platte, genommen als Mittel aus Platine und Innenfläche der Dock-Platte
(diese Fläche läuft mit dem 0,47-Fachen des Platinenanstiegs in der Kette der
Flächen des Modells); oben die Platine neben dem Modul, von der das Modul und
seine Nachbarn die Luft daneben erwärmen. Die Verluste des C5: 0,40 W im
typischen Betrieb (verbunden, Empfang auf 5 GHz, 110 mA, mit wenig Senden),
0,88 W bei halber Sendezeit auf 5 GHz, 1,36 W bei ständigem Senden (1,41 W
hinein, 45 mW abgestrahlt); dazwischen im Verhältnis zum Sendeanteil. Auf der
fertig verlegten Platine (25. November 2026) liegt in einem Raum mit 40 °C die
Luft außerhalb des Moduls zwischen:

| Rest der Platine | Modul sendet | USB | DC, 12 V | PoE |
|---|---|---|---|---|
| typischer Betrieb | selten (0,40 W) | 57 bis 67 °C | 59 bis 70 °C | 63 bis 75 °C |
| typischer Betrieb | 40 % der Zeit (0,78 W) | 59 bis 76 °C | 62 bis 79 °C | 65 bis 84 °C |
| typischer Betrieb | 50 % (0,88 W) | 60 bis 78 °C | 62 bis 81 °C | 66 bis 86 °C |
| typischer Betrieb | ständig (1,36 W) | 63 bis 89 °C | 65 bis 92 °C | 69 bis 97 °C |
| alles lange eingeschaltet | selten | 66 bis 79 °C | 72 bis 85 °C | 76 bis 91 °C |
| alles lange eingeschaltet | 40 % | 69 bis 87 °C | 74 bis 93 °C | 78 bis 100 °C |

Im typischen Betrieb bleibt die Luft am Modul an der oberen Grenze unter 85 °C,
solange das Modul im Mittel nicht mehr als 40 % der Zeit sendet (PoE: 84 °C);
die untere Grenze bleibt auch bei ständigem Senden unter 85 °C. Daher begrenzt
die Firmware den Sendeanteil des Moduls auf 40 %, gemittelt über eine Minute
([firmware-port.md](hardware/touch-p4/firmware-port.md)). Der eigene Datenverkehr
des Lesers (Kartenprüfungen, die Benutzeroberfläche, Updates, die Downloads sind)
bleibt weit darunter; die Regel greift nur bei langen Uploads, etwa von Logs. Bei
allem lange eingeschaltet erreicht die obere Grenze an DC 85 °C und überschreitet
sie an PoE (91 °C) bei stummem Funk: Die Platine selbst liegt dann 43 bis 49 K
über dem Raum. Dieser Zustand liegt ohnehin jenseits dessen, was das Gehäuse
abführen kann (die LED-Reihen 75 bis 82 K über dem Raum, siehe „Simulation“),
und wird durch die Temperaturregel der Firmware beendet, die Hintergrundbeleuchtung
und LEDs dimmt und dann auch das Funkmodul zurückhält. Die Schätzung hat +-40 %;
der Inbetriebnahmeplan misst die Luft neben dem Modul im geschlossenen Gehäuse.
Das Innere des Moduls zum Vergleich: 81 °C im typischen Betrieb an PoE (15 K/W x
0,40 W über der Platine darunter).

Platzierung. Das MINI-1 ist 2,2 mm breiter und 4,7 mm länger als das Footprint
des C6-MINI-1U. Es sitzt am alten Platz oben links, seine Antenne über einem
Ausschnitt im oberen Rand, der nun 28,9 mm breit und 6,0 mm tief ist. Espressifs
Leitfaden (HDG 1.4.7, Abbildungen 22 und 23) empfiehlt eine Platinenecke mit dem
Massepunkt der Antenne am Platinenrand, die Antenne jenseits des Rands oder über
einem Ausschnitt auf beiden Seiten und darunter, und 15 mm freien Raum um sie
innerhalb des Gehäuses. Auf dieser Platine ist die Ecke, die zu dieser
Ausrichtung passt, die obere rechte, wo USB-C, sein eFuse-Pfad und ein Befestigungsloch
sitzen; das Gehäuse lässt 1,5 bis 2,3 mm zu seinen Wänden. Das Vollwellenmodell
vergleicht die beiden Plätze bei 2,4 und 5 GHz („WLAN-Antenne“); was zu kurz
bleibt, steht unter „Akzeptierte Abweichungen“.

## Mechanik

Koordinaten: KiCad-Draufsicht auf die Bestückungsseite, Ursprung oben links an
der Platine, x nach rechts, y nach unten, Millimeter. Der Nutzer sieht auf die
andere Seite.

| Element | Position |
|---|---|
| Platine | 86 x 143,5, Eckenradius 2, beide unteren Ecken ausgeschnitten |
| Streifen über dem Display | y 0 bis 7: die Antenne des WLAN-Moduls, zwei Befestigungslöcher |
| WLAN-Modul | x 20,1 bis 35,5, y 0,3 bis 21,6 (Pad-Mitte 27,8; 13,9), Antenne oben; sein Wandler in der Spalte links davon |
| Ausschnitt im oberen Rand unter der WLAN-Antenne | x 8,6 bis 37,5, y 0 bis 6,0; kein Kupfer auf irgendeiner Lage für x unter 50,5, y unter 6,3 |
| Display-Deckglas (84,3 x 84,3) | x 0,85 bis 85,15, y 7,0 bis 91,3 |
| LCD-Modul (Metallrückseite) | x 5,6 bis 80,4, y 12,8 bis 89,4 |
| Flexkabel-Schlitz | x 11,5 bis 62,0, y 89,5 bis 92,5 |
| Ethernet-Buchse | x 68,8 bis 84,9, y 71,2 bis 92,8, öffnet nach unten in ihren Ausschnitt. Pin-Reihen bei y 73,0 und 75,55, hinter dem Display |
| Ausschnitt für den Ethernet-Stecker | x über 69,5, y über 92,5 (16,5 x 51 mm) |
| Ausschnitt für den DC-Stecker | x unter 12, y über 107,5 |
| NFC-Schleife | 35 x 37, Mitte (44,5; 117), auf der Displayseite |
| LEDs | x 29,5; 39,5; 49,5; 59,5 bei y 95,6 und y 139,0, jeweils in einem 3,4 x 3,0 mm großen Fenster mit freigestellten Ecken |
| Befestigungslöcher (3,2 mm) | (4; 3,5), (82; 3,5), (17,9; 139,4), (66,3; 117) |
| DC-Buchse | x 1,2 bis 10,2, y 93,6 bis 108, öffnet nach unten in den DC-Ausschnitt |
| DC-Klemme | Mitte (16,7; 100,2), neben der Buchse, die Drähte treten von unten im Winkel von 40 Grad ein |
| USB-C | rechter Platinenrand bei y 13,5 bis 22,5, öffnet seitlich |

### Displaymontage und Flexkabel

Die verwendete Panel-Zeichnung ist Hongxiangrui HXR040WQI-H401-R4018 (dieselbe
Pinbelegung wie beim Waveshare ESP32-S3-Touch-LCD-4). Punkte, die das Layout bestimmen:

- Das Flexkabel verlässt den unteren Rand des LCD-Moduls, 1,9 mm über dem Rand
  des Deckglases, und ist, ab dem Rand des Deckglases gemessen, 25 mm lang. Seine
  Kontakte zeigen vom Glas weg. Das Touch-Panel hat einen eigenen Schwanz, der
  an einer stahlversteiften Verbindung auf den Hauptschwanz gelötet ist.
- Das Flexkabel geht durch den Schlitz und faltet sich auf die Bestückungsseite.
  Die steifen Teile des Flexkabels müssen nach dieser Wendung flach hinter der
  Platine liegen. Vom Rand des LCD-Moduls gemessen beginnen sie bei 4,8 mm
  (Bauteile am Hauptschwanz), 5,3 mm (die Lötverbindung des Touch-Schwanzes)
  und 6,4 mm (der Touch-Controller am Touch-Schwanz, der 2,2 mm weiter vorn
  beginnt, an der Vorderseite des LCD). Das begrenzt den Abstand zwischen der
  Platine und der Metallrückseite des LCD auf **2,0 mm**; bei 1,5 mm bleiben
  0,5 mm Reserve. Diese Werte sind aus der Zeichnung skaliert, +-0,4 mm, und
  gelten für dessen LCD-Modul, das 2,06 mm dick ist (3,14 mm mit der
  Klebeschicht, dem Touch-Sensor und dem 0,55 mm dicken Deckglas). Die
  Produktseite des Displays zeigt dieselbe Zeichnung.
- Der Abstand darf auch nicht klein sein, wegen der Ethernet-Buchse. Ihre Pins
  treten auf der Displayseite der Platine hinter der unteren rechten Ecke des
  LCD-Moduls heraus, mindestens 1,45 mm lang (das Datenblatt gibt eine
  Mindest-Pinlänge von 3,05 mm und kein Maximum an). Hinter der Metallrückseite
  liegen die Pins 1 bis 8, 11 und 12 (Signale, 3,3 V), eine Schirmlasche und ein
  Kunststoffzapfen. Die beiden 48-V-Pins 9 und 10 treten 0,8 und 2,1 mm neben
  der Metallrückseite heraus (Pinmitte bis Modulrand).
- Also: **die Pins, Laschen und Zapfen der Buchse nach dem Löten auf 1 mm kürzen**
  auf der Displayseite, **Polyimidband** auf die Metallrückseite des LCD über
  diese Ecke kleben (x 66 bis 80,4, y 69 bis 89,4), 2 mm um die Seitenkante des
  Moduls neben Pin 9 herumgeführt, und das Display **1,5 mm** vor der Platine
  montieren. Ungekürzte Pins berühren die Metallrückseite bei 1,5 mm und können
  sie bei 2 mm berühren.
- Nach der Faltung zeigen die Kontakte zur Platine, daher ist J601 ein
  **Bottom-Contact**-Steckverbinder (Hirose FH12-40S-0.5SH) mit seiner Öffnung
  zum Schlitz.
- Von der Bestückungsseite gesehen liegt Panel-Pin 1 rechts. Pin 1 des
  Steckverbinders liegt links, also **Steckverbinder-Pin k = Panel-Pin 41 - k**.
  Schaltplan und Platine berücksichtigen das bereits.
- Das gefaltete Flexkabel deckt den Bereich x 11,5 bis 62, y 76 bis 89,5 und den
  Schwanz bis zum Steckverbinder ab (`geometry.FLEX_KEEPOUT`). Dort stehen nur
  Bauteile bis 0,9 mm Höhe: Passive der Bauformen 0402, 0603 und 1206,
  Widerstandsarrays und Testpads. Der Build bricht ab, wenn der Körper eines
  anderen Bauteils in den Bereich ragt (`placement.check_flex_area`). Der
  Eingangskondensator C120 (6,3 mm, 7,7 mm hoch) und die TVS D107 standen bis zum
  25. November 2026 darin; C120 steht nun oberhalb davon, zwischen dem
  DC-Wandler und dem Näherungssensor, D107 links vom Ende des Schlitzes.

Nicht mit einem echten Panel geprüft: die genaue Faltlänge. Mit dem Display 1,5 mm
von der Platine entfernt sitzt der Steckverbinder etwa 1,5 mm näher am Schlitz
als das Ende des Flexkabels (0,7 mm beim kürzeren Flexkabel einer zweiten
Zeichnung), sodass sich das Flexkabel leicht wölbt, statt gespannt zu sein.
Vor der Bestellung der Platinen mit einem Musterpanel prüfen. Andere
Panel-Lieferanten mit derselben 40-poligen Pinbelegung können sich in der
Flexkabellänge unterscheiden.

Wo es das Panel gibt. Die Zeichnung stammt aus dem Datenblatt, das Makerfabs für
sein 4,0-Zoll-Display veröffentlicht (Hersteller: Shenzhen Hongxiangrui). Die
Modellnummer darin ist die des Herstellers, und kein Shop führt das Panel unter
ihr. Es ist ein gängiger Paneltyp: 84,3 x 84,3 mm Umriss, 40-poliges Flexkabel
mit 0,5 mm Raster, die Pins 16 bis 33 sind die 18 Datenleitungen DB0 bis DB17.
Die Platine nutzt 16 davon; Pin 16 (Blau-LSB) und Pin 28 (Rot-LSB) liegen auf
Masse. Im November 2026 geprüfte Shop-Angebote:

| Angebot | Was passt | Nicht bestätigt |
|---|---|---|
| Elecrow DIS16804D, „4inch Square IPS Display 480*480 Capacitive SPI+RGB, ST7701S“ | Umriss, Treiber, und die gedruckte 40-Pin-Tabelle ist identisch mit der des Datenblatts. Kommt mit einer HDMI-Treiberplatine; das Panel lässt sich davon abstecken | Der Touch-Controller wird nicht genannt |
| Waveshare / Luckfox LF40-480480-ARK (SKU 27738) | Umriss (84,2 x 84,2 mm), GT911-Touch | Pin-Tabelle und Treiber sind nicht veröffentlicht; vor dem Kauf größerer Mengen nachfragen |
| Das Panel auf dem Waveshare ESP32-S3-Touch-LCD-4 (die aktuellen Leser) | Pinbelegung (dem Schaltplan dieser Platine entnommen) | Flexkabellänge gegenüber diesem Layout |
| AliExpress-Artikel 1005005675144653, Shop SUNMAXIC, „4.0 inch TFT LCD Square Screen 480*480 ST7701S 40Pin“, Variante „Capacitive touch“ | Zeigt dieselbe mechanische Zeichnung wie das Datenblatt (84,3 x 84,3 mm, Flexkabel 25 mm ab dem Rand des Deckglases, 40 Pins mit 0,5 mm) und die identische Pin-Tabelle | Der Touch-Controller wird nicht genannt. Die Variante „No touch“ hat keine Touch-Schicht |

Das Flexkabel des Panels messen, das in Stückzahlen gekauft werden soll, nicht
irgendeines von diesen.

LCSC hatte im November 2026 kein Panel dieses Typs. Sein 4,0-Zoll-Panel mit
480 x 480 (C17496207, Focus E40RC-FS1000-C) hat denselben Treiber und
Touch-Controller, aber eine MIPI-DSI-Schnittstelle an einem 20-poligen
Flexkabel und einen Umriss von 77 x 80 mm, passt also nicht auf diese Platine.
Der ESP32-P4 hat einen MIPI-DSI-Port; ein solches Panel zu verwenden wäre ein
neuer Display-Abschnitt, kein Teiletausch.

### Gehäusehinweise

- WLAN-Antenne: am Modul, über dem Ausschnitt im oberen Rand (x 8,6 bis 37,5).
  Metall vom Streifen über dem Display für x unter 50,5 mm fernhalten: keine
  Schrauben, keine Frontplatte aus Metall dort, es sei denn, sie hat ein Fenster
  über diesem Streifen (siehe „WLAN-Antenne“, was eine Metallfront kostet).
- Beide unteren Ecken der Platine sind ausgeschnitten. Die Ethernet-Buchse öffnet
  nach unten in den rechten Ausschnitt (16,5 x 51 mm), die DC-Buchse in den in
  der anderen Ecke (12 x 36 mm). Stecker und Kabel bleiben dort innerhalb des
  Platinenumrisses und können nach unten oder zurück in die Wand gehen.
- Platz für den Ethernet-Stecker, mit dem Gehäuse in `case/`. Es zählt der steife
  Teil des Steckers unterhalb der Buchse: Körper und Knickschutz, abzüglich der
  13,5 mm, die in der Buchse stecken. Gängige gespritzte Patchkabel messen dort 24
  bis 31 mm (37 bis 44 mm insgesamt).

  | Kabel | Biegeradius (4 x Durchmesser) | Der steife Teil darf unterhalb der Buchse enden: Kabel in die Wand hinter dem Leser | Gerade nach unten durch die untere Aussparung |
  |---|---|---|---|
  | Patchkabel 5,5 mm | 22 mm | 31 mm | 49 mm |
  | Cat-6-Patchkabel 6,3 mm | 25 mm | 29 mm | 49 mm |
  | Schlankes Patchkabel 3,8 mm (28 AWG) | 15 mm | 37 mm | 49 mm |

  Ein normales Patchkabel passt also in beiden Fällen, mit wenig Spiel auf dem
  Weg in die Wand; ein schlankes lässt den meisten Platz und trägt den PoE-Strom
  dieses Lesers (unter 0,3 A) ohne Probleme. Stecker für die Feldkonfektionierung
  sind länger und sitzen auf 7 bis 8 mm dickem Installationskabel, das einen
  Bogen von 30 mm will: Sie passen nur zum Ausgang nach unten. Installationskabel
  in einer Dose enden lassen und von dort ein kurzes Patchkabel verwenden.
- Die Pins der Ethernet-Buchse ragen auf der Displayseite der Platine bei x 68
  bis 86, y 71 bis 88 heraus: hinter der Ecke des LCD-Moduls und unter dem Rand
  des Deckglases. Das Gehäuse darf nicht auf sie drücken, und kein Metall darf
  sie berühren; die Pins 9 und 10 (x 81,2 und 82,5, die beiden am nächsten am
  Platinenrand in den oberen Reihen) führen 48 V. Keine Wand eines Displayrahmens
  passt zwischen Pin 9 und den Rand des LCD-Moduls: Der Pin ist 0,5 mm davon
  entfernt und sein Lötpad 0,1 mm. Das Band auf dem LCD ist dort die Isolierung.
- Tiefe hinter der Platine: Das Gehäuse in `case/` lässt 13,9 mm, zu wenig für
  die Schirmfedern der Ethernet-Buchse (siehe „Gehäusepassung gegenüber den
  3D-Modellen“).
- Tiefe zwischen Platine und Front: Die Displayseite der Platine liegt 4,74 mm
  hinter der Front des Gehäuses (1,5 mm Abstand, 3,14 mm Display, 0,1 mm
  Vertiefung). Das Gehäuse in `case/` ist dafür gezeichnet.
- Der DC-Ausschnitt ist für einen geraden 5,5-mm-Hohlstecker bis 11 mm Dicke
  bemessen. Mit dem Stecker des Netzteils prüfen, das ausgeliefert werden soll.
- Die DC-Klemme (WAGO 250-202, Drucktaste) sitzt neben der DC-Buchse. Ihre Drähte
  treten von der Seite des unteren Rands im Winkel von 40 Grad zur Platine ein:
  aus der Wand oder nach oben durch den DC-Ausschnitt. `+` und `-` sind an der
  Klemme aufgedruckt. Sie hat einen Pin pro Pol und nutzt zwei diagonale Löcher
  des Footprints (+ oben links, - unten rechts). Dieselben vier Löcher nehmen die
  WAGO-2601-3102-Hebelklemme (C20252913) auf, deren Drähte im rechten Winkel zur
  Platine eintreten.
- Neben der DC-Buchse gibt es keine Schraube. Die Platine dort im Gehäuse
  abstützen, damit das Einstecken des Steckers sie nicht verbiegt.
- USB-C liegt am Seitenrand hinter dem Display. Es braucht keine Öffnung im
  Gehäuse, wenn das Flashen vor dem Zusammenbau erfolgt.
- Auf den äußeren Lagen verlaufen innerhalb von 3,3 mm um die Mitte eines
  Befestigungslochs keine Leiterbahnen, sodass ein Schraubenkopf oder Abstandshalter
  bis 6,6 mm Durchmesser sicher ist. Am Loch neben der NFC-Schleife gibt es auch
  keine Kupferfläche auf den äußeren Lagen: Dieses Loch steht in der Lücke des
  Kupfers um die Schleife (siehe „NFC“).
- Der Summer BZ701 strahlt seitlich ab, entlang der Platine zu ihrem unteren Rand
  (seine Schallöffnung liegt auf der Seite des Bauteils, die zum Pegelwandler
  U701 zeigt). Nahe daran eine Öffnung oder einen Schlitz im Gehäuse lassen.
- LEDs brauchen einen Diffusor vor den Fenstern.
- Kein Metall (Schrauben, Platten, geschirmtes Kabel) in oder direkt hinter die
  NFC-Schleife legen.
- Die Metallrückseite des Displays sollte mit der Masse der Platine verbunden
  werden: Sie ist eine große Platte nahe der Platine, und Entladungen auf das Glas
  landen auf ihr. Die Displayseite der Platine hat hinter dem LCD-Modul vier
  blanke Massepads von 5 x 5 mm, bei (12,0; 23,5), (64,2; 37,2), (48; 17) und
  (43; 80). Mindestens zwei davon vor dem Aufsetzen des Displays mit Leitband oder
  Leitschaum belegen; sie aus dem Bereich heraushalten, den das Montageband abdeckt.

## Stromversorgung

| Schiene | Quelle | Lasten |
|---|---|---|
| +5V | USB-C über das eFuse U105; der DC-Wandler über die ideale Diode U107/Q102; das PoE-Modul über die ideale Diode U106/Q101 | die beiden 3,3-V-Wandler, Hintergrundbeleuchtung, LEDs, Summer, PN532 |
| +5V_DC | AP63205-Abwärtswandler, 2 A, aus den DC-Anschlüssen (PTC-Sicherung, TVS am Anschluss, Verpolschutzdiode, gedämpfter Eingangsfilter, TVS am Wandler) | speist +5V |
| +3V3 | TLV62569-Abwärtswandler U103, 2 A, aus +5V | P4, PHY, Sensoren, Panel-Logik, der Kernwandler U202 |
| +3V3_WIFI | TLV62569-Abwärtswandler U302, 2 A, aus +5V, immer an | allein das WLAN-Modul U301, mit seinem EN-RC und seinen Pull-ups |
| VDD_HP 1,1 V | TLV62569 U202 aus +3V3, vom P4 gesteuert | P4-Kern |
| Interne LDOs des P4 | VDDO_FLASH 3,3 V, VDDO_PSRAM 1,9 V | Flash, PSRAM im Gehäuse des Chips |

Jede Quelle erreicht die 5-V-Schiene über einen Schalter, der Strom in der
Gegenrichtung sperrt. Sind zwei oder mehr angeschlossen, speist die höchste die
Platine; keine speist eine andere, und ein nicht angesteckter Anschluss bleibt
auf 0 V.

### Leistungsbilanz

Ungünstigster Fall je Last, nach den Angaben der Hersteller. „Auslegung“ ist das,
was der Hersteller von der Versorgung verlangt; „Maximum“ ist der höchste vom
Hersteller angegebene Verbrauch.

3,3-V-Schiene (TLV62569 U103, 2 A; Strombegrenzung mindestens 3 A):

| Last | Auslegung (A) | Maximum (A) | Quelle |
|---|---|---|---|
| ESP32-P4, I/O, Flash, PSRAM | 0,380 | 0,200 | HDG v2.0 1.3.2: „minimum operating supply current ... 380 mA (including flash and PSRAM)“; Datenblatt v0.7 Tabelle 5-7: 150 mA bei 400 MHz, Dual-Core, alle Peripherietakte an, „higher when accessing flash/PSRAM“: 50 mA hinzugerechnet (W25Q128JV: höchstens 25 mA) |
| ESP32-P4-Kern über U202 | 0,196 | (in der Zeile darüber) | Datenblatt Tabelle 5-2: Die Kernversorgung muss 0,5 A bei 1,1 V liefern; über U202 mit 85 % sind das 0,196 A bei 3,3 V |
| IP101GRI-PHY | 0,045 | 0,045 | Datenblatt R05: unter 0,15 W bei 100BASE-TX Vollduplex |
| VCNL4040-Emitter | 0,200 | 0,005 (Mittelwert) | Datenblatt Rev. 2.0: 200-mA-Impulse bei 1/40 Tastverhältnis oder weniger |
| Panel-Logik und Touch des Displays | 0,060 | 0,060 | Zuschlag: Die Daten des Panels geben keinen Strom an; ST7701S und GT911 ziehen zusammen typischerweise einige zehn mA. Bei der Inbetriebnahme gemessen |
| Buchsen-LEDs (2 x 1,3 mA), Beschleunigungssensor, Hall-Schalter, IO-Expander, Pull-ups, Supervisor | 0,010 | 0,010 | 1-k-LED-Widerstände; LIS2DH12 185 uA, DRV5032 2,7 mA Spitze, TCA9554 0,6 mA |
| **Summe** | **0,89** | **0,32** | |
| Reserve bis 2 A | **55 %** | 84 % | |

Schiene des WLAN-Moduls (TLV62569 U302, 2 A, dieselbe Schaltung wie U103;
Strombegrenzung mindestens 3 A):

| Last | Auslegung (A) | Maximum (A) | Quelle |
|---|---|---|---|
| ESP32-C5-MINI-1 | 0,600 | 0,426 | HDG 1.3.2: „output current is no less than 600 mA“; Datenblatt v1.4 Tabelle 6-2: IVDD 0,6 A. Tabelle 6-5: 802.11a bei 16,5 dBm, 100 % Einschaltdauer, 426 mA (338 mA bei 2,4 GHz, 802.11b bei 19 dBm, Tabelle 6-4) |
| EN-Pull-up, IO28-Pull-up, fünf 51-k-SDIO-Pull-ups | 0,001 | 0,001 | |
| **Summe** | **0,60** | **0,43** | |
| Reserve bis 2 A | **70 %** | 79 % | |

5-V-Schiene, mit den 3,3-V-Wandlern bei 88 % Wirkungsgrad und der Schiene auf
ihrem Tiefstwert (4,75 V):

| Last | Auslegung (A) | Maximum (A) | Quelle |
|---|---|---|---|
| 3,3-V-Wandler U103 | 0,70 | 0,25 | die erste Tabelle oben |
| Wandler des WLAN-Moduls U302 | 0,47 | 0,34 | die zweite Tabelle oben |
| Hintergrundbeleuchtung (4S2P, 39 mA, über AP3032) | 0,13 | 0,13 | 13 V bei 39 mA, 85 % |
| 8 SK6812MINI-E | 0,30 | 0,10 (Firmware-Grenze) | 12 mA je Farbe (Spezifikation C5149201); die Firmware hält die Summe aller Kanäle unter 100 mA |
| PN532 | 0,12 | 0,12 | Sender 100 mA (die Anpassung hält ihn unter 60 mA, siehe „NFC“) plus 20 mA |
| Summer | 0,10 | 0, solange das NFC-Feld an ist | MLT-8530: 95 mA bei 5 Vo-p; die Firmware piept, nachdem das Feld aus ist |
| Pegelwandler, Entladewiderstände | 0,003 | 0,003 | |
| **Summe** | **1,82** | **0,94** | |

| Quelle | Nennwert | Reserve beim Maximum | Reserve bei den Auslegungswerten |
|---|---|---|---|
| USB-C (eFuse-Strombegrenzung) | mindestens 1,8 A (R110 1,65 k) | 48 % | -1 % |
| DC-Wandler AP63205 | 2 A | 53 % | 9 % |
| PoE-Modul DP9905M | 1,8 A bis 70 C (9 W), 1,2 A bei 85 C (6 W) | 48 % (22 % bei 85 C) | -1 % |

Beide 3,3-V-Wandler sind auf die Versorgungswerte der Hersteller mit mindestens
30 % Reserve ausgelegt: U103 55 %, U302 70 %. Jede 5-V-Quelle hat beim höchsten
vom Hersteller angegebenen Verbrauch mindestens 30 % Reserve, mit den beiden
Firmware-Grenzen in der Tabelle (LED-Strom, Summer und NFC-Feld nicht gleichzeitig).
Die Summe aller Auslegungswerte der Versorgung, 1,82 A, liegt 1 % über der
niedrigsten Strombegrenzung des eFuse und den 9 W des PoE-Moduls. Bei dieser
Summe würde das eFuse den USB-Strom an seiner Grenze halten (1,8 bis 2,2 A) und
die 5-V-Schiene einbrechen lassen, nach einem Fehler mit erneutem Versuch
(TPS259470A: die Variante mit automatischem Neustart); das PoE-Modul würde mit
1 % über seinem Nennwert laufen, was seine eigene Strombegrenzung abdeckt; der
DC-Wandler behält 9 %. Nichts wird beschädigt. Die Summe lässt sich unter den
Grenzen der Firmware nicht erreichen: Die LEDs bleiben unter 100 mA (0,30 A in der
Summe), der Summer schweigt, solange das NFC-Feld an ist (0,10 A), was 1,52 A
übrig lässt (16 % unter den Nennwerten von eFuse und PoE-Modul); und die Summe
stapelt Werte, die nicht zusammenfallen (die 380 mA „minimum operating supply
current“ des P4 neben den 0,5 A seines Kerns, die 200-mA-Impulse des
Näherungs-Emitters bei 1/40 Tastverhältnis, der Versorgungswert von 0,6 A des
WLAN-Moduls gegenüber den höchstens 426 mA, die es zieht). Ein PoE-Modul in einem
Gehäuse über 70 C hat weniger: Der Leser ist für den Betrieb in Innenräumen
(40 C) spezifiziert.

Bevor das WLAN-Modul einen eigenen Wandler hatte, trug U103 es mit: 1,49 A bei
den Auslegungswerten mit den 0,6 A des C5, 25,6 % unter seinen 2 A, und 82 uF
Ausgangskapazität mit den eigenen 33,4 uF des Moduls (siehe „3,3-V-Wandler“).
Das C6-Modul der Revision A trug ebenfalls eigene Kondensatoren, die die Zählung
dort nicht enthielt; seine Schiene lag wohl auch über den 52,8 uF. Der zweite
Wandler löst beides.

USB als einzige Quelle. Ein USB-2.0-Port liefert 500 mA, eine Type-C-Quelle bei
Default USB Power 500 oder 900 mA, mehr nur, wenn ihr Rp 1,5 oder 3 A angibt. Die
5 V des DC-Wandlers und des PoE-Moduls erreichen den IO-Expander über Teiler (P5,
P7), sodass die Firmware weiß, wann USB die einzige Quelle ist; sie nimmt dann
immer das kleinste Angebot, 500 mA: LEDs und Summer aus, Hintergrundbeleuchtung
bei 30 % oder weniger (geschätzt 0,45 A, mit den 3,3-V-Schienen bei ihren
typischen 0,37 A, das WLAN-Modul empfängt). Den CC-Pegel der Quelle zu lesen, was
ein 1,5-A-Ladegerät die volle Platine betreiben ließe, wurde gezeichnet und
verworfen: Die freien ADC-Pins liegen auf der abgewandten Seite der MCU, und zum
USB-C-Steckverbinder blieb kein Weg übrig, ohne das USB-Paar, die Leitung der
Hintergrundbeleuchtung oder den RMII-Bus neu zu verlegen. Diese Grenzen, die
LED-Grenze und Summer-oder-NFC oben sind harte Anforderungen an die Firmware,
mit je einem Test bei der Inbetriebnahme (firmware-port.md, „Stromgrenzen je
Quelle“; bring-up.md, „Stromquellen“).

Die Hardware bleibt ohne die Firmware sicher: Das eFuse begrenzt den USB-Strom auf
1,8 bis 2,2 A und öffnet, wenn VBUS unter 3,9 bis 4,0 V fällt, der DC-Wandler und
das PoE-Modul begrenzen ihren Strom selbst, und eine USB-Quelle, die nicht liefern
kann, schützt sich selbst. Ohne Firmware (MCU im Reset) werden LEDs,
Hintergrundbeleuchtung und Summer durch Widerstände aus gehalten.

### Die Obergrenze der 5-V-Schiene

Die idealen Dioden und das eFuse verlieren Millivolt, daher folgt die 5-V-Schiene
ihrer Quelle. Was jede Quelle höchstens liefert und was jede 5-V-Last aufnimmt:

| Quelle | Höchste Ausgangsspannung | Referenz |
|---|---|---|
| USB-C, eine konforme Quelle | 5,5 V | vSafe5V, USB PD R3.3 Tabelle 4.9 (4,75 bis 5,5 V); USB 2.0 mit dem VBUS Max Limit ECN: 5,5 V |
| USB-C, eine fehlerhafte Quelle | 5,53 bis 5,74 V, dann öffnet das eFuse | OVLO unten |
| DC-Wandler AP63205 | 5,05 V (CCM), etwa 5,2 V im PFM bei geringer Last | DS41326 Rev. 3-2: 4,95 / 5,00 / 5,05 V; Abbildungen 6 und 7 (typisch) |
| PoE-Modul DP9905M | 5,25 V, etwa 5,5 V kurzzeitig bei einem Lastsprung | Datenblatt: 4,75 / 5 / 5,25 V; Lastsprung 50 - 100 - 50 %: +276 mV (typische Oszilloskopaufnahme) |

| Last | Empfohlenes Maximum | Absolutes Maximum |
|---|---|---|
| TLV62569 VIN (beide 3,3-V-Wandler, U103 und U302) | 5,5 V | 6,0 V (SLVSDG1C 6.1, 6.3) |
| PN532 VBAT | 5,5 V | 6,0 V (PN532/C1 Rev. 3.6, Tabellen 290 und 291) |
| SK6812MINI-E VDD | 5,5 V | 5,5 V „limit parameter“; kein anderer Wert (Spezifikation SK6812MINI-E-012 Rev. B, 7 und 9) |
| SN74LV1T125 VCC | 5,5 V | 7,0 V (SCLS745D 6.1, 6.3) |
| AP3032 VIN (Hintergrundbeleuchtung) | 9 V | 20 V |
| Summer MLT-8530 | 4,5 Vo-p | nicht angegeben; mit R705 10 Ohm in Reihe sieht die Spule (16 Ohm +- 3) bei 5,74 V höchstens 3,8 Vo-p |
| LM74700 CATHODE, TPS25947 OUT | 60 V, 23 V | 75 V, 28 V |

Der Teiler des eFuse (R107 330 k, R108 29,4 k, R109 97,6 k, alle 0,1 %) legt die
Sperrschwellen fest. Die Schwellen des TPS259470A liegen bei 1,183 bis 1,223 V
steigend (UVLO und OVLO gleichermaßen) und 1,076 bis 1,116 V fallend (SLVSFC9C 6.5):

| | Nominal | Bereich (Schwellen und 0,1-%-Widerstände) |
|---|---|---|
| UVLO, steigend | 4,32 V | 4,25 bis 4,41 V |
| OVLO, steigend | 5,62 V | 5,53 bis 5,74 V |
| OVLO, fallend (wieder an) | 5,14 V | 5,03 bis 5,23 V |

Jede konforme USB-Quelle kommt also durch, und eine fehlerhafte wird abgeschaltet,
bevor TLV62569 und PN532 ihre 6,0 V erreichen. Mit 1-%-Widerständen läge das
Fenster bei 5,45 bis 5,82 V: Es könnte eine konforme Quelle abschalten. Bei 23 V
an VBUS legt der Teiler 6,39 V an EN/UVLO und 4,91 V an OVLO, unter den 6,5 V, die
beide Pins aushalten. Das OVLO öffnet das eFuse innerhalb von 1,2 us (tOVLO).

Mit jeder konformen Quelle und mit dem DC-Wandler bleibt jede 5-V-Last innerhalb
ihres empfohlenen Bereichs. Zwei Fälle kommen nahe heran:

- Die 5,5 V der LEDs sind auch ihre Grenze. Sie erreichen sie nur mit einer
  USB-Quelle am oberen Ende von vSafe5V und ohne Last am Kabel; der eigene Strom
  der Platine lässt in Kabel, Sicherung und Ferrit mindestens 40 mV abfallen. Eine
  fehlerhafte USB-Quelle zwischen 5,53 und 5,74 V würde bis zu 4 % mehr an die LEDs
  legen, bis sie abgesteckt wird.
- Die Sprungantwort des PoE-Moduls (typisch, +276 mV) kann die Schiene für einige
  hundert Mikrosekunden auf etwa 5,5 V anheben, wenn die Last fällt.

### Quellen auf der 5-V-Schiene

- USB: eFuse U105, TPS259470ARPWR. Anstiegsrate 0,91 V/ms (C118 2,2 nF),
  Strombegrenzung 1,8 bis 2,2 A (R110 1,65 k), die Sperrschwellen oben. Es sperrt
  Strom zurück in VBUS, wenn es aus und wenn es an ist: Sobald OUT 29 mV über IN
  liegt, öffnet es innerhalb von 1 us und schließt erst wieder, wenn IN 104 mV
  über OUT liegt (50 us später). Pin-Funktionen, TI SLVSFC9C Tabelle 5-1 (Seiten
  5 und 6): 1 EN/UVLO („Do not leave floating“), 2 OVLO („Do not leave
  floating“), 3 AUXOFF (TPS259470x: Open-Drain-Ausgang), 4 FLT (TPS259470x:
  Open-Drain-Fehlerausgang), 5 IN, 6 OUT, 7 DVDT, 8 GND, 9 ILM („Do not leave
  floating“), 10 ITIMER („Leave this pin open for fastest response to overcurrent
  events“). Die Pins 3, 4 und 10 sind nicht verbunden;
  `test_new_ics_follow_their_makers_pin_tables` prüft das Symbol gegen die Tabelle
  und dass nur diese drei offen sind.
- DC und PoE: Ideal-Dioden-Controller LM74700-Q1 mit je einem IRLML0030. Der
  Controller hält 20 mV über dem MOSFET und schaltet ihn innerhalb von 0,45 us ab,
  wenn der Strom sich umkehrt. Seine Ladungspumpe hält das Gate 10,8 bis 13,9 V
  über der Source (SNOSD17G 6.5; mindestens 8 V bei 3,2 V Eingang), unter der
  Grenze von 15 V GATE-zu-ANODE und den 20 V des MOSFET. Der IRLML0030 hat höchstens
  27 mOhm bei 10 V und 40 mOhm bei 4,5 V (25 C); bei 8 V und heißer Sperrschicht
  etwa 45 mOhm. Bei 2 A, dem Höchstwert, den jede Quelle liefert, sind das 0,18 W:
  18 C über der Platine mit den 100 C/W des Herstellers. Beim Maximum der
  5-V-Schiene von 0,90 A sind es 0,04 W.
- Entladewiderstände R104 (USB) und R105 (Ausgang des DC-Wandlers), 4,7 k. Bei
  abgestecktem USB leckt das eFuse 4,86 uA (typisch; IREVLKG(OFF), SLVSFC9C 6.5)
  aus der Schiene zurück in VBUS, die Kathode der idealen Diode nimmt 2 uA aus der
  Schiene (LM74700, typisch): 23 mV und 9 mV über 4,7 k, wo ein USB-C-Host 0,8 V
  akzeptiert und der DC-Wandler von seinem Ausgang bei Volt starten würde. Beide
  Werte sind nur typisch; 4,7 k lässt für VBUS den Faktor 30. Jeder Widerstand
  kostet 1 mA, solange seine Quelle an ist.
- Simuliert (`sim/powerup.cir`, `sim/switchover.cir`, mit beiden 3,3-V-Wandlern):
  USB mit 5,0 V hinter 0,25 Ohm und mit 4,5 V hinter 0,5 Ohm eingesteckt, 0,33 A
  auf +3V3 und 0,12 A auf +3V3_WIFI: Beide 3,3-V-Schienen stehen 5,0 ms nach dem
  Einstecken, und der Reset endet 4,7 ms später (das Modell kürzt die Verzögerung
  des Supervisors auf 2 ms; das Bauteil hat 120 bis 280 ms); die 5-V-Schiene läuft
  mit 4,82 und 4,18 V. Mit 0,67 A und 0,43 A vom guten Port 4,58 V. Beim Einstecken
  fließen 3,8 A für Mikrosekunden in C101 (10 uF, was USB 2.0 7.2.4.1 beim Anstecken
  erlaubt), dann 47 mA, während das eFuse die Schiene mit 0,91 V/ms hochfährt. Beim
  Wechsel der Versorgung mit 0,9 A auf +5V und 0,6 A bei 3,3 V (0,17 A auf +3V3,
  0,43 A auf +3V3_WIFI; DC auf USB; USB mit 4,75 V bei eingestecktem und gezogenem
  DC mit 5,05 V; PoE auf DC; PoE und USB, PoE gezogen): +5V bleibt bei 4,06 V oder
  darüber, +3V3 bei 3,30 V, über den 2,99 V des Supervisors, und +3V3_WIFI bei
  3,29 V, über den 3,0 V des Moduls. Im Betrieb an DC bei abgestecktem USB bleibt
  VBUS bei 0 mV; im Betrieb an USB der Ausgang des DC-Wandlers bei 1 mV. Das
  Rückwärtssperren des eFuse (29 mV, 50 us Wiedereinschaltung) und R104 sind im
  Modell. Versucht und aus den Prüfungen herausgelassen: Mit dem Maximum der
  Platine (1,82 A bei 5 V) allein an USB mit 4,75 V hinter 0,43 Ohm fällt die
  5-V-Schiene auf die Unterspannungsgrenze des eFuse, und die Platine schaltet ab.
  Diese Last liegt außerhalb dessen, was USB allein tragen darf: Die
  USB-only-Regel deckelt sie („Strom aus einer reinen USB-Versorgung“).

### 3,3-V-Wandler

TLV62569 (SLVSDG1C) mit 2,2 uH (Sunlord WPN4020H2R2MT, 4,3 A Sättigung) und
R111 100 k / R112 22,1 k: 3,315 V.

- Ausgangskapazität. TIs Tabelle 4 belegt 2,2 uH mit 10, 22 und 2 x 22 uF für
  Ausgänge ab 1,8 V, effektive Kapazität +20 / -50 %; 10 uF ist TIs empfohlener
  Wert, und 8.2.2.5 nennt 10 bis 47 uF. TIs Ingenieur auf E2E (Thread 980956)
  nimmt den größten belegten Wert plus 20 % als Grenze: 52,8 uF effektiv. Jeder
  Kondensator an der 3,3-V-Schiene zählt, auch der des PHY hinter seinem Ferrit.
  Mit Samsungs DC-Bias-Daten bei 3,3 V (22 uF 0805 CL21A226MAQNNNE: 13,69 uF; 10 uF
  0603 CL10A106KP8NNNC: 4,46 uF) hatte die Schiene etwa 76 uF effektiv. Jetzt: 10
  uF am Wandler (C109; der zweite 22 uF entfällt) und 4,7 uF am Emitter des
  Näherungssensors (C715; Vishay verlangt 2,2 uF); das WLAN-Modul und seine
  Kondensatoren haben einen eigenen Wandler (unten). Das sind 44,5 uF, wenn man
  die Kondensatoren ohne Daten mit ihrem vollen Wert zählt; der Test
  `test_3v3_converter_output_capacitance_is_in_tis_table` addiert sie auf.
- Feed-forward-Kondensator C108 12 pF über R111: eine Nullstelle bei 133 kHz. TI
  empfiehlt 6,8 pF mit 200 k (Nullstelle bei 117 kHz). Die Durchtrittsfrequenz der
  Regelschleife ist nicht veröffentlicht; SLVA289 legt die Nullstelle in ihre
  Nähe. Die Inbetriebnahme misst den Lastsprung (0,1 bis 1 A) mit und ohne C108.
- Strom: 0,89 A bei den Auslegungswerten, 55 % unter seinen 2 A (Tabelle oben);
  die Strombegrenzung beträgt mindestens 3 A (DBV-Gehäuse).
- Layout (TI 10.2): so gedreht, dass VIN und FB nach links und SW zur Spule zeigen.
  C107 100 nF direkt über VIN, C106 10 uF daneben; ihre Masse-Vias und eines unter
  dem Wandler schließen die Eingangsschleife über die Massefläche 0,2 mm darunter.
  SW erreicht das Pad der Spule nach 1,1 mm Leiterbahn mit 0,6 mm. Der Teiler
  sitzt unter FB, auf der von SW abgewandten Seite, und misst die 3,3-V-Fläche
  über ein eigenes Via.
- Der Supervisor U204 (TLV803S, 2,93 V) hält den P4 im Reset, bis die Schiene 120
  bis 280 ms über seiner Schwelle gelegen hat, und setzt ihn zurück, wenn die
  Schiene darunter fällt.

### Der Wandler des WLAN-Moduls

U302: die Schaltung von U103 (TLV62569, 2,2 uH WPN4020H2R2MT, R311 100 k / R312
22,1 k, 3,315 V, C306 12 pF über R311), allein für das ESP32-C5-MINI-1. Seine
Teile sind alle schon auf der Platine, etwa 0,22 USD.

- Warum. Das Modul verlangt von seiner Versorgung 0,6 A (HDG 1.3.2) und hat 33,4 uF
  an seinem 3V3-Pin (Datenblatt v1.4, Abbildung 8-1: C6, C21, C29 10 uF; C19, C20,
  C26 1 uF; C4, C8, C12, C15 100 nF; C14 10 nF). An U103 ergab das 1,49 A bei den
  Auslegungswerten (25,6 % Reserve) und etwa 82 uF Ausgangskapazität.
- Ausgangskapazität: C301 22 uF (13,69 uF bei 3,3 V) und C302 100 nF am Pin des
  Moduls, Espressifs typische Schaltung (Abbildung 9-1), und die 33,4 uF des Moduls
  mit vollem Wert: 47,2 uF, innerhalb der 52,8 uF; ohne die Kondensatoren des
  Moduls immer noch 13,8 uF, über TIs kleinstem belegten Wert (10 uF - 50 %)
  (`test_wifi_converter_output_capacitance_is_in_tis_table`). C301 ist zugleich
  der Ausgangskondensator des Wandlers und der des Moduls.
- Strom: 0,60 A beim Auslegungswert, höchstens 0,43 A: 70 % unter seinen 2 A.
- Immer an, wie die Versorgung des C6: EN über R310 100 k aus der 5-V-Schiene,
  kein Schalter (ein Modul, dessen Versorgung ein IO-Expander schaltete, startete
  nicht, esp-hosted Issue 127). Alles, was die Pins des Moduls beim Reset festlegt,
  hängt an seiner eigenen Schiene: der EN-RC (R301 10 k, C303 1 uF), der
  IO28-Pull-up R303 und die SDIO-Pull-ups R305 bis R309
  (`test_wifi_module_supply_is_always_on_and_carries_its_pull_ups`).
- Reihenfolge beim Einschalten. Beide Wandler starten gemeinsam aus der 5-V-Schiene
  (jeder bei 2,45 V, mit demselben Soft-Start): +3V3 und +3V3_WIFI stehen binnen
  Mikrosekunden voneinander, in der Simulation 5,0 ms nach dem Einstecken von USB.
  EN des Moduls steigt 13,4 ms später (sein RC bis 0,75 x 3,3 V). Der Supervisor
  hält den P4 120 bis 280 ms nach +3V3 im Reset, sodass kein P4-Pin das Modul
  treibt, bevor seine Schiene steht und seine Straps gelesen sind; spätere Resets
  durch esp-hosted laufen mit beiden Schienen oben. Fällt die 5-V-Schiene, fallen
  beide Schienen gemeinsam, und der Supervisor setzt den P4 unter 2,93 V zurück.
- Layout (TI 10.2), in der Spalte links vom Modul: um 90 Grad gedreht, sodass SW,
  GND und EN nach oben zur Spule und VIN und FB nach unten zeigen. C305 100 nF
  direkt unter VIN, C304 10 uF daneben, ihre Masse-Vias und eines unter dem
  Wandler zwischen seinen Pad-Reihen schließen die Eingangsschleife über In1. SW
  läuft geradewegs hoch in das Pad von L301; das Ausgangspad von L301 liegt auf
  gleicher Höhe mit dem +-Pad von C301, und das Massepad von C301 liegt den
  Massepins 1 und 2 des Moduls gegenüber, sein +-Pad dem 3V3-Pin des Moduls (Pin 3).
  Der Teiler sitzt unter FB und misst die Schiene an C302 entlang dem Rand des
  Moduls (`routes_wifi.wifi_buck_routes`).
- Auf der fertig verlegten Platine (`scripts/layout_report.py`, Pad-Mitten): Die
  Eingangsschleife ist C305 zu VIN 1,4 mm entlang Kupfer und 5,1 mm zurück durch die
  Füllung, 1,1 mm2, Kupfer des Schaltknotens 7,4 mm2, so klein wie bei U103
  („Schaltwandler: Hot Loops“). Das +-Pad von C301 liegt 1,8 mm vom 3V3-Pin des
  Moduls und 3,2 mm vom Ausgangspad von L301; sein Massepad 1,8 mm von den
  Massepins 1 und 2 des Moduls, mit einem Via 0,75 mm entfernt in In1, und 7,2 mm
  vom GND-Pin von U302, den es über In1 erreicht (dieses Via, und das 0,6-mm-Via
  zwischen den Pad-Reihen von U302). Beide Hersteller wollen diesen Kondensator an
  ihrem Pin; er sitzt näher am Pin des Moduls, weil die Ausgangsschleife den
  dreieckigen Ripple der Spule führt, nicht den zerhackten Strom der
  Eingangsschleife, die TI als die kritische benennt.

### DC-Eingang

Gedacht für 12-V- oder 24-V-Netzteile; 28 V sind das Höchste, was er dauerhaft
aushält. Die Buchse ist für 24 V ausgelegt. Der Wandler (AP63205) arbeitet bis
32 V, hält 35 V dauerhaft aus und 40 V für 0,4 s.

Von den Anschlüssen aus: PTC-Sicherung F102 (1,1 A Haltestrom), TVS D107 (SMBJ28CA,
bidirektional), Verpolschutzdiode D105 (SS310, 100 V), C117 2,2 uF und der
Elektrolytkondensator C120 47 uF, Filterspule L103, TVS D106 (SMBJ28A) und C112/C113
des Wandlers. Beide TVS sperren bis 28 V und leiten ab 31,1 bis 34,4 V. Eine
verpolte Versorgung bleibt unter der Sperrspannung von D107, und D105 sperrt sie.

- Einstecken eines spannungsführenden Netzteils. Die Induktivität des Kabels und
  die Eingangskondensatoren schwingen; der ESR von C120 dämpft das. Simuliert
  (`sim/dc_hotplug.cir`): Bei 24 V sieht der Wandler höchstens 31,0 V (1,5 m dünnes
  Kabel), 27,6 bis 29,1 V mit dickeren und längeren Kabeln; bei 26,4 V (24 V + 10 %)
  höchstens 34,7 V; bei 28 V 32,6 V, ohne Strom in der TVS. ESR von C120 0,1 bis
  0,8 Ohm, die TVS am oberen Ende ihres Bereichs. Ohne C120 erreichten dieselben
  Fälle 38 V.
- Überspannungsimpulse (Surges). Welche Prüfung gilt:
  - Die Platine hat Funkmodule, also gilt die RED und mit ihr EN 301 489-1 V2.2.3:
    Deren Tabelle 2 und 9.8 verlangen Surges nur an AC-Netz und drahtgebundenen
    Netzwerkanschlüssen. Ein DC-Versorgungsanschluss bekommt keine.
  - EN 55035 gilt nicht (EN 301 489 hat Vorrang, deren Abschnitt 1), und sie würde
    einen DC-Anschluss, der von einem eigenen Netzteil gespeist wird, auf der
    AC-Seite des Netzteils prüfen (3.1.12).
  - EN 61000-6-1 gilt nicht: Sie ist für Produkte ohne Produkt- oder
    Produktfamiliennorm (deren Abschnitt 1), und Zutrittskontrolle hat eine,
    EN 50130-4.
  - EN 50130-4:2011, Abschnitt 13, ist das, was Kunden aus der Zutrittskontrolle
    erwarten. Auf Kleinspannungs-Gleichstromleitungen wendet sie nur den langsamen
    energiereichen Surge von Leitung gegen Erde an, über 42 Ohm (2 Ohm Generator,
    40 Ohm). Die Pegel der Ausgabe von 1995 sind 0,5 und 1 kV; die Pegel von 2011
    sind vor dem Labortermin der gekauften Norm zu entnehmen.
  - Der PoE-/Ethernet-Anschluss ist ein drahtgebundener Netzwerkanschluss: 0,5 kV
    Leitung gegen Erde, wenn sein Kabel in Innenräumen länger als 30 m sein darf
    (EN 301 489-1 9.8.2.2).

  Simuliert (`sim/dc_surge.cir`): 1,2/50 us, +-1 kV hinter 42 Ohm, statt von
  Leitung gegen Erde über den Eingang angelegt (die Platine hat keine Erde, im
  echten Test fließt also weit weniger davon durch den Eingang), die Versorgung über
  die 1,5 mH des Koppelnetzwerks angeschlossen, beide TVS am oberen Ende ihres
  Durchbruchbereichs mit der Steigung ihrer 10/1000-us-Angabe, C120 bei -20 % mit
  niedrigem und hohem ESR, L103 ungesättigt und gesättigt:

  | Versorgung | +1 kV: Wandler, D105 sperrend | -1 kV: Wandler, D105 sperrend, Eingangs-TVS |
  |---|---|---|
  | 12 V | 35,8 V, 40 V | 34,7 V, 62 V, 21,5 A |
  | 24 V | 38,6 V, 26 V | 35,5 V, 72 V, 21,8 A |
  | 26,4 V | 39,3 V, 22 V | 35,6 V, 74 V, 21,8 A |
  | 28 V | 39,6 V, 19 V | 35,7 V, 75 V, 21,8 A |

  Der Wandler bleibt unter seinen 40 V (0,4 s), D105 unter seinen 100 V; die
  Eingangs-TVS nimmt bis zu 22 A eines 8/20-us-Impulses auf, wo ST für dasselbe
  Bauteil 68 A bei 59 V angibt. Der Eingang des Wandlers bricht nach dem Surge ein
  (auf 4 V bei 12 V, auf 17 V bei 24 V): Die 1,5 mH des Koppelnetzwerks schwingen
  mit C120, vom Wandler ungedämpft, der konstante Leistung zieht. Das Netzwerk
  eines Prüflabors kann dasselbe tun; die Platine startet dann neu. Versorgungskabel
  haben Mikrohenry, nicht Millihenry, und schwingen so nicht.

  Vorher, mit der SS34 und ohne TVS am Anschluss, sah der Wandler bei 28 V
  Versorgung 40,6 V, und ein negativer Surge trieb D105 mit 22 A in den Durchbruch.
  Ein Leitung-gegen-Leitung-Surge von 0,5 kV hinter 2 Ohm (die Prüfung der
  IEC 61000-4-5 für Leistungsanschlüsse, die keine Norm für diese Platine von einem
  DC-Anschluss verlangt) treibt etwa 200 A: Das bräuchte einen Wandler für 60 V und
  eine größere TVS.
- Eingangsfilter: C117, L103 und C112/C113 bilden ein Pi-Filter, sodass der
  1,1-MHz-Ripplestrom des Wandlers nicht auf das Versorgungskabel hinausläuft. Er
  nimmt bei 1,1 MHz 40 bis 50 dB weg (berechnet, nicht gemessen). Er hat keine
  Gleichtaktdrossel: Findet das Labor Aussendungen vom Kabel über 30 MHz, ist ein
  Klappferrit am Kabel das erste Mittel. Die Keramikkondensatoren sind 2,2 uF /
  100 V X7R: Sie behalten 2,0 uF bei 12 V und 1,5 uF bei 24 V, wo ein Bauteil mit
  10 uF / 50 V 3,4 und 1,35 uF behält und den Eingang höher schwingen lässt.
- Der DC-Wandler sitzt in der linken Spalte hinter dem Display, direkt über den
  beiden DC-Anschlüssen, weit weg von der NFC-Schleife.

Weitere Hinweise:

- Nichts außer der TVS darf über dem PoE-Eingang liegen. Zusätzliche Kapazität dort
  zerstört die PoE-Erkennungssignatur.
- Das PoE-Modul braucht eine Mindestlast (100 mA beim DP9905M, 200 mA beim Ag9905M).
  Bei eingeschalteter Hintergrundbeleuchtung zieht die Platine mehr als das. Ein
  Deep-Sleep-Modus bräuchte eine Dummy-Last. Ein PoE-Modul, das angeschlossen ist,
  aber keine Last trägt, weil eine andere Quelle höher liegt, kann pfeifen, und der
  Switch kann den Port aus- und wieder einschalten. Nichts wird beschädigt.
- Die Firmware kann nicht erkennen, welche Quelle die Platine speist. Das wurde mit
  Absicht weggelassen; ein Teiler auf einen freien GPIO würde es ergänzen.
- Der Kernwandler muss ein TLV62569DBVR sein. Espressif führt die Teilenummern auf,
  die funktionieren; Wandler mit Ausgangsentladung hindern den P4 am Aufwachen.

## PoE-Potenzialtrennung

Die 48-V-Seite besteht aus den Buchsenpins 9 und 10, FB102, FB103, D103 und den
Modulpins 5 bis 8. Sie liegt im rechten Streifen der Platine. Dort ist auf keiner
Lage eine Masse- oder Versorgungskupferfläche gegossen, und die PoE-Netzklasse hält
2 mm zu jedem anderen Netz. Diese Regel vergleicht Kupfer nur auf einer Lage; von
Lage zu Lage erfüllen die Sperrflächen ihre Aufgabe: Keine Kupferfläche auf
irgendeiner Lage kommt 48-V-Kupfer näher als 2 mm (unter dem 48-V-Pad von C102
endeten die inneren Kupferflächen früher 0,9 mm davon). C102 überbrückt die
Barriere für die EMV: ein zertifizierter X1/Y2-Sicherheitskondensator (Murata
GA352QR7GF102KW01L, 1 nF, 250 V AC, vom Hersteller mit 2000 V AC für 60 s
stückgeprüft) in der Bauform 2211, auf einem Land Pattern mit 4,5 mm zwischen den
Pads. C410 (1 nF, 3 kV, Fenghua 1808B102K302NT) und R413 verbinden den Schirm der
Buchse mit Masse; beide liegen auf der Sekundärseite.

Drei Stellen brauchen mehr als die 2-mm-Regel, die nur Kupfer gegen Kupfer auf einer
Lage betrachtet:

- Unter dem PoE-Modul. Seine Isolationsbarriere liegt nicht an der Pin-Reihe,
  sondern unter dem Modulkörper, 2,3 mm von den Ausgangspins an einem Ende und 5,3 mm
  am anderen (Silvertels Zeichnung für die Ag9900-Familie; das SDAPO-Datenblatt zeigt
  keine). Von dieser Linie bis zu den 48-V-Pins hat die Platine auf keiner Lage
  Kupfer.
- Am Metallgehäuse der Buchse. Das Gehäuse liegt auf der Sekundärseite (Schirm). Kein
  48-V-Kupfer und kein Bauteil auf 48 V liegt auf der Bestückungsseite innerhalb von
  1 mm von der Rückwand des Gehäuses; die beiden 48-V-Netze laufen unter dieser Wand
  auf der inneren Lage durch.
- Am Display. Die beiden 48-V-Pins der Buchse treten auf der Displayseite der Platine
  neben der Metallrückseite des LCD-Moduls heraus: Pin 9 mit 0,5 mm zwischen Pin und
  Modulrand, Pin 10 mit 1,8 mm. Luft allein hält 1500 V über 0,5 mm nicht. Das
  Polyimidband auf dieser Ecke des LCD, um dessen Rand gewickelt, ist die Isolierung
  (siehe „Displaymontage und Flexkabel“). Auf der hinteren Lage, die zum Display
  zeigt, verläuft keine 48-V-Leiterbahn: Die beiden Leitungen von der Buchse und die
  gefilterte Minusleitung neben dem Modul (19 mm) laufen auf der inneren Lage In2.

Die 2-mm-Angabe ist eine Entwurfsentscheidung, keine zertifizierte Kriechstrecke.
Silvertel verlangt 3 mm zwischen den beiden Seiten der Barriere; die Platine hat
2,0 mm und mehr. Die Buchse selbst hat 2,3 mm zwischen ihren PoE-Pins und ihren
Signalpins. IEEE 802.3 (§33.4.1) lässt das Powered Device eines davon bestehen:
1500 V RMS für 60 s, 2250 V DC für 60 s oder zehn Impulse von 1500 V mit 10/700 µs
(TI-Application-Report SLUA818; IEEE-Interpretation interp-3-0704). Bis zum
Industrie-Review waren C102 und C410 2-kV-DC-Bauteile, unter den 2,1 kV Spitze der
ersten Prüfung und unter der zweiten. Die 2000-V-AC-Stückprüfung des Y2-Bauteils
(2,8 kV Spitze) deckt alle drei ab. Die Isolation an einem bestückten Gerät prüfen,
bevor das Labor es tut, und das Labor fragen, ob es sie überhaupt prüft: Für die
Sicherheitsnorm sind beide Seiten berührungssicher.

## NFC

- Spule: 4 Windungen, 35 x 37 mm, 0,5 mm Leiterbahn, 0,9 mm Raster, auf der Displayseite.
  Simuliert aus dem Kupfer der Platine (`sim/nfc_loop.py`), bei 13,56 MHz:

  | | Induktivität | Widerstand |
  |---|---|---|
  | in freier Luft | 1,27 uH | 1,20 ohm |
  | auf der Platine, Wand aus Holz oder Stein | 1,25 uH | 1,23 ohm |
  | auf der Platine, Metallwand 18 mm hinter der Spule | 1,20 uH | 1,24 ohm |

  Die Kupferflächen rund um die Spule nehmen 2 %, weil sie auf einer Seite offen
  sind (siehe das Ende dieses Abschnitts); die Metallrückseite des Displays nimmt
  nichts, was zählt. Die Spule hat außerdem etwa 2,4 pF Eigenkapazität (zwischen
  ihren Windungen, zum umgebenden Kupfer, zu Pads und Zuleitungen), was wie 2,5 %
  mehr Induktivität wirkt. Nicht in der Simulation: die DC-Klemme 6 mm entfernt
  und, bei der LAN-Version, der Ethernet-Stecker und das Kabel 8 mm neben dem
  rechten Rand der Spule. Sie senken die Induktivität ein wenig, ebenso eine Karte
  oder ein Telefon im Feld.
- Dämpfung: 1,5 ohm in jedem Zweig, was eine Güte von etwa 25 ergibt.
- EMV-Filter: 560 nH und 220 pF je Seite (Eckfrequenz bei 14,3 MHz).
- Anpassung: in Reihe 39 pF, parallel 180 pF + 10 pF. Das sind nicht die Werte
  für die beste Anpassung bei einer einzelnen Induktivität. Sie sind so gewählt,
  dass der Sender und der Empfängereingang für die Spule an beiden Wandarten
  innerhalb ihrer Grenzen bleiben, mit Spielraum nach unten für das, was eine
  Karte oder ein Telefon wegnimmt:

  | Spule | Last zwischen TX1 und TX2 | Versorgungsstrom des Senders | Empfängereingang |
  |---|---|---|---|
  | 1,00 uH | 5 + 15j ohm | etwa 79 mA | 3,1 Vpp |
  | 1,10 uH | 12 + 24j ohm | etwa 49 mA | 1,8 Vpp |
  | 1,20 uH | 59 + 13j ohm | etwa 35 mA | 1,2 Vpp |
  | 1,25 uH | 36 - 26j ohm | etwa 41 mA | 1,9 Vpp |
  | 1,30 uH | 15 - 22j ohm | etwa 56 mA | 2,9 Vpp |

  Der PN532 erlaubt 100 mA im Sender (60 mA typisch, 150 mA ist der Grenzwert)
  und 4 Vpp am Empfängereingang (seine analoge Versorgung plus 1 V). Vor diesen
  Werten gab es zwei andere Sätze. Der erste (27 pF, 150 pF + 22 pF) wurde für
  eine größere Spule von 1,35 bis 1,4 uH berechnet; mit 1,2 uH hätte er etwa
  140 mA gezogen. Der zweite (parallel 180 pF + 18 pF, Empfangsteiler 2,7 k)
  wurde für 1,2 uH und ohne die Eigenkapazität der Spule berechnet. Mit der
  simulierten Spule von 1,25 uH ergibt er 57 mA und 3,8 Vpp, und mit der
  Toleranz der Bauteile liegen 45 von hundert Platinen über der Grenze des
  Empfängers und fünf über 100 mA. Die Zahlen stammen aus einem Modell
  (`sim/nfc_match.py`: Treiber 4 ohm je Seite, 2 bis 5 ohm über die Streuung;
  Senderversorgung 3,0 V, 2,7 bis 3,4 V; Filterspule 1 ohm), nicht aus einer
  Messung. Ein Lauf im Zeitbereich mit dem Rechtecksignal der echten Brücke
  (`sim/nfc_tx.cir`) ergibt denselben Strom.

  Die Tabelle gilt für exakte Bauteilwerte. Die Kondensatoren und die beiden
  Filterspulen sind 5-%-Teile, und die Eckfrequenz des Filters (14,3 MHz) liegt
  nahe am Träger, sodass ihre Streuung das Ergebnis ebenso stark verschiebt wie
  eine andere Spule:

  | Bauteile innerhalb 5 % | Senderstrom bleibt unter 100 mA für Spulen von |
  |---|---|
  | exakte Werte | 0,93 bis 1,39 uH |
  | gleichmäßig gestreut: weniger als eine Platine von hundert darüber | 1,08 bis 1,27 uH |
  | alle Bauteile gleichzeitig am ungünstigsten Ende | 1,12 bis 1,25 uH |

  Der Empfängereingang bleibt bei 99 von hundert Platinen unter 4 Vpp für Spulen
  von 1,06 bis 1,26 uH. Weiter außerhalb wird es schnell schlechter: bei 1,0 uH
  liegt eine Platine von fünf über 100 mA, bei 1,3 uH eine von zwanzig (bis zu
  210 mA; die Grenze des Chips liegt bei 150 mA). Deshalb ist die Spule zu
  messen, bevor das Feld eingeschaltet wird, und der Strom, wenn es zum ersten Mal
  eingeschaltet wird (Inbetriebnahmeplan).
- Die Dämpfungswiderstände führen den Strom der Spule: mit diesen Werten je 20
  bis 35 mW, und bei beliebiger Streuung der Bauteile höchstens 75 mW für Spulen
  bis 1,25 uH (sie sind für 0,1 W ausgelegt).
- Empfangspfad: 3,9 k, 1 nF, 1 k nach VMID. Die Referenz von NXP hat dort 2,7 k;
  damit sah der Eingang bei 1,25 uH 3,8 Vpp. Mit 3,9 k sieht er für Spulen von
  1,2 bis 1,25 uH 1,2 bis 1,9 Vpp, deutlich über den 0,5 Vpp, die er braucht.

Das sind Startwerte. Messen Sie zuerst die Spule, stimmen Sie dann C513/C517,
C514/C515/C518/C519, R504/R505 und R506 mit einem Netzwerkanalysator an einem
aufgebauten Gerät mit montiertem Display ab und prüfen Sie die Lesereichweite mit
den verwendeten Karten. Die beiden Bestückungsvarianten unterscheiden sich hier:
Ein geschirmter Stecker und sein Kabel liegen neben der Spule, also stimmen Sie die
LAN-Version für sich allein ab, mit eingestecktem Kabel.

Das Kupfer um die Spule ist an einer Stelle offen (eine Lücke von 2,5 mm in allen
Lagen auf der Seite zur Ethernet-Aussparung). Ein geschlossener Kupferring um die
Spule würde wie eine Kurzschlusswindung wirken: simuliert, macht Metall über dieser
Lücke aus den 1,25 uH der Spule 1,03 uH und aus ihren 1,23 ohm 1,36 ohm. Eine der
vier Befestigungsschrauben steht in der Lücke. Deshalb tragen die äußeren Lagen
innerhalb von 3,3 mm um dieses Loch kein Kupfer: Weder der Schraubenkopf auf der
Bestückungsseite noch die Einschmelzmutter unter der Platine kann die beiden Enden
des Kupfers verbinden, auch dort nicht, wo sie den Lötstopplack durchdringen. (Bis
zum 24. November 2026 liefen die Kupferflächen unter beiden durch, auf beiden
Seiten der Lücke.)

## Ethernet

Die Beschaltung folgt dem Espressif ESP32-P4-Function-EV-Board: IP101GRI mit einem
25-MHz-Quarz, der PHY liefert den 50-MHz-RMII-Takt, PHY-Adresse 1. Die Mittelanzapfungen
des Übertragers liegen über 100 nF an Masse (Spannungsmodus-PHY, keine
Abschlusswiderstände).

Das Datenblatt der Buchse druckt kein + und - an den Pins des Übertragers. Die
Polarität ergibt sich aus den Wicklungspunkten in ihrem Schaltplan und den
Standardkontakten der Buchse (1 TX+, 2 TX-, 3 RX+, 6 RX-): Pin 1 ist RD+, Pin 2 RD-,
Pin 5 TD+, Pin 6 TD-. Am PHY führt der positive Pin jedes Paares zur äußeren der
beiden Leiterbahnen, an der Buchse ist es der innere Pin. Beide Leitungen eines
Paares laufen nebeneinander auf der Bestückungsseite bis zur Buchse. Knapp darüber
wechselt jede über ein Via auf die Rückseite, und dort tauschen die beiden die
Seite. (Ein vertauschtes Paar würde trotzdem verbinden: 10BASE-T-Empfänger
korrigieren es, und 100BASE-TX hängt nicht von der Polarität ab.)

Die Paare führen auf der Rückseite unter der hinteren Wand des Metallgehäuses der
Buchse hindurch, die beiden 48-V-Netze auf der inneren Lage, und kein Bauteil steht
innerhalb von 1 mm von dieser Wand. Nur die beiden Leiterbahnen der Mittelanzapfung
und, an der linken Seite des Gehäuses, die LED- und Schirm-Leiterbahnen laufen auf
der Bestückungsseite unter dem Gehäuse; ein Kontakt zwischen einer von ihnen und dem
Gehäuse würde nicht schaden.

Der PHY hat keine eigene Reset-Schaltung. Sein Reset-Pin hängt an einem Pin des
IO-Expanders, der nach dem Einschalten ein Eingang mit schwachem Pull-up ist, sodass
der PHY gleichzeitig mit der Versorgung startet, ohne die 10 ms Reset, die sein
Datenblatt verlangt. Die Firmware muss den Pin auf Low pulsen, bevor sie den PHY
benutzt (siehe [firmware-port.md](hardware/touch-p4/firmware-port.md)). Das
Espressif-P4-Board arbeitet genauso.

Der 25-MHz-Quarz (ESR bis 50 ohm) liegt über dem, was das Datenblatt des PHY erlaubt
(40 ohm). Typische Teile liegen weit unter beiden Werten. Wenn eine Platine einmal
den Ethernet-Takt in der Kälte nicht hochbekommt, suchen Sie zuerst hier.

## WLAN-Antenne

Der ESP32-C5-MINI-1 trägt seine eigene Dualband-Leiterplattenantenne, gespeist über
einen Diplexer, in den 5,85 mm am oberen Ende des Moduls (Datenblatt v1.4, Abb.
11-1). Für den Funkteil wird nichts anderes gekauft oder montiert; die externen
Antennen, ihr Kabel und die Antennenkammer des C6-MINI-1U entfallen.

Ihre Lage, aus `scripts/bootstrap/geometry.py` (Platinenkoordinaten, mm):

| | |
|---|---|
| Modul | Pad-Mitte (27,8; 13,9): Körper x 20,1 bis 35,5, y 0,3 bis 21,6, Antenne oben |
| Antennenbereich | x 20,1 bis 35,5, y 0,3 bis 6,15; seine untere Grenze (die Massekante des Moduls) bei y 6,15 |
| Ausschnitt in der Oberkante | x 8,6 bis 37,5, 6,0 tief: keine Platine unter der Antenne und auf beiden Seiten davon. Sein Boden liegt 0,15 mm über der unteren Grenze der Antenne; er reicht 2 mm über das Modul hinaus nach rechts (der Massepunkt der Antenne) und 11,5 mm nach links (ihr offenes Ende) |
| Kupfer-Sperrfläche | x 0 bis 50,5, y 0 bis 6,3, auf allen sechs Lagen: der Antennenbereich und 15 mm daneben auf beiden Seiten, bis 0,2 mm über der obersten Pad-Reihe des Moduls |
| Masse am Rand | die neun Massepads des Moduls mit zwölf Vias dazwischen, wie Espressifs Land Pattern sie zeigt: 0,45 mm, ihre Ränder berühren die Pads gerade eben (`post_route.py` lässt sie in dieser Größe, statt sie in die Pads hinein zu verbreitern); gefüllt und überdeckelt durch die Bestellung, sodass keines Lot zieht. Kein Via in den Pads des Moduls: das Via des Autorouters im oberen linken Massepad, für den C6 angelegt, wird mit seiner Leiterbahn entfernt (`build_pcb.py`, `same_net_in_stale_pads`). Massefüllung auf allen Lagen unterhalb der Sperrfläche, vernäht durch `post_route.py` |

Espressifs Leitfaden (HDG 1.4.7, Abbildungen 22 und 23) empfiehlt die Antenne jenseits
des Platinenrandes, den Massepunkt der Antenne (ihr rechtes Ende) an einem
Platinenrand oder einer Ecke und "a clearance of at least 15 mm in all directions"
im Gehäuse. Wo die Antenne nicht überstehen kann, verlangt er die Platine auf beiden
Seiten der Antenne und darunter ausgeschnitten. Auf dieser Platine:

- Die Antenne bleibt innerhalb des Umrisses, weil das Gehäuse 1,5 mm bis zu seiner
  oberen Wand hat; der Ausschnitt ist die Ausweichlösung, die der Leitfaden nennt.
- Der Massepunkt liegt auf der Innenseite der Platine, 51 mm vom rechten und 35 mm
  vom linken Rand. Abbildung 22 hakt für diese Ausrichtung nur die rechten Ecken ab:
  Die obere rechte Ecke (Position 3) ist dort, wo USB-C, sein eFuse-Pfad und ein
  Befestigungsloch sitzen.
- Der Ausschnitt reicht 11,5 mm über das offene Ende hinaus, nicht 15 mm: Das
  obere linke Befestigungsloch hält ihn auf.
- Im Gehäuse hat die Antenne 1,8 mm zur oberen Wand, 4,7 mm zur Vorderwand (beide
  gedruckt), 13,1 mm zur Dock-Platte (gedruckt) und, wenn der Leser an einer
  Metallwand sitzt, 15,6 mm zur Wand. Die Metallrückseite des Displays (x 5,6 bis
  80,4, y 12,8 bis 89,4) liegt 6,7 mm unter dem Antennenbereich, auf der anderen Seite
  der Platine und 3,9 mm hinter der Ebene der Antenne; sie ist an vier Pads mit der
  Masse der Platine verbunden.

Was das kostet, steht im Vollwellenmodell weiter unten, gegen dasselbe Ersatzmodell an
Espressifs Position 3, und ist unter „Akzeptierte Abweichungen" festgehalten.

Frontmaterialien. Das Modell hat den oberen Streifen des Gehäuses gedruckt (ABS oder
PETG); eine Frontplatte aus Holz oder Druck verhält sich wie dieser. Eine
Aluminium-Frontplatte über dem Streifen oberhalb des Displays kostet bei 2,4 GHz 1,5
bis 1,9 dB und bei 5 GHz 0,7 bis 1,2 dB gegenüber der gedruckten Front; mit einem
Fenster über der Antenne und ihrer Sperrfläche (x bis 50,5 mm) kostet sie nichts.
Also: gedruckte, hölzerne oder andere nichtmetallische Fronten überall; eine
Metallfront nur mit diesem Fenster.

Vollwellenmodell (`sim/wifi_antenna.py`, openEMS). Espressif veröffentlicht die Form
der Antenne nicht. Ein Ersatzmodell derselben Größe und Art, eine invertierte
F-Antenne mit einem langen Arm für 2,4 GHz und einem kurzen Zweig am Speisepunkt für
5 GHz, Massepunkt rechts, wurde auf einer Evaluationsplatine von 40 x 55 mm mit der
über den Rand hinausragenden Antenne auf 2,429 GHz (-10 dB) und 5,435 GHz (-8 dB)
abgestimmt. Dann dasselbe Ersatzmodell auf dieser Platine: an seinem Platz (oben
links) und in der oberen rechten Ecke mit der über den Rand hinausragenden Antenne,
ihr rechtes Ende 1 mm innerhalb der Platine (Espressifs Position 3, Abb. 23 "Max
1"), mit um ebenso viel vergrößertem Gehäuse, sodass die Antenne dieselben Abstände
zu seinen Wänden hat. Abgestrahlt von der eingespeisten Leistung (die
Fehlanpassung eingerechnet), und in Klammern von der aufgenommenen Leistung, in dB:

| Fall | 2,4 GHz: Resonanz | Kanal 1 / 7 / 13 | 5 GHz: Resonanz | 5,18 / 5,50 / 5,70 GHz |
|---|---|---|---|---|
| Evaluationsplatine | 2,429 | -2,4 / -2,4 / -2,6 (-1,9 / -1,9 / -1,9) | 5,440 | -6,8 / -4,8 / -5,4 (-4,4 / -3,9 / -3,3) |
| Diese Platine, oben links | 2,375 | -2,7 / -2,9 / -3,4 (-1,7 / -1,6 / -1,4) | 5,435 | -3,9 / -2,8 / -4,0 (-1,8 / -2,0 / -1,7) |
| mit dem Display | 2,377 | -2,7 / -3,0 / -3,4 (-1,7 / -1,6 / -1,4) | 5,440 | -4,0 / -2,6 / -4,2 (-1,9 / -1,8 / -2,0) |
| **im Gehäuse, mit dem Display** | 2,325 | **-3,0 / -3,5 / -4,1** (-1,5 / -1,4 / -1,3) | 5,430 | **-3,8 / -2,5 / -4,0** (-1,9 / -1,7 / -1,9) |
| im Gehäuse, Metallwand 16,4 mm dahinter | 2,308 | -4,7 / -4,9 / -5,2 (-2,6 / -2,4 / -2,3) | 5,430 | -4,3 / -3,0 / -4,6 (-2,6 / -2,4 / -2,7) |
| im Gehäuse, Aluminium-Frontplatte | 2,321 | -4,5 / -5,2 / -6,0 (-1,9 / -1,8 / -1,7) | 5,425 | -4,5 / -3,2 / -5,2 (-2,2 / -2,0 / -2,5) |
| Aluminium-Frontplatte mit Fenster über der Antenne | 2,325 | -2,8 / -3,5 / -4,2 (-1,6 / -1,5 / -1,4) | 5,430 | -3,7 / -2,4 / -4,0 (-1,8 / -1,7 / -1,9) |
| Position 3, auf der Platine | 2,487 | -1,7 / -1,4 / -1,3 (-1,1 / -1,2 / -1,2) | 5,820 | -9,3 / -5,4 / -3,6 (-3,6 / -2,9 / -2,7) |
| **Position 3, im Gehäuse, mit dem Display** | 2,427 | **-1,1 / -1,1 / -1,2** (-1,1 / -1,1 / -1,0) | 5,800 | **-9,3 / -5,0 / -3,2** (-3,9 / -2,9 / -2,5) |
| Position 3, im Gehäuse, Metallwand | 2,433 | -2,6 / -2,6 / -2,7 (-2,4 / -2,4 / -2,3) | 5,805 | -10,9 / -6,1 / -4,4 (-5,3 / -4,1 / -3,7) |

Im Gehäuse mit dem Display strahlt der Platz oben links bei 2,4 GHz 1,9 / 2,4 / 2,9 dB
weniger ab als Position 3 und bei 5 GHz 5,5 / 2,5 dB mehr bis 0,8 dB weniger. Von der
Leistung, die die Antenne aufnimmt, strahlt sie bei 2,4 GHz 0,3 bis 0,4 dB weniger und
bei 5 GHz 0,6 bis 2,0 dB mehr ab: Der Unterschied bei 2,4 GHz liegt größtenteils in
der Anpassung. Der Ausschnitt und die Sperrfläche ziehen das Ersatzmodell um 54 MHz
nach unten, das Gehäuse um weitere 50 MHz (2,429, 2,375, 2,325 GHz), sodass Kanal 13
am oberen Rand der Anpassung liegt; bei Position 3 zieht die Platine die
5-GHz-Resonanz stattdessen auf 5,8 GHz hoch. Beide Plätze liegen in jedem Kanal
innerhalb von 3 dB voneinander, der Grenze, die für das Beibehalten des Platzes oben
links gesetzt wurde (Review vom 25. November 2026). Die absoluten Zahlen sind die des
Ersatzmodells; Espressifs eigene Antenne auf seiner Testplatine strahlt bei 2,4 GHz 77
bis 83 % (-0,8 bis -1,1 dB) und bei 5 GHz 51 bis 68 % (-1,6 bis -2,9 dB) ab
(Antennenbericht zur FCC ID 2AC7Z-ESPC5MINI1, "ESP-DUAL BAND-ANT C", Sporton, 1.
Dezember 2025). Die Metallrückseite des Displays ändert fast nichts; eine Metallwand
kostet bei 2,4 GHz 1,1 bis 1,7 dB und bei 5 GHz 0,5 bis 0,6 dB und schickt den
größten Teil des Rests nach vorn (76 % und 88 % in Richtung Raum gegenüber 47 %).

Die Reichweite gegenüber den eingesetzten C6-Lesern wird bei der Inbetriebnahme auf
beiden Bändern gemessen (Inbetriebnahmeplan).

## WLAN und Bluetooth: der ESP32-C5 hinter dem ESP32-P4

Der P4 hat kein Funkmodul. Das C5-Modul betreibt Espressifs esp-hosted-Firmware und ist
über SDIO der WLAN-Adapter und der Bluetooth-Controller des P4. Diese Paarung hat den
Ruf, Ärger zu machen. Am 24. November 2026 wurden die Berichte im esp-hosted-Tracker
von Espressif und in den Trackern von ESPHome und Arduino daraufhin gelesen, was sie
verursacht hat, und jede Ursache wurde gegen diese Platine gehalten. Sie betrafen den
ESP32-C6, den Coprozessor der meisten P4-Platinen, und wurden am 25. November 2026,
nach dem Wechsel zum C5, noch einmal gelesen, ob ihre Ursache vom Modul abhängt.

Was Espressif von der Hardware verlangt
([Getting Started](https://github.com/espressif/esp-hosted-mcu/blob/v3.1.0/docs/getting-started-mcu.md#1-sdio);
für die Leiterbahnen der Hardware-Designleitfaden des C5, HDG 1.4.9),
und was die Platine hat:

| Verlangt | Hier |
|---|---|
| Die festen SDIO-Pins des C5 (CLK 9, CMD 10, D0 8, D1 7, D2 14, D3 13), Chip-Revision v1.0 oder neuer | wie verlangt; der Chip des Moduls ist Revision v1.0 oder v1.2 |
| Am P4 die Pins von Slot 0, die direkt mit der SDIO-Einheit verdrahtet sind, für das beste Timing; Slot 1 läuft über die Pin-Matrix | Slot 0 (GPIO39 bis 44). Die meisten Platinen mit dieser Paarung, auch die von Espressif, nutzen Slot 1, weil ihr Slot 0 die SD-Karte trägt |
| 51-k-Pull-ups an CMD und D0 bis D3 | R305 bis R309, 51 k, an die eigene 3,3-V-Schiene des Moduls |
| Eine Reset-Leitung vom Host zum EN-Pin des Moduls | GPIO45 über 1 k (R302) an EN, der 10 k (R301, an die Schiene des Moduls) und 1 uF (C303) hat. Der 10-ms-Puls von esp-hosted zieht EN auf 0,3 V und hält ihn 8,4 ms lang unter seiner Schwelle |
| Längen, Lagen und Masse (HDG 1.4.9): Befehl und Daten innerhalb von 50 mil (1,27 mm) vom Takt, wenn nötig Serpentinen; höchstens 2000 mil (50,8 mm); 50 ohm +-10 %; kein Lagenwechsel; eine ununterbrochene Bezugsfläche darunter; Massekupfer um den Takt | Ein von Hand gelegter Bus (`routes_sdio.py`): die sechs Leitungen auf der Rückseite über der Massefläche In4, 0,15 mm (49 ohm). Jede Leitung 40,3 mm von Pad zu Pad, der Takt über seine 22 ohm (R304) am P4: Serpentinen im geraden Abschnitt machen sie auf 0,01 mm gleich. Der Takt am westlichen Rand des Busses, 1,2 mm von seinem Nachbarn, mit Massefüllung auf beiden Seiten, alle 2,5 mm vernäht. Jede Leitung wechselt an jedem Ende einmal die Lage, mit einem Masse-Via innerhalb von 0,7 bis 1,7 mm von jedem Signal-Via; das verfehlt „kein Lagenwechsel", siehe „Akzeptierte Abweichungen" („SDIO-Leiterbahnen zum WLAN-Modul") |
| Eine Versorgung am Modul, die nicht einbricht, mindestens 0,6 A (HDG 1.3.2) | ein eigener Wandler, U302 (TLV62569, 2 A), mit Espressifs 22 uF (C301) und 100 nF (C302) am Pin des Moduls (siehe „Der Wandler des WLAN-Moduls") |

Die Berichte, nach Ursache:

| Bericht | Ursache | Hier |
|---|---|---|
| WLAN verbindet sich nicht, `Dropping packet(s) from stream`, Neustartschleifen ([ESPHome 10956](https://github.com/esphome/esphome/issues/10956), [esp-hosted 151](https://github.com/espressif/esp-hosted-mcu/issues/151)) | Der Coprozessor lief mit einer anderen esp-hosted-Version als der P4. Gekaufte Platinen kommen mit einer alten oder gar keiner | Das Modul kommt leer. Wir flashen es über seine Testpunkte und halten beide Seiten auf einer Version |
| `send_op_cond returned 0x107`, `card init failed` beim Start ([esp-hosted 127](https://github.com/espressif/esp-hosted-mcu/issues/127), [Arduino 11404](https://github.com/espressif/arduino-esp32/issues/11404)) | Der Coprozessor wurde durch die falsche Reset-Polarität in der Konfiguration im Reset gehalten, war nicht versorgt (seine Versorgung wurde von einem IO-Expander geschaltet) oder hatte keine Firmware | Die Versorgung des Moduls wird nicht geschaltet. Die Polarität ist eine Firmware-Einstellung ([firmware-port.md](hardware/touch-p4/firmware-port.md)) |
| `Unrecoverable host sdio state` (0x107) nach Minuten oder Stunden ([esp-hosted 167](https://github.com/espressif/esp-hosted-mcu/issues/167), [121](https://github.com/espressif/esp-hosted-mcu/issues/121)) | Nach Espressifs Analyse vom 18. November 2026 drei Dinge: eine Display-Bibliothek, die ROM-Cache-Funktionen des Chips aufrief, während SDIO beschäftigt war; ein Fehler in esp-hosted 3.0.9, behoben in 3.1.0; und auf einer eigenen Platine etwas, das noch nicht gefunden ist, wobei Espressif nach Rauschen auf den Pins fragte, die sich die Versorgung mit den SDIO-Pins teilen, und nach den 3,3 V des Moduls | Firmware, für die ersten beiden. Zum dritten: Die Versorgungsgruppe der SDIO-Pins (GPIO39 bis 48) trägt hier auch den Reset des Moduls, das Summersignal und die LED-Datenleitung, alles langsame Signale in hohe Impedanzen, und keine Leistungsstufe |
| CRC-Fehler (0x109) unter Last auf einer eigenen Platine ([esp-hosted 167](https://github.com/espressif/esp-hosted-mcu/issues/167)) | Nicht geklärt. Espressif liest es als Timing-Reserve zwischen den beiden Chips, die von Leiterbahnlänge und Last abhängt: Die eigene Platine zeigt bei 50 MHz mit den Standard-Taktflanken des C6 keine und mit den anderen Flanken viele. Der Berichtende fand kein Host-Timing, das es behob, und vermutet die SDIO-Einheit des C6 | Der Anteil der Platine am Timing ist 1,01 ns (siehe oben). Bleiben Sie bei den Standardflanken, die der Slave-Treiber des C5 ebenfalls hat (Senden und Abtasten bei steigender Flanke). Ob sich die SDIO-Einheit des C5 wie die des C6 verhält, ist nicht bekannt: Der Inbetriebnahmeplan liest den Durchsatz und die Fehlerzahl bei 40 und 50 MHz |
| Downloads bleiben nach etwa 100 kB hängen ([esp-hosted 184](https://github.com/espressif/esp-hosted-mcu/issues/184)) | Der Access Point: mit anderen Access Points weg, und in einem WLAN-6-Netz weg, als der C6 von 802.11ax ferngehalten wurde | Firmware; der C5 hat 802.11ax ebenfalls |
| Double Free im SDIO-Empfangs-Task ([esp-hosted 210](https://github.com/espressif/esp-hosted-mcu/issues/210)) | `esp_wifi_remote` älter als das esp-hosted, mit dem es gebaut wurde | Firmware |
| Die Firmware des Coprozessors lässt sich nicht mehr über SDIO aktualisieren ([esp-hosted 143](https://github.com/espressif/esp-hosted-mcu/issues/143)) | Coprozessor-Firmware 2.1 bis 2.8 zuerst geflasht: Ihr Bootloader startet spätere Images nicht | Firmware: Das zuerst geflashte Image ist ein neueres. Die Testpunkte bleiben als Weg zurück |
| Der Bluetooth-Scan verstummt nach 90 s ([esp-hosted 180](https://github.com/espressif/esp-hosted-mcu/issues/180)) | Die Platine hatte das Modul ohne eigene Antenne (MINI-1U) und keine angeschlossene Antenne | War das Modul dieser Platine. Der C5-MINI-1 hat seine Antenne an Bord; es gibt nichts anzustecken |
| Bluetooth: Das Verbinden als Central wird bei manchen Geräten nie abgeschlossen ([esp-hosted 204](https://github.com/espressif/esp-hosted-mcu/issues/204)) | Ein Fehler auf der Host-Seite. Ein im Bericht im Juli 2026 geposteter Patch behob es für den Berichtenden; der Bericht war im November 2026 noch offen | Firmware. Das ist wichtig: Der Bluetooth-Proxy des Lesers ist ein Central, der scannt und sich verbindet |
| "The early board had wrong crystal capacitors and a fault in the radio part" (ein Kommentar zu [esp-hosted 155](https://github.com/espressif/esp-hosted-mcu/issues/155)) | Eine Platine mit einem nackten C6-Chip | Zertifiziertes Modul mit eigenem Quarz, eigener Antenne und eigener Anpassung |

Keine der gefundenen Ursachen liegt in der Schaltung oder im Layout dieser Platine. Fast
alle sind Firmware-Versionen und -Einstellungen, die
[firmware-port.md](hardware/touch-p4/firmware-port.md) auflistet, und eine liegt in der
Bestückung (ein leeres Modul; die fehlende Antenne ging mit dem C6-MINI-1U). Zwei Berichte
von eigenen Platinen sind aber nicht geklärt: die Timeouts, deren Ursache Espressif nicht
gefunden hat, und die CRC-Fehler, die es auf die Timing-Reserve zurückführt. Eine
eigene Platine kann auch einen Fehler dieser Art haben, und kein Bericht kann ihn für
eine Platine ausschließen, die noch niemand gebaut hat. Deshalb lässt der
Inbetriebnahmeplan den rohen Durchsatztest von esp-hosted auf der Verbindung laufen,
bevor irgendetwas anderes darauf gelegt wird.

## Manipulationserkennung

Drei Sensoren melden der Firmware, dass sich jemand am Leser zu schaffen macht. Die
Firmware liest sie noch nicht; das ist, was sie finden wird.

| Sensor | Bauteil | Erkennt | Wie er gelesen wird |
|---|---|---|---|
| Beschleunigungssensor U702 | LIS2DH12TR | Schläge und Bohren (Erschütterung), dass der Leser aufgeschwenkt oder abgerissen wird (Neigung gegenüber der Richtung beim Einbau), Fallen | I2C0, Adresse 0x19. Seine Ereignisregister halten den Zustand, daher reicht Abfragen. INT1 liegt auf Testpunkt TP814 (`INT`) |
| Näherungssensor U704 | VCNL4040M3OE | der Leser am oder vom Dock: Er sendet Infrarotpulse (940 nm) in den geschlossenen Raum hinter der Platine und misst, was die Platte des Docks, 13,9 mm entfernt, reflektiert. Er misst auch das sichtbare Licht in diesem Raum | I2C0, Adresse 0x60. Nähe und Umgebungslicht als 16-Bit-Werte. Er vergleicht den Näherungswert selbst mit einer unteren und einer oberen Schwelle und setzt ein Flag, wenn der Wert das Band verlässt. INT (Open Drain, 10 kΩ Pull-up) liegt auf Testpunkt TP815 (`INT`) |
| Hall-Schalter U703 | DRV5032FA | der Leser am oder vom Dock: Ein Magnet im Dock liegt vor dem Schalter | `DOCK_N` an P6 des IO-Expanders: Low am Dock, High davon weg. Der Schalter tastet 20-mal pro Sekunde ab |

- Der Magnet ist eine Neodym-Scheibe von 10 x 3 mm (N35 oder stärker, durch ihre
  Dicke magnetisiert, ein beliebiger Pol oben). Er liegt in einem Ring auf der
  Dock-Platte, vor dem Platinenpunkt (12,5; 38,2), 10,3 mm vom Schalter entfernt. Das
  ergibt etwa 22 mT am Schalter. Der Schalter schaltet sicher innerhalb von 19 mm
  (4,8 mT) ein und lässt jenseits von 45 mm (0,5 mT) sicher los, typisch bei 29 mm.
- Der Hall-Schalter meldet den Leser also als entfernt, sobald er abgehoben ist, nicht
  wenn die beiden Haltschrauben herauskommen: Schwenkt man das untere Ende um 20 mm
  heraus, bewegt sich der Schalter nur 5 mm weg. Der Beschleunigungssensor deckt diesen
  Teil ab: Derselbe Schwenk neigt den Leser um 7 Grad.
- Ein zweiter Magnet, von außen ans Gehäuse gehalten, kann den Hall-Schalter eingeschaltet
  halten. Deshalb ist der Näherungssensor da. Sein Licht geht von der Platine zur Platte
  des Docks und zurück, im geschlossenen Gehäuse. Um seinen Messwert beizubehalten,
  während der Leser abgenommen wird, müsste etwas im selben Abstand und mit derselben
  Helligkeit davor bleiben, und dafür braucht es zuerst ein Loch im Gehäuse.
- Der Näherungssensor liegt am Platinenpunkt (21,6; 52,4), unter dem Feld für die
  Seriennummer, sein Sender am oberen Ende. Das Licht des Senders endet etwa 30° neben
  seiner Achse, das ist ein Fleck von 7,4 mm Radius auf der Platte. Die Platte ist 9 mm
  rundherum eben: Der Halter des Magneten endet 9,4 mm von der Mitte des Flecks, die
  Schraublöcher und die Kabel sind weiter entfernt. Vor dem Sensor liegt keine
  Abdeckung, daher misst er außerhalb des Docks fast null.
- Wie viel er am Dock misst, hängt von der Farbe der Platte ab und muss gemessen
  werden. Die Diagramme in Vishays Application Note geben, für eine graue Karte mit
  18 % Reflexion und 12,8 mm von der Oberkante des Bauteils: etwa 50, 75 und 120
  Zählwerte bei 50, 100 und 200 mA mit dem kürzesten Puls (1T) und etwa 400 bis 1100
  mit dem längsten (8T). Nach denselben Diagrammen fällt der Messwert um etwa ein
  Fünftel für jede 2 mm, die der Leser abgehoben wird. Eine weiße Platte reflektiert
  mehrfach mehr als die graue Karte, eine mit Ruß gefärbte Platte viel weniger. Die
  Firmware sollte den Messwert des montierten Lesers speichern und melden, wenn der
  Messwert ein Band um ihn verlässt.
- Der Sensor misst seine eigenen Pulse und zieht gleichmäßiges Licht ab. Der weiße
  Kunststoff lässt etwas Infrarot durch, prüfen Sie also am ersten Gerät, ob Sonnenlicht
  oder eine starke Lampe am Gehäuse den Messwert verschiebt.
- Dasselbe Bauteil misst sichtbares Licht. Der Raum hinter der Platine ist dunkel,
  solange der Leser am Dock sitzt, abgesehen von dem, was die Status-LEDs und der
  Kunststoff durchlassen. Licht dort ist ein weiteres Zeichen für ein offenes Gehäuse;
  wie dunkel das geschlossene Gehäuse ist, muss ebenfalls gemessen werden.
- Der Hall-Schalter und der Magnet bleiben in Revision A als zweiter, unabhängiger
  Weg, das Dock zu erkennen. Wenn sich der Näherungssensor auf den ersten Platinen
  bewährt, können U703 und C713 weggelassen und das Dock ohne den Magneten gedruckt
  werden; nichts anderes ändert sich.
- Was die Hardware nicht erkennt: ein durchtrenntes Kabel oder verlorene Versorgung (der
  Server sieht den Leser offline gehen) und dass die Platine aus der Kappe genommen wird
  (dafür muss der Leser zuerst vom Dock sein).
- Alle drei Sensoren sind bei beiden Versionen bestückt. Der Platz von
  Beschleunigungssensor und Hall-Schalter, links vom MCU, ist 15 mm von der Mitte des
  Summers und 22 mm von der nächsten Spule entfernt, damit der Magnet sie nicht stört.
  Bewegen Sie den Magneten nicht in Richtung des PoE-Moduls, der Wandlerspulen oder des
  NFC-Anpassnetzwerks.
- Der Summer rüttelt die Platine mit 2,7 kHz. Die Firmware sollte den
  Beschleunigungssensor ignorieren, solange er piept.
- Die freien Pins des MCU (GPIO27, 48, 53, 54) konnten nicht verwendet werden: Vor
  dreien von ihnen sitzen Kondensatoren an der Pad-Reihe, und der vierte ist von den
  Ethernet-Signalen eingeschlossen. Deshalb läuft der Hall-Schalter über den
  IO-Expander.

## ESD je Anschluss

Das Ziel ist EN 301 489-1 V2.2.3 Abschnitt 9.3.2, den die Teile 3 (NFC) und 17
(Wi-Fi) auf das Gehäuse anwenden: "The test severity level for contact discharge
shall be ±4 kV and for air discharge ±8 kV", angewendet "to all exposed surfaces
of the EUT except where the user documentation specifically indicates a
requirement for appropriate protective measures". Kriterium B (EN 301 489-17
Abschnitt 6.4): Der Leser darf zurücksetzen, muss sich aber selbst erholen.
Kabelanschlüsse bekommen Transienten und Stoßspannungen, keine ESD (EN 301 489-1
Tabelle 2). EN 55035 verweist für Funkanlagen auf die Reihe EN 301 489 (ihre
gemeinsame Änderung 1). IEC 61000-4-2 Abschnitt 8.3.2 lässt Punkte aus, die nur im
Service erreicht werden, wenn das Handbuch ESD-Maßnahmen nennt, und die Kontakte im
Inneren eines Metallsteckergehäuses. Die Nennwerte unten stammen aus den
Datenblättern der Hersteller.

| Anschluss | Was berührt werden kann | Ziel | Schutz, Nennwert | Reserve |
|---|---|---|---|---|
| USB-C, Gehäuse und Pins | nichts im Betrieb: nur erreichbar, wenn der Leser vom Dock ist (Service) | als Service ausgelassen (die ESD-Maßnahme des Handbuchs); sonst 4 kV Kontaktentladung am Gehäuse | Gehäuse an Masse; D+/D- U101 USBLC6-2SC6, "IEC 61000-4-2 level 4: 15 kV (air discharge), 8 kV (contact discharge)" (ST); VBUS D101 SMAJ5.0A, 30 kV Luft und Kontakt | 2x und mehr |
| DC-Buchse und Klemme | im Gehäuse; Luftentladung an der Kabelkerbe | 8 kV Luft an der Kerbe | D107 SMBJ28CA am Anschluss, 30 kV Luft und Kontakt (Littelfuse), dann 2,2 uF + 47 uF | 3,75x |
| Ethernet und PoE | im Gehäuse; Stecker eingeschlossen | nur Entladungen auf die Koppelfläche | Magnetics der Buchse 1500 V RMS (HanRun), PHY mit 12 kV Kontakt ausgelegt (IP101G); PoE-Seite D103 SMAJ58A und das mit 1500 V isolierte Modul; Schirm über C410 1 nF / 3 kV | isoliert |
| Displayglas, Vorderseite | 0,55 mm Glas | 8 kV Luft | der Lichtbogen endet am Glas | kein Spalt |
| Displayglas-Kanten, Flexkabel dahinter | die 0,25-mm-Fuge rund um das Glas; das Flexkabel verlässt das Display am unteren Rand | 8 kV Luft | Touch-Leitungen (TP_INT, TP_RST, I2C0 SDA und SCL): U603, U604 USBLC6-2SC6 am Anschluss (im Review-Schritt 4 ergänzt); die Metallrückseite des Displays über leitfähige Dichtungen auf den vier freien Pads mit Masse verbunden; Klebeband über dem Flexkabel (Installationsanleitung) | Teile für 15 kV Luft ausgelegt |
| NFC-Bereich | massive 2,4 mm starke Vorderwand | 8 kV Luft | keine Öffnung; die Spule ist durch ihr Anpassnetzwerk an Masse nebengeschlossen | kein Spalt |
| LED-Fenster, Summerlöcher, Haltschrauben, Fugen | Diffusoren in acht Fenstern, Löcher nahe dem Summer, zwei schwebende M3-Schrauben von unten | 8 kV Luft; 4 kV Kontakt an den Schrauben | keiner auf der Platine: SK6812MINI-E mit 2 kV HBM ausgelegt, Summer und sein FET ohne Angabe, Schrauben schweben | von Datenblättern nicht belegt: akzeptierte Abweichung unten |
| WLAN-Antenne | auf das Modul gedruckt, im Gehäuse, hinter der oberen Wand der Kappe | 8 kV Luft an der Fuge | die HF-Leitung hat kein ESD-Bauteil (das Modul lässt seine ESD-Diode D2 unbestückt, Datenblatt v1.4 Abb. 8-1); die Antenne liegt 1,8 mm hinter der oberen und 4,7 mm hinter der Vorderwand, ohne leitenden Pfad nach außen | nicht belegt; ESD-Vortest an der oberen Wand (Inbetriebnahmeplan) |
| Taster und Testpunkte | auf der Platine, nur im Service | als Service ausgelassen | CHIP_PU 10 k + 1 uF + Supervisor; BOOT hinter 1 k | Service |

Quellen: ETSI EN 301 489-1 V2.2.3 (2019-11) Abschnitte 6.2, 7.2, 9.3; EN 301 489-17
V3.3.1 Abschnitt 6.4; IEC 61000-4-2 Ed. 2.0 Abschnitt 8.3.2; EN 55035:2017 gemeinsame
Änderung 1; ST USBLC6-2SC6 Datenblatt Rev. 5 S. 1; R+O SMAJ Datenblatt Rev.
2.2 S. 1; Littelfuse SMBJ Datenblatt (07/04/25) S. 1; HanRun HY931147C REV.A/1;
IC Plus IP101G Datenblatt R01 Abschnitt 7.1; OPSCO SK6812MINI-E Spezifikation B/2;
Espressif ESP32-C5-MINI-1 Datenblatt v1.4 Abb. 8-1.

## Verwendete Layout-Regeln

| Klasse | Leiterbahn | Abstand | Netze |
|---|---|---|---|
| Default | 0,15 | 0,127 | Signale |
| Power | 0,25 | 0,127 | 3,3 V, Kernschiene, kleine Versorgungsschienen |
| Power5V | 0,6 | 0,15 | 5-V-Eingangspfad |
| DCIN | 0,6 | 0,25 | DC-Eingang bis zum Wandler |
| PoE | 0,6 | 2,0 | 48-V-Seite |
| NFC_RF | 0,3 | 0,127 | Sender zur Antenne |
| USB | 0,14 | 0,127 | USB-Daten: ein gekoppeltes Paar, 0,15 mm Abstand, 90 ohm |
| MDI | 0,155 | 0,127 | Ethernet-Paare: 50-ohm-Leitungen am 1,27-mm-Raster der Buchse, 100 ohm |

Die Breiten sind die, mit denen Leiterbahnen gelegt werden. Nach dem Routing
verbreitert `scripts/bootstrap/post_route.py` jede Versorgungsleiterbahn so weit, wie
das Kupfer daneben es erlaubt (in Richtung 0,6 mm für die Kernschiene, 0,5 mm für
3,3 V, 0,8 mm für die 5-V-Netze, 0,4 mm für die übrigen Versorgungsnetze), und die
0,112-mm-Verengungen des Autorouters auf 0,127 mm. Eine Leiterbahn, die an einem Pad
endet, bleibt so schmal wie das Pad. Von den 527 Leiterbahnsegmenten der Klasse Power
sind danach 88 schmaler als 0,25 mm, alle an Pins mit feinem Raster oder zwischen
Pads; zwei Signalsegmente sind weiterhin 0,112 mm breit.

Kleinstes Via 0,45 mm Pad, 0,2 mm Bohrung. Von den 753 Vias mit 0,2-mm-Loch haben 620
ein 0,5-mm-Pad (Ring 0,15 mm); die übrigen 133 haben keinen Platz dafür. Der
ESP32-P4 hat 0,35 mm Pin-Raster mit 0,15-mm-Pads.

Jeder Versorgungspin des P4 hat ein Via knapp innerhalb der Pad-Reihe, direkt hinunter
zur 3,3-V-Fläche oder zum Kernschienen-Kupfer auf der Rückseite. Abblockkondensatoren
verbinden sich mit eigenen Vias mit denselben Flächen.

Masse hängt nicht von der Kupferfüllung der äußeren Lagen ab, die das Routing in
Stücke schneidet. Jedes Massepad hat ein Via in die Massefläche oder eine Leiterbahn
zu einem Pad, das eines hat: Die Wandler, die USB-Schutzdioden, der Flash, der
IO-Expander, der LED-Puffer und die Steckverbinder haben je ein Via an ihrem Massepin,
das WLAN-Modul hat vier zwischen seinen neun Massepads, das PoE-Modul zwei an seinem
Ausgangs-Massepad, und die Massepins der drei QFN-Bauteile laufen direkt in ihre
freiliegenden Pads.

Vier Vias liegen absichtlich in Pads, an der oberen linken Ecke des MCU, wo neben den
Pads kein Platz ist: in den Massepads von C208 (10 uF), C223 und C226 (je 1 uF) und im
Versorgungspad von C223, wo die Flash-Versorgung auf In2 wechselt. JLCPCB füllt und
überdeckelt jedes Via einer sechslagigen Platine (Harz, dann überplattiert), sodass
das Lot in diese vier nicht laufen kann.

Kein anderes Via-Loch liegt unter Lotpaste, wo das Lot hineinlaufen würde: Die Vias der
freiliegenden Pads von MCU und PHY sitzen in den Gassen zwischen den Pastenfenstern,
die vier des PN532-Pads in seiner Mitte mit den Pastenfenstern ringförmig darum, die
des WLAN-Moduls dort, wo vier seiner Massepads zusammentreffen, und die Fan-out-Vias
der kleinen Bauteile neben ihren Pads (zwischen zwei Pads eines Netzes, wo
Kondensatoren 1,1 mm auseinander stehen). Die vier des PN532 sind Teil seines
Footprints, als durchkontaktierte Pads; `test_design.py` prüft die Footprint-Bibliothek
auf Paste über einem durchkontaktierten Loch.

Die Pads der zweipoligen 0402- und 0603-Bauteile verbinden sich über Wärmefallen
(0,25 mm breit, 0,2 mm Spalt) mit der Massefüllung. Ein solches Bauteil, auf einer
Seite fest in der Füllung und auf der anderen an einer dünnen Leiterbahn, kann im Ofen
aufrecht stehen. Größere Bauteile, ICs und Vias sind fest in den Füllungen.

Masse-Vias verbinden die Füllungen und Flächen miteinander (`post_route.py`): eines
neben dem Via jedes schnellen Signals (RMII, SDIO, USB, Ethernet-Paare), damit der
Rückstrom die Fläche dort wechseln kann, wo das Signal es tut, und Stitching-Vias alle
5 mm, alle 2,5 mm entlang der Oberkante und um das WLAN-Modul. Ein Stück Füllung ohne
Vias neben der Antenne würde nahe 2,4 GHz resonieren; der Streifen rechts der Antenne
hatte über 40 mm keines. Von den 42 Vias schneller Signale haben 25 ein Masse-Via
innerhalb von 1,5 mm und 6 keines innerhalb von 3 mm (höchstens 3,8 mm): Die
Ethernet-Vias über dem MCU und die am PHY stehen zu dicht beieinander für mehr.

Von Hand (per Skript) geroutet und gesperrt:

- die 48-V-Netze, die Ethernet-Paare und die Leiterbahnen der Mittelanzapfung,
- der DC-Eingang von den Steckverbindern über Sicherung, Diode und Filter bis zum
  Wandler, die Summerschaltung und der Ausgang des PoE-Moduls,
- die PHY-Pins auf seiner linken und unteren Seite,
- die Antennenzuleitungen,
- die Versorgungs-, Masse- und Adressverbindungen des Beschleunigungssensors (seine
  Pads liegen 0,5 mm auseinander),
- die Verbindung des Näherungssensors zwischen seinen beiden Kathodenpins (sie läuft
  unter dem Bauteil, zwischen den Pad-Reihen), seine Versorgung und sein
  Interrupt-Ausgang,
- der 5-V-Bus der oberen LED-Reihe, im Streifen zwischen dem Flexkabelschlitz und den
  LED-Fenstern,
- die LED-Datenverbindung zwischen den beiden LED-Reihen, auf der inneren Lage neben
  dem Befestigungsloch,
- am MCU, auf allen vier Seiten:
  - links: Quarz, Reset, VDD_BAT, die Fan-outs der NFC-Host-Signale, die
    SDIO-Leitungen und die Summer-, LED- und WLAN-Enable-Signale,
  - rechts: die Flash-Signale, die Flash-Versorgung (auf der Rückseite, vom Via von
    Pin 30 zu ihren Kondensatoren, Flash-Pin 8 und dem Chip-Select-Pull-up), die
    USB-PHY-Versorgung und die beiden USB-Pins,
  - oben: ein Via für jedes Ethernet-Signal und für UART0 RX in einem Feld über den
    Pins, und Kernversorgungspin 54,
  - unten: die 20 Displaysignale zu ihren Serienwiderstands-Arrays,
- der Fan-out der NFC-Host-Signale am PN532,
- UART0 TX und das Backlight-PWM-Signal: Jedes verlässt den MCU über ein Via innerhalb
  seines Pad-Rings und läuft auf der Rückseite.

Der MCU hat 0,35 mm Pin-Raster, und drei der vier Lagen tragen dort Signale. Die Router
können die ersten zwei Millimeter um ihn herum nicht lösen: Ein Via vor einer Pad-Reihe
kostet die benachbarten Pins ihren Ausweg, und die meisten Pin-Gruppen passen nur in
einer Anordnung. Deshalb hat fast jeder Signalpin des MCU entweder eine vollständige
feste Route oder eine feste Leiterbahn zu einem Via, von dem aus der Router in jede
Richtung weiterkann. (Die Ausnahmen sind die vier Touch-Signale in der unteren linken
Ecke und zwei Reglerausgänge an der Oberkante, die Platz haben.) Wo benachbarte Pins
Vias bekommen, werden ihre Leiterbahnen zuerst auf 0,45 bis 0,5 mm gespreizt, und die
Vias wechseln zwischen zwei Reihen ab. Fan-out-Vias, die die Router nicht brauchten,
wurden am Ende wieder entfernt.

Alles andere wurde vom Autorouter (Freerouting) geroutet und, wo dieser aufgab, vom
Gitterrouter in `scripts/bootstrap/finish_route.py`.

Zwei Lagen reichen nicht, um alle Signale vom MCU wegzubekommen, daher trägt die
innere Lage In2 ebenfalls Signalleiterbahnen: 1130 mm davon, 28 % aller Leiterbahnen.
Dazwischen ist Masse gefüllt. Die 3,3-V-Fläche (In3) liegt direkt darunter, die
Massefläche In1 darüber; die Rückseite hat die zweite Massefläche (In4) als
Bezug. Auf In1, In3 oder In4 läuft keine Leiterbahn, und jede der drei ist ein
einziges Stück. Die 3,3-V-Fläche hat einen Streifen, der hinunter zu den NFC-Teilen
links der Antenne läuft.

Die Kupferfläche der Kernschiene auf der Rückseite reicht von unter dem MCU bis zum
zweiten Ausgangskondensator des Wandlers (C235). Drei Vias mit 0,3 mm neben dem Pad
dieses Kondensators führen den Strom zu ihm hinunter, und die Leiterbahnen von der
Spule zu den Kondensatoren sind 0,6 mm breit. Der vierte Kernpin (54, hinter der
0-ohm-Brücke R203) wird von einer 0,2 bis 0,3 mm breiten, 11 mm langen Leiterbahn auf
der Rückseite gespeist.

Die Platzierung um den MCU folgt aus dem Routing. Die Signale auf seiner linken Seite
brauchen einen freien Streifen, daher sitzen nur zwei Kondensatoren neben diesen Pins
(in den Lücken ungenutzter Pins); die anderen 3,3-V-Kondensatoren dieser Seite sind 10
bis 18 mm entfernt und verlassen sich auf die Vias in die Flächen. Die
Reglerkondensatoren über dem MCU sitzen aus demselben Grund 2,4 mm von der Pad-Reihe
entfernt.

Leiterbahnbreite: 0,15 mm für Signale. Der Autorouter verengt Leiterbahnen neben Pins
mit feinem Raster auf 0,112 mm, daher ist das Minimum der Platine auf 0,11 mm gesetzt
(die Grenze des Herstellers liegt bei 0,09 mm). Alle bis auf zwei dieser Verengungen
werden danach auf 0,127 mm verbreitert.

Längen der schnellen Busse auf der gerouteten Platine: Die sechs SDIO-Leitungen zum
WLAN-Modul sind 38 bis 46 mm lang, die RMII-Leitungen zum PHY 40 bis 48 mm und sein
50-MHz-Takt 59 mm, mit je zwei bis vier Vias. Beide liegen deutlich innerhalb dessen,
was diese Schnittstellen vertragen. Die Ethernet-Paare vom PHY zur Buchse sind 11 bis
18 mm lang. Die RMII-Sendeleitungen haben keine Serienwiderstände (am MCU ist dafür
kein Platz); stattdessen stellt die Firmware ihre Treiberstärke ein (siehe
[firmware-port.md](hardware/touch-p4/firmware-port.md)).

Lotpaste auf dem freiliegenden Pad des MCU wird als neun Fenster von 2,1 mm gedruckt
(70 % des Pads), nicht als eine Öffnung von 7,5 mm: Mit Paste über dem ganzen Pad kann
das Gehäuse darauf schwimmen und von seinen Pins mit 0,35 mm Raster abheben. Das Pad
hat 16 Masse-Vias mit 0,3 mm in den Gassen zwischen den Fenstern. Das Pad des PHY hat
auf dieselbe Weise vier Fenster und fünf Vias. Das Pad des PN532 (4,42 mm) hat acht
Fenster von 1,15 mm, 54 % des Pads, um seine vier Vias herum.

Die LEDs verwenden KiCads Footprint für dieses Bauteil mit um 0,1 mm kürzeren Pads.
Sein Ausschnitt ist 3,4 x 3,0 mm mit freigestellten Ecken: Eine gefräste Öffnung hat
runde Innenecken, und der LED-Körper (3,2 x 2,8 mm) hat eckige. KiCads Pads enden
0,25 mm von diesen Ecken, und ein gefräster Umriss kann 0,2 mm danebenliegen; die
kürzeren Pads halten 0,3 mm ein, wie alles andere Kupfer (0,31 mm ist das Kleinste
auf der Platine).

RMII_TXD1 ist GPIO35, der auch der Boot-Modus-Pin ist. Der BOOT-Taster und sein
Testpunkt sind etwa 70 mm entfernt. Sie hängen hinter einem 1-kohm-Widerstand (R217),
der an der Leitung sitzt, neben dem Strap-Widerstand, sodass die 50-MHz-Leitung keinen
langen offenen Zweig hat. Bei gedrücktem Taster sieht der Pin 0,3 V.

Der Bestückungsdruck (`scripts/bootstrap/silk.py`) ist für die Person, die den Leser
offen vor sich hat.

- Bauteilbezeichner: wo immer einer neben sein Bauteil passt
  (`scripts/bootstrap/silk_refdes.py`): oberhalb, unterhalb oder neben dem Bauteil,
  aufrecht oder gedreht, auf keinem Pad (0,15 mm), keinem Bauteilkörper, keinem anderen
  Text (0,35 mm zwischen zwei Bezeichnern, damit Nachbarn nicht als ein Wort gelesen
  werden) und keinem Bestückungsdruck des Footprints. 143 der 262 Bauteile bekommen
  einen. Die anderen stehen dort, wo ein Bezeichner keinen Platz hat: um die Pins des
  MCU mit 0,35 mm Raster, an den Widerstands-Arrays, zwischen den Anpassteilen des
  NFC-Chips. Die Bestückungszeichnung (`fab/jlcpcb/attractap-touch-p4-assembly.pdf`)
  zeigt jeden Bezeichner, Pin 1 und die Polarität, mit Detailblättern von MCU, PHY,
  NFC-Chip und Leistungsteil im Maßstab 6 bis 9 : 1.
- Testpads TP816 bis TP830 (die Schienen, beide I2C-Busse, der RMII-Takt, die
  Versorgung des PHY) tragen jeweils den Kurznamen des Netzes (`VDC`, `5V_DC`,
  `5V_USB`, `5V_POE`, `VDD_FLASH`, `TVDD`, `AVDD`, `DVDD`, `BL_A`, `SDA`, `SCL`,
  `NFC_SDA`, `NFC_SCL`, `REF_CLK`, `PHY_3V3`), gesetzt von `silk.test_point_labels` an
  der ersten Seite des Pads, an der es nichts berührt. Die Pads stehen neben ihrer
  Schaltung statt in einer Reihe; die älteren (C5, P4 UART0, Versorgung) sind in
  beschrifteten Gruppen. TP831 (`3V3_WIFI`) ist die Schiene des WLAN-Moduls, neben
  seinem Wandler; TP832 (`GND`) ist das Massepad der C5-Gruppe, für die Klemme eines
  USB-Seriell-Adapters.

- Bestückungsseite, die Seite, die man sieht, wenn der Leser vom Dock ist:
  Testpunkte in benannten Gruppen (C5, P4 UART0, Versorgung), wie man in den
  Download-Modus kommt, die Grenzwerte der Steckverbinder, die Begrenzung der
  48-V-Seite, die LED-Nummern, wie die Firmware sie zählt, und ein weißes Feld von
  10 x 2 mm neben `S/N`: JLCPCB druckt eine von Platine zu Platine verschiedene
  Nummer in ein Feld dieser Größe, wenn die Bestellung es verlangt (siehe die
  [Übersicht](hardware/touch-p4/overview.md#bestellen-bei-jlcpcb)). Ein Leser, der
  zurückkommt, lässt sich so auch dann unterscheiden, wenn er nicht mehr startet. Die
  freie Fläche hinter der NFC-Spule trägt das Logo, den Namen und die Revision der
  Platine, eine kurze GPIO-Karte und wo die Dokumente liegen. Die Nummern der
  GPIO-Karte stammen aus der Schaltungsbeschreibung (`circuit_core.P4_GPIO`), sodass
  sie nicht von der Netzliste abweichen können.
- Displayseite, im fertigen Leser verborgen: die Montagehinweise für das Display (die
  vier Massepads, die Pins der Buchse zum Klemmen, welche davon 48 V führen), die
  LED-Nummern, das Schlüsselloch am Tap-Punkt und ein Hinweis für alle, die das Display
  abnehmen.
- Texte sind 1,0 mm hoch mit 0,15-mm-Linien. Der Build bricht ab, wenn ein Text auf
  einem Pad, auf einem anderen Text oder innerhalb von 0,3 mm vom Platinenrand liegt.
- Das Logo wird aus den Vektordateien in `case/logo/` gezeichnet. Das Maskottchen wird
  nicht verwendet: Nach den Markenregeln behält es seine natürlichen Farben, und ein
  Bestückungsdruck hat eine.

### Impedanz

Zwei Arten von Leitungen sind auf eine Impedanz gelegt, beide auf den äußeren Lagen,
jeweils über ihrer Massefläche (In1 unter der Bestückungsseite, In4 unter der
Rückseite):

- USB D+/D-: ein Via an jedem Ende, der Rest ein gekoppeltes Paar auf der Rückseite,
  0,14 mm breit mit 0,15 mm Spalt, beide Leitungen gleich lang mit gleich vielen Vias
  (`scripts/bootstrap/routes_signal.py`). USB 2.0 verlangt 90 ohm +-15 % zwischen den
  Leitungen; bei Full Speed (12 Mbit/s) würde sich eine Abweichung nicht zeigen, aber
  das Paar kostet nichts extra.
- Die zwei Ethernet-Paare vom PHY zur Buchse: 0,155-mm-Leitungen (je 50 ohm) am
  Pin-Raster der Buchse von 1,27 mm, 1,115 mm auseinander. Bei diesem Abstand, dem
  Elffachen der Höhe über der Fläche, koppeln die Leitungen kaum, sodass das Paar das
  Doppelte einer Leitung ist: 100 ohm, was 100BASE-TX verlangt (+-15 %).

| Leitung | Breite / Spalt (mm) | JLCPCB-Rechner | 2D-Feldlösung | Geschlossene Formel (TI SNLA187) |
|---|---|---|---|---|
| USB-Paar, differenziell | 0,14 / 0,15 | 90,4 ohm | 90,9 ohm | 91,9 ohm |
| Ethernet-Leitung einzeln | 0,155 | 50,3 ohm | 51,2 ohm | 48,9 ohm |
| Ethernet-Paar, differenziell | 0,155 / 1,115 (0,95 dort, wo das Sendepaar dem PoE-Pin ausweicht) | 100,1 ohm | 100,5 (Senden) / 99,1 (Empfangen) ohm | 97,8 ohm |

Quellen. Der Impedanzrechner von JLCPCB für seinen Lagenaufbau JLC06161H-3313 (sein
Berechnungsdienst mit den Eingaben der Webseite: Prepreg 3313, 0,0994 mm,
er 4,1; 1 oz Außenkupfer; Lötstopplack 1,0 mil auf dem Laminat und 0,6 mil auf dem
Kupfer, er 3,8; gelesen am 25. November 2026). Die 2D-Feldlösung ist
`sim/field2d.py` auf der gerouteten Platine: `pcb.sh simulate` misst Breite und Spalt
jedes Paares an seinen Leiterbahnen und löst den Querschnitt (ungerade Mode); ein
Leitungspaar mit 1,5 mm Abstand gegenüber dem Doppelten der Einzelleitung ist einer
ihrer Selbsttests. Die geschlossene Formel ist die Mikrostreifen- und
Edge-Coupled-Formel im LVDS Owner's Manual von TI (SNLA187, Abb. 5-1, S. 39), die den
Lötstopplack auslässt (der Lack senkt die Impedanz hier um 2 bis 3 ohm); die
Hammerstad-Jensen-Formel, ebenfalls ohne Lack, ergibt 53,3 ohm für die Einzelleitung.
Die Zahlen des Rechners sind die, die die Bestellung verwendet: Die Fertigungszeichnung
verlangt Impedanzkontrolle mit +-10 % bei diesen Zielwerten und lässt den Hersteller die
Breiten anpassen ([Übersicht](hardware/touch-p4/overview.md#bestellen-bei-jlcpcb)).

### Reserven zu den Grenzen von JLCPCB

Die kleinsten Strukturen der gerouteten Platine (`scripts/fab_margins.py`, das die
Platinendatei liest) gegenüber den veröffentlichten Fähigkeiten von JLCPCB für Platinen
mit sechs Lagen (https://jlcpcb.com/capabilities/pcb-capabilities, gelesen am 25.
November 2026; die Seite trägt kein eigenes Datum):

| Merkmal | Diese Platine | JLCPCB | Reserve | Warum es so steht |
|---|---|---|---|---|
| Leiterbahnbreite | 0,112 | 0,09 | +0,022 | Die Verengungen des Autorouters zwischen Pins mit feinem Raster; jede andere Leiterbahn ist 0,127 mm oder mehr |
| Leiterbahn zu Leiterbahn, Leiterbahn zu Pad | 0,127 (Regel; DRC sauber) | 0,09 | +0,037 | KiCads Regel für die ganze Platine |
| SMD-Pad zu Pad, zwei Netze | 0,150 | 0,15 | **0** | **An der Grenze**: das 0,35-mm-Raster des ESP32-P4 mit Espressifs 0,20-mm-Pads und die LGA-Pads des Beschleunigungssensors (U702). Die Eckpads des MCU sind beschnitten, um es einzuhalten (0,163 mm über jede Ecke) |
| Lötstopplack-Steg | 0,100 | 0,10 (grün, 1 oz) | **0** | **An der Grenze**, dieselben Pins: Lack 0,025 mm größer als jedes Pad. Grün ist die einzige Farbe mit einem 0,10-mm-Steg, daher verlangt die Bestellung Grün |
| Via, Loch / Durchmesser | 0,20 / 0,45 | 0,15 / 0,25; 0,20-Loch mit weniger als 0,45 mm kostet extra | 0,05 / 0,20; **0** bis zur Preisstufe | 0,45 / 0,2 ist das kleinste Via ohne Aufpreis |
| Via-Restring | 0,125 | (0,05 aus den obigen Via-Größen; 0,15 mm bevorzugt) | +0,075 | Die meisten Vias haben 0,5-mm-Pads; 137 davon behalten 0,45 mm, wo es keinen Platz gibt |
| Restring durchkontaktierter Löcher (Bauteile) | 0,155 (die Wärme-Vias des PN532, Teil seines Land Patterns) | 0,15 Minimum, 0,20 empfohlen | +0,005 zum Minimum, -0,045 zur Empfehlung | Die vier Vias im freiliegenden Pad des PN532, die sein Land Pattern als durchkontaktierte Pads zeichnet (0,3-mm-Loch); als Vias genommen, wie sie gefertigt werden, verlangt JLCPCB 0,05 mm. Von den Steckverbindern haben die Schirmpins der Ethernet-Buchse den kleinsten Ring, 0,199 mm (HanRuns Muster) |
| Loch zu Loch, Vias | 0,385 | 0,20 | +0,185 | |
| Loch zu Loch, Bauteillöcher | 0,69 | 0,45 | +0,24 | |
| Via-Loch zu Leiterbahn | 0,254 | 0,20 | +0,054 | KiCads Lochabstand ist auf den Wert von JLCPCB gesetzt; das engste Paar ist ein Ethernet-Via neben der nächsten Ethernet-Leitung im Via-Feld über dem MCU |
| Bauteilloch zu Leiterbahn | 0,31 (die Wärme-Vias des PN532 zu einer Leiterbahn auf In2) | 0,28 Minimum, 0,35 empfohlen | +0,03 zum Minimum, -0,04 zur Empfehlung | Dieselben Vias des PN532 (als Vias: 0,2 mm, +0,11). Steckverbinderlöcher halten 0,383 mm oder mehr ein (die Ethernet-Buchse) |
| Kupfer zum Platinenrand | 0,31 | 0,20 (gefräst) | +0,11 | Regel 0,3 mm |
| Bestückungsdruck-Linie | 0,15 | 0,15 | **0** | **An der Grenze**: das Kleinste von JLCPCB, gewählt, damit Beschriftungen und Bezeichner passen |
| Texthöhe des Bestückungsdrucks | 1,0 | 1,0 | **0** | **An der Grenze**, wie oben. Lesbarkeit, nicht Ausbeute, leidet, wenn der Druck verschmiert |
| Bestückungsdruck zu Pad | 0,15 (Generator) | 0,15 | **0** | **An der Grenze**: Der Generator hält genau das ein, was JLCPCB verlangt |
| Impedanztoleranz | +-10 % | +-10 % (+-5 % auf Anfrage) | 0 | Der Standard; USB und Ethernet brauchen bei ihren Geschwindigkeiten nicht mehr |

Jedes Merkmal an der Grenze gehört zu einer von drei Arten: das Land Pattern des MCU
(Pad-Abstand, Lötstopplack-Steg), das billigste Via und der Bestückungsdruck. Keines davon ist
ein Ausbeuterisiko der unbestückten Platine bei den angegebenen Fähigkeiten von
JLCPCB; der Pad-Abstand und der Lötstopplack-Steg sind diejenigen, die man bei den ersten
Platinen ansehen sollte (Lötbrücken am MCU, die AOI und Röntgen der Bestückung finden
würden).

### Schaltwandler: Hot Loops

Die Schleife, die den geschalteten Strom jedes Wandlers führt, gemessen auf der
gerouteten Platine von `scripts/layout_report.py`: für einen Abwärtswandler vom
Eingangskondensator zum VIN-Pin des ICs und zurück von seinem Massepad zum GND-Pin des
ICs; für den Backlight-Aufwärtswandler von der Kathode der Diode zum Ausgangskondensator
und zurück zum GND-Pin des ICs. Die Hersteller verlangen den Kondensator direkt an
diesen Pins und einen kleinen Schaltknoten.

| Wandler | Kondensator | Versorgungsseite (Kupferpfad) | Masseseite (gerade, durch die Füllung) | Schleifenfläche | Masse-Vias innerhalb 1 mm (IC-GND-Pin + Kondensator) | Schaltknoten-Kupfer |
|---|---|---|---|---|---|---|
| U104 AP63205, DC-Eingang auf 5 V | C113 2,2 uF | 3,8 mm | 2,4 mm | 6,3 mm2 | 1 + 1 | 10,1 mm2 |
| U103 TLV62569, 5 V auf 3,3 V | C107 100 nF | 1,0 mm | 3,9 mm | 2,6 mm2 | 0 + 1 | 7,4 mm2 |
| U302 TLV62569, 5 V auf 3,3 V für das WLAN-Modul | C305 100 nF | 1,4 mm | 5,1 mm | 1,1 mm2 | 0 + 1 | 7,4 mm2 |
| U202 TLV62569, 3,3 V auf 1,1 V | C232 10 uF | 2,1 mm | 4,6 mm | 1,3 mm2 | 1 + 1 | 3,7 mm2 |
| U601 AP3032, Backlight-Aufwärtswandler | C606 1 uF | 2,5 mm | 5,2 mm | 0,3 mm2 | 0 + 1 | 5,5 mm2 |

Jede Schleife schließt sich auf der Bestückungsseite: Das Massepad des Kondensators
und der GND-Pin des ICs liegen in einem Stück Massefüllung, mit In1 (Masse) direkt
darunter. Die Schleifen sind einige Quadratmillimeter groß, die Schaltknoten nicht
größer als der IC-Pin, das Spulen-Pad und die Leiterbahn dazwischen. U103, U302 und
U601 haben kein Via an ihrem GND-Pin: Im SOT-23 sitzt der GND-Pin zwischen dem
Schaltpin und dem Pad der Spule, ohne Platz für eines; ihre Masse erreicht In1 über das
Via des Kondensators und die Füllung (U302 auch über ein Via zwischen seinen
Pad-Reihen, 1,3 mm vom Pin).

### Abblockung und Quarz am MCU

Kupferweg von jedem Versorgungspin des ESP32-P4 zum nächsten Kondensator, entlang
von Leiterbahnen, Via-Hülsen und Flächen (`scripts/layout_report.py` auf der
verlegten Platine), gegen die Ziele des Reviews: 3 mm für die Pins von Core,
Speicher, Regler, Analogteil, USB-PHY und Batterie, 5 mm für die 3,3-V-IO-Pins.
„24 Nov“ ist die Platine vor Review-Stufe 3.

| Pin | Versorgung | Ziel | 24 Nov | Jetzt | Kondensator |
|---|---|---|---|---|---|
| 9 | VDD_LP | 5 | 8,1 | 8,0 | C206 |
| 21 | VDD_IO_0 | 5 | 8,7 | 9,4 | C203 |
| 26 | VDD_HP_0 | 3 | 9,5 | 10,2 | C219 |
| 30 | VDD_FLASHIO | 3 | 9,4 | 9,2 | C224 |
| 51 | VDD_USBPHY | 3 | 4,2 | 4,4 | C216 |
| 54 | VDD_HP_1 | 5 | 6,8 | 6,9 | C220 |
| 59 | VDD_PSRAM_0 | 3 | 13,8 | 13,7 | C226 |
| 62 | VDD_IO_4 | 5 | 9,8 | 9,7 | C204 |
| 67 | VDD_PSRAM_1 | 3 | 11,0 | 10,9 | C226 |
| 71 | VDDO_FLASH | 3 | 3,5 | 3,6 | C223 |
| 72 | VDDO_PSRAM | 3 | 3,2 | 3,3 | C226 |
| 73 | VDDO_3 | 5 | - | **3,5** | C230 |
| 74 | VDDO_4 | 3 | 4,6 | 4,6 | C231 |
| 75 | VDD_LDO | 3 | 9,2 | 5,8 | C208 |
| 76 | VDD_HP_2 | 3 | 6,1 | 9,1 | C221 |
| 77 | VDD_DCDCC | 3 | 9,0 | **2,0** | C208 |
| 85 | VDD_IO_5 | 5 | 8,4 | 7,0 | C208 |
| 91 | VDD_HP_3 | 3 | 1,3 | **1,4** | C222 |
| 96 | VDD_IO_6 | 5 | 1,2 | **1,3** | C206 |
| 101 | VDD_ANA | 3 | 6,2 | 6,1 | C206 |
| 102 | VDD_BAT | 3 | 3,2 | 3,4 | C214 |

Fett: innerhalb des Ziels. Die Spalte „24 Nov“ wurde gemessen, bevor der Report
eine Leiterbahn, die auf einer anderen Leiterbahn endet (eine T-Verbindung), als
verbunden zählte, sodass ein Wert dort etwas zu lang ausfallen kann. Zwei Pins
haben verloren: VDD_HP_2 (76) gab seinen kurzen Weg zum Eckkondensator auf und
erreicht C221 über die Kupferfläche der Core-Schiene; VDD_HP_0 (26) läuft wie
zuvor über sein Via, die Rückseitenlage und das Via an C219.

Was die Bestückungsseite zulässt:

- Die obere Kante hat sieben Versorgungspins in einer Reihe (71 bis 77, 2,1 mm).
  Ein 0402-Kondensator ist 0,64 mm breit und braucht 0,4 mm daneben für eine
  Leiterbahn. Pro 1,05 mm Pad-Reihe in Reichweite passt also ein Kondensator:
  drei der sieben, wenn die Pins dazwischen einen anderen Weg nach außen hätten.
  Sie haben ihn nicht: Nur jeder zweite Pin kann ein Via innerhalb der Pad-Reihe
  haben (0,35 mm Raster, 0,45-mm-Vias), und der Streifen über der Reihe nimmt
  die Leiterbahnen derjenigen der sieben auf, die nach oben führen. Hier
  umgestellt: Die 10 uF von VDD_DCDCC sitzen in der Ecke neben Pin 77 (2 mm
  Leiterbahn, Masse über ein Via in ihrem Pad). Damit liegen auch 10 uF
  innerhalb von 6 mm von VDD_LDO; VDDO_4 und VDD_HP_2 verlegt das Skript.
- Die anderen Kanten tragen die Ausgänge: die zwanzig Displaysignale an der
  unteren Kante, die SDIO-, NFC- und Quarzleitungen links, der Flash rechts,
  Ethernet und UART oben. Ein Kondensator dort nimmt einem Signal seinen
  einzigen Weg nach außen (siehe „Verwendete Layout-Regeln“).
- Die Pins, die das Ziel verfehlen, erreichen ihre Kondensatoren über das Via
  innerhalb der Pad-Reihe und die Fläche (3,3 V auf In3, die Core-Schiene auf der
  Rückseitenlage). Der Weg zählt das als zwei Via-Hülsen und den Weg durch die
  Fläche. Simuliert beträgt der Anteil der Platine an der Impedanz von einem Pin
  zu seinen Kondensatoren 1,2 bis 2,4 nH („Simulation“), etwa so viel, wie das
  Gehäuse des Chips selbst beiträgt.

Zwei Wege, jedes Ziel zu erreichen, wurden geprüft; Revision A nimmt keinen
davon (siehe „Akzeptierte Abweichungen“):

- 0201-Kondensatoren auf der Bestückungsseite. Sie sind 0,3 mm schmaler als
  0402, aber nicht das Bauteil begrenzt die Pad-Reihe: Ein Kondensator braucht
  seine eigene Leiterbahn aus der Reihe, und bei 0,35 mm Raster kann nur jeder
  zweite Pin ein Via innerhalb der Reihe haben. Nach außen nehmen die Ausgänge
  den Platz (siehe oben). Ein 0201 ist bei JLCPCB ein Extended-Bauteil (kein
  0201-Kondensator ist ein Basic-Bauteil). Er würde also eine Bestückungsgebühr
  hinzufügen und den Weg keines Pins ändern.
- 0201-Kondensatoren auf der Rückseite, jeder auf dem Via seines Pins innerhalb
  der Pad-Reihe: etwa 2,3 mm Weg für jeden Pin (die Leiterbahn des Pins zum Via,
  die Hülse durch die Platine, das Pad des Kondensators). Das erfordert
  Bestückung auf beiden Seiten (51,12 statt 25,56 USD Einrichtung und 16,42
  statt 8,21 USD Schablone, etwa 34 USD mehr pro Bestellung; JLCPCB-Hilfeartikel
  „PCB Assembly Cost“, gelesen am 25. November 2026), und die Bauteile lägen 1,5
  mm vor der geerdeten Metallrückseite des Displays. Die Platine bliebe für die
  Bestückung einseitig.

Quarz Y201: ein 40-MHz-Quarz mit 2,0 x 1,6 mm (Hosonic E1SB40E00001AE, LCSC
C2689435; zweite Quelle Tai-Saw TZ1269D, C501798, gleiche Pads und Last) anstelle
des Bauteils mit 3,2 x 2,5 mm, und ohne die beiden 0-Ohm-Brücken, die in seinen
Leitungen standen. XTAL_N 6,8 mm und XTAL_P 6,5 mm Leiterbahn von den Pins zu den
Pads des Quarzes (zuvor 8,1 und 10,6 mm; Ziel 5 mm).

- Anforderungen von Espressif (ESP32-P4 Hardware Design Guidelines, Release
  master vom 12. November 2026, Abschnitt 1.3.5 „Clock Source“): „The ESP32-P4
  firmware only supports 40 MHz crystal“ und „the accuracy of the selected
  crystal should be within ±10 ppm“. Das Hosonic-Bauteil hat ±10 ppm bei 25 °C
  und ±10 ppm von -30 bis +85 °C; das Tai-Saw-Bauteil ±5 ppm und ±15 ppm von -40
  bis +85 °C (Datenblätter der Hersteller). Espressif nennt keine ESR-Grenze für
  den 40-MHz-Quarz des P4: Die Richtlinie nennt eine nur für den optionalen
  32,768-kHz-Quarz (70 kOhm), und das Datenblatt des P4 (v0.7) hat keine
  Quarztabelle. Beide Bauteile haben einen ESR von höchstens 40 Ohm, wie das
  Bauteil mit 3,2 x 2,5 mm, das sie ersetzen, und eine Treiberleistung von
  höchstens 100 uW.
- Lastkondensatoren nach Espressifs Formel CL = C1 x C2 / (C1 + C2) + Cstray
  (gleicher Abschnitt): CL 9 pF, Cstray auf 3 pF geschätzt (die Pins, etwa 7 mm
  Leiterbahn und die Pads), also C1 = C2 = 2 x (9 - 3) = 12 pF, C0G (C238, C239,
  die zuvor bestückten Werte). Espressifs eigene Platine setzt etwa 4 pF
  Streukapazität voraus (15-pF-Quarz mit 22-pF-Kondensatoren); mit 4 pF
  bräuchte der Quarz 10 pF. Die Richtlinie sagt, die Werte müssten „need to be
  further adjusted after an overall test“: Der Inbetriebnahmeplan misst die
  Frequenz und geht auf 10 pF, wenn sie zu niedrig ist.
- Layout (Abschnitt 1.4.2 „Crystal“): „The gap should be at least 4.5 mm“ zum
  Takt-Pin; „no vias for the clock input and output traces“; die
  Lastkondensatoren „on the two sides of the crystal ... at the end of the clock
  trace“; kein Signal unter dem Quarz. Der Quarz ist um 45 Grad gedreht, sodass
  seine beiden Quarz-Pads den beiden Pins zugewandt sind und die Leitungen auf
  beiden Seiten seines Masse-Pads vorbeilaufen; sein Gehäuse steht 4,75 mm vom
  Rand des Chips. Kein Via in einer der beiden Leitungen, die Lastkondensatoren
  an den fernen Enden mit ihren Masse-Pads am Masse-Pad des Quarzes, und eine
  Sperrfläche für Leiterbahnen unter dem Quarz auf jeder anderen Lage. Die
  Leitungen laufen auf der Bestückungsseite über ungeteilter Masse (In1) mit der
  Massefüllung daneben.
- Warum nicht 5 mm: Allein der Abstand von 4,5 mm nimmt den größten Teil davon,
  und der Platz ist festgelegt zwischen den vier Vias der NFC-Leitungen darüber
  und den VDD_BAT-Bauteilen darunter. Die beiden Signal-Pads eines Quarzes mit
  vier Pads liegen auf einer Diagonale, sodass jede Leitung am Masse-Pad
  vorbeimuss, das zwischen ihnen steht.

## Kosten

Bauteile bei JLCPCB pro Platine, in USD, Preise vom November 2026:

| | 5 Platinen | 100 Platinen |
|---|---|---|
| WLAN-Version | 27,90 | 19,80 |
| Ethernet/PoE-Version | 38,70 | 27,60 |

Die Tabelle stammt von vor dem Design-Review. Das Review fügte Bauteile im Wert
von etwa 0,3 USD pro Platine hinzu (Eingangsfilter, drei Widerstände, ein
weiterer Pegelwandler) und eine Extended-Bauteilzeile, den Summerwiderstand. Die
Manipulationssensoren fügen etwa 2,7 USD pro Platine hinzu (Beschleunigungssensor
0,89, Näherungssensor 1,57, Hall-Schalter 0,17, fünf Kondensatoren, zwei
Widerstände) und drei Extended-Bauteilzeilen; das Dock braucht einen Magneten für
wenige Cent. Der Wechsel auf den ESP32-C5 fügt ab 100 Stück etwa 0,4 USD hinzu
(das Modul 0,16, sein Wandler 0,22) und keine neuen Zeilen; die externe Antenne,
die das C6-MINI-1U brauchte und die nie in der Tabelle stand, wird nicht mehr
gekauft.

Die Tabelle gilt nur für die Bauteile. Die unbestückten Platinen, aus dem
Bestellformular von JLCPCB vom 21. November 2026 (86 x 143,5 mm, 1,6 mm, grün,
langsamste Fertigungszeit, ohne Versand und Steuer), in USD pro Bestellung:

| Platinen | Vier Lagen, ENIG | Sechs Lagen, ENIG | Sechs Lagen, OSP | Sechs Lagen mit ENIG, pro Platine |
|---|---|---|---|---|
| 5 | 50,70 | 59,00 | 41,00 | 11,80 |
| 10 | 59,70 | 68,40 | 49,00 | 6,84 |
| 30 | 95,90 | 106,00 | 80,80 | 3,53 |
| 50 | 132,00 | 143,60 | 112,70 | 2,87 |
| 100 | 208,50 | 253,50 | 208,30 | 2,54 |

Die Preise stammen aus dem von Hand ausgefüllten Formular, ohne die
Gerber-Dateien, sodass JLCPCBs Prüfung der Dateien sie noch ändern kann. Sechs
Lagen kosten bis 50 Platinen 8 bis 12 USD mehr pro Bestellung und bei 100 45 USD
mehr (0,45 USD pro Platine). Sie brauchen 7 bis 9 Werktage Fertigung, vier Lagen
3 bis 6.

Die Vias kosten nichts extra. Die Formularoption „Min via hole size/diameter“
berechnet Löcher unter 0,3 mm, aber ihr Hinweis sagt, dass bei Platinen mit
Innenlagen ein 0,2-mm-Loch kostenlos ist, wenn das Via 0,45 mm oder breiter ist,
und das ist das kleinste Via der Platine. Die Option bleibt bei
„0.3mm/(0.4/0.45mm)“. Wer dort „0.2mm/(0.3/0.35mm)“ wählt, zahlt bei 5 Platinen
39 USD und bei 100 91 USD mehr (die Option selbst, TG155-Material und ein
Vierdrahttest).

ENIG macht bei 5 Platinen 18 USD des Preises aus und bei 100 45 USD. OSP, das
JLCPCB kostenlos anbietet und für sechs Lagen wählt, wenn nichts anderes
angegeben ist, ist so eben wie ENIG und nimmt auch den MCU mit 0,35 mm Raster.
Aber es schützt das Kupfer nur, bis es gelötet wird, und JLCPCB schließt es für
Kontaktflächen aus. Die Platine hat solche: die vier blanken Masse-Pads für die
Metallrückseite des Displays, auf der Seite ohne Bauteile, wo die Bestückung sie
nicht verzinnen kann, und die 30 Testpunkte, von denen vier das erste Flashen
des WLAN-Moduls tragen. Unbestückte Platinen mit OSP halten sich außerdem nur
drei Monate, und nach dem Auspacken etwa eine Woche. Die Platine bleibt bei
ENIG.

Die Platine in eine kleine Sechslagenplatine für den MCU (45 x 45 mm: 48,80 USD
für 5, 97,10 USD für 100) und einen Träger mit weniger Lagen (vier Lagen: 50,70
und 208,50 USD; zwei Lagen: 28,00 und 148,70 USD) aufzuteilen, lohnt sich nicht.
Mit einem Vierlagenträger kosten die beiden Platinen bei jeder Menge mehr als
die eine Sechslagenplatine. Mit einem Zweilagenträger kosten sie bei 5 Platinen
mehr und bei 100 0,08 USD weniger pro Leser, vor dem Steckverbinderpaar zwischen
den Platinen und der zweiten Bestückungsbestellung.

Einmal pro Bestellung berechnet JLCPCB 3 USD für jede Extended-Bauteilzeile (50
Zeilen bei der WLAN-Version, 57 bei der Ethernet/PoE-Version nach seinem Katalog
vom 25. November 2026, mit dem Strompfad von Review-Stufe 3; bevorzugte Bauteile
nicht mitgezählt), die Einrichtungs- und Schablonengebühren, die unbestückten
Platinen und den Versand. Bei fünf Platinen machen allein die Gebühren für
Extended-Bauteile 30 bis 34 USD pro Platine aus, sodass eine kleine
Prototypenbestellung pro Platine weit mehr kostet, als die Tabelle zeigt.

Die größten Zeilen sind der ESP32-P4 (6,15), der PN532 (5,89), das WLAN-Modul
(4,19) und der Flash (2,26); bei der Ethernet/PoE-Version außerdem das
PoE-Modul (6,70), die Buchse (2,60) und der PHY (1,03).

Das WLAN-Modul ist jetzt das ESP32-C5-MINI-1-N4-V1.2 (C54951860): 4,90 USD für
eines, 3,78 ab 30 Stück, 3,36 ab 100 (JLCPCB, 25. November 2026), gegenüber
4,13, 3,42 und 3,20 für das ESP32-C6-MINI-1U-H4, mit dem die Tabelle erstellt
wurde. Sein eigener 3,3-V-Wandler fügt ab 100 Stück etwa 0,22 USD hinzu
(TLV62569, 2,2 uH, 22 uF, 10 uF und Kleinteile, alle schon Zeilen der
Stückliste). Es kommt keine Antenne und kein Kabel mehr hinzu.

Einsparungen, die geprüft und nicht übernommen wurden:

| Änderung | Spart pro Platine | Warum jetzt nicht |
|---|---|---|
| 16-MB-Flash GD25Q128ESIG (C2758105) statt des Winbond-Bauteils | 0,5 bis 0,8 | Es ist ein Extended-Bauteil, die Gebühr frisst die Einsparung also unterhalb von etwa zehn Platinen auf. Gleiches Footprint: eine Änderung der LCSC-Nummer. |
| DC-Buchse DC-005C-20A (C84007, 24 V, 3 A) statt der CUI PJ-002A | 0,8 | Ihre Pins stehen 6,65 mm statt 6,0 mm auseinander, das Footprint braucht also breitere Langlöcher. |
| Generischer 40-poliger Displaysteckverbinder statt des Hirose FH12 | etwa 0,4 | Andere Lötlaschen: eine Footprint-Änderung am dichtesten Steckverbinder der Platine. |
| Lesechip der RC522-Familie (FM17580, Si522, MFRC522-Zweitquellen, 0,3 bis 1 USD) statt des PN532 | etwa 5 | Diese Chips sind nur das Funk-Frontend. Die Firmware bräuchte einen neuen Treiber, der das Protokoll ISO 14443-4 enthält, das der PN532 selbst ausführt, und die Platine ein neues Anpassnetzwerk. |
| USB-Schutz SRV05-4-P-T7 (C85364, ein bevorzugtes Bauteil) statt des USBLC6-2SC6 | 3 USD pro Bestellung (eine Extended-Zeile weniger) | Gleiches Gehäuse, und die Verdrahtung der Platine passt dazu: Es hat vier Leitungen, wo der USBLC6 zwei hat, und jede USB-Leitung geht schon an zwei Pins. Aber es ist das Bauteil eines anderen Herstellers am einen Steckverbinder, den ein ESD-Test trifft, und sein Winkel in JLCPCBs Bibliothek ist ungeprüft. |

Wo ein Bauteil in JLCPCBs Basic- oder Preferred-Liste ein Äquivalent hat,
verwendet das Design dieses (die TVS-Dioden von USB und PoE, die
Verpolschutzdiode des DC-Eingangs, 1 uF / 50 V). Der Teiler des Core-Wandlers
ist der 499 k, den Espressifs Checkliste verlangt, ein Extended-Bauteil wie der
510 k, der zuvor bestückt war. Die einzige Ausnahme sind die drei Kondensatoren
des DC-Eingangs: Das Basic-Bauteil 10 uF / 50 V passt auf ihre Pads und ist dort
das falsche Bauteil (siehe „Stromversorgung“). Die fünf anderen Extended-Passivbauteile
(39 pF, 180 pF und 220 pF der NFC-Anpassung, 1,5 Ohm und 6,19 k) haben kein
Basic- oder Preferred-Bauteil mit gleichem Wert: Die Bauteile mit diesen Werten
in der Serie, aus der die Basic-Bauteile stammen, sind ebenfalls Extended-Bauteile
(nachgeschlagen am 22. November 2026). Drei der fünf (39 pF, 180 pF, 1,5 Ohm)
sind Abstimmwerte, die die ersten Platinen ohnehin ändern werden. Die 10 pF der
Anpassung sind ein Basic-Bauteil und die 3,9 k des Empfangsteilers ein
bevorzugtes (nachgeschlagen am 24. November 2026).

Der Strompfad von Review-Stufe 3 brachte eigene Extended-Zeilen: den eFuse, den
Ideal-Dioden-Controller und seinen MOSFET, den Supervisor, die zwei TVS des
DC-Eingangs (SMBJ28A, SMBJ28CA), den 47-uF-Elektrolytkondensator, die drei
0,1-%-Dünnschichtwiderstände des eFuse-Teilers sowie 1,65 k, 22,1 k und 2,2 nF
(nachgeschlagen am 25. November 2026). Ob für die letzten drei ein Basic-Bauteil
mit gleichem Wert existiert, wurde nicht nachgeschlagen. Der 3,3-V-Wandler fügt
keine Zeile hinzu: Er ist das Bauteil des Core-Wandlers.

## Beschaffungsrisiken

Die Bestandszahlen sind die von JLCPCB vom 22. November 2026. Jede Zeile beider
Stücklisten wurde an diesem Tag nachgeschlagen; die hier nicht genannten Zeilen
haben mehr als 2000 Stück.

| Bauteil | Risiko |
|---|---|
| ESP32-P4NRW32X | Kein Bestand bei JLCPCB oder LCSC. Muss vor der Bestückung eingekauft werden. Das X-Bauteil (Silizium v3.x) verwenden; das Bauteil ohne X ist abgekündigt. |
| PN532 | Bestückt ist der Tokmas PN5321A3HN (C53457895, etwa 6 USD, 123 am Lager): gleiches Gehäuse und gleiche Pinbelegung wie das NXP-Bauteil, aber sein Datenblatt sagt nichts über die enthaltene Firmware, und er ist mit unserer noch nicht erprobt. Falls er sich falsch verhält, passt das NXP-Original (C28925, etwa 13 USD, nicht am Lager) auf dieselben Pads. JLCPCBs Bibliothek zeichnet die beiden Bauteile um eine Vierteldrehung versetzt: Die Platzierungsdatei korrigiert den Winkel für das Tokmas-Bauteil und für kein anderes, also nach einer Änderung der Teilenummer `check-footprints` ausführen. NXP lenkt Neuentwicklungen auf den PN7160. |
| DP9900M-5V | 38 am Lager, zehn weniger als zwei Tage zuvor. Vom Silvertel Ag9905 passen nur die Typen Ag9905-M und Ag9905-MT auf das Footprint; die Ag9905-MTB und -LPB, die Silvertel bevorzugt, haben fünf Pins in anderer Reihenfolge. JLCPCB führt keinen Ag9905. |
| DC-Buchse PJ-002A (J102), Induktivität CKCSA252012-2.2uH/M (L103, L201, zwei pro Platine) | 1022 und 1171 am Lager: genug für eine erste Bestellung, knapp für eine Serie. |
| Induktivität CKCSA4020-6.8uH/M (L102) | 2228 am Lager, aber JLCPCBs Bibliothek hat kein Footprint für diese Teilenummer, sodass `check-footprints` sie nicht vergleichen kann. Sie teilt ihr 4 x 4 mm großes Footprint mit L101, hat zwei Pads und keine Polarität. In der Platzierungsvorschau ansehen. |
| Displaypanel | Handelsware ohne garantierte Teilenummer. Mit dem Lieferanten einen festen Typ vereinbaren. |
| ESP32-C5-MINI-1-N4-V1.2 (U301, WLAN-Modul) | 614 am Lager am 25. November 2026, das einzige lagernde C5-Modul mit Leiterplattenantenne; vom ESP32-C5-WROOM-1 keines. Seine Alternativen hatten keinen Bestand (parts.md). |

Der 3,3-V-Wandler U103 war ein AP63203WU-7, von dem JLCPCB zwei Stück hatte und
LCSC keines. Es ist jetzt ein TLV62569DBVR, das Bauteil des Core-Wandlers U202,
mit 490416 am Lager am 25. November 2026.

## Akzeptierte Abweichungen

Ziele des Industry-Reviews, die Revision A nicht vollständig erfüllt, weil ihre
Erfüllung mehr kosten würde, als sie wert sind, oder weil die Platine keinen
Platz dafür hat. Jede ist entschieden, nicht vergessen: was das Ziel war, was die
Platine erreicht, warum sie dort aufhört, was die Lücke abdeckt und was eine
spätere Revision tun kann. Alles andere im Review erfüllt sein Ziel.

### Abblockung am MCU (Review-Punkt 5.3)

- **Ziel.** Ein Kondensator innerhalb von 3 mm Kupfer (Via eingeschlossen) an
  jedem Versorgungspin der Versorgungen von Core, Speicher, Regler, Analogteil,
  USB-PHY und Batterie (VDD_HP, VDD_PSRAM, VDD_FLASH, VDDO_4, VDD_USBPHY,
  VDD_BAT, VDD_LDO, VDD_DCDCC, VDD_ANA), innerhalb von 5 mm für die
  3,3-V-IO-Pins; 10 uF nahe VDD_LDO und VDD_DCDCC.
- **Erreicht.** 4 der 21 Pins (Tabelle in „Abblockung und Quarz am MCU“):
  VDD_DCDCC 2,0 mm mit seinen 10 uF, VDD_HP_3 1,4 mm, VDD_IO_6 1,3 mm, VDDO_3
  3,5 mm (Ziel 5). Die anderen 3,3 bis 13,7 mm; VDD_LDO hat die 10 uF bei 5,8 mm.
- **Warum.** Der ESP32-P4 hat 21 Versorgungspins mit 0,35 mm Raster. Nur jeder
  zweite Pin kann ein Via innerhalb der Pad-Reihe haben, nach außen passt ein
  Kondensator pro 1,05 mm Reihe, und die Signale brauchen diesen Platz, um
  herauszukommen. 0201-Bauteile auf der Bestückungsseite ändern daran nichts
  (die Reihe, nicht das Bauteil, ist die Grenze), und auf der Rückseite
  bräuchten sie Bestückung auf beiden Seiten, etwa 34 USD mehr pro Bestellung:
  Die Platine bleibt für die Bestückung einseitig (entschieden am 25. November
  2026).
- **Abhilfe.** Die Pins erreichen ihre Kondensatoren über das Via innerhalb der
  Pad-Reihe und die Flächen (3,3 V auf In3, die Kupferfläche der Core-Schiene
  auf der Rückseite). Simuliert beträgt der Anteil der Platine an der Impedanz
  von einem Pin zu seinen Kondensatoren 1,2 bis 2,4 nH, etwa so viel, wie das
  Gehäuse des Chips selbst beiträgt („Simulation“). Der Inbetriebnahmeplan
  führt eine Stunde lang einen CPU- und PSRAM-Stresstest mit vollem Takt aus,
  kalt und warm im Gehäuse, mit den Versorgungen am Oszilloskop
  (Inbetriebnahmeplan, „MCU“, Schritt 5).
- **Spätere Revision.** 0201-Kondensatoren auf der Rückseite, jeder auf dem Via
  seines Pins (etwa 2,3 mm für jeden Pin), mit einer Polyimidfolie zwischen
  ihnen und der Metallrückseite des Displays; oder der P4 in einem Modul.

### Länge der Quarzleiterbahn (Review-Punkt 5.5)

- **Ziel.** Höchstens etwa 5 mm Leiterbahn von jedem Quarzpin zum Quarz.
- **Erreicht.** XTAL_N 6,8 mm, XTAL_P 6,5 mm mit einem 2,0 x 1,6 mm großen Quarz
  und ohne Brücken in den Leitungen (zuvor 8,1 und 10,6 mm).
- **Warum.** Espressifs Layout-Leitfaden verlangt mindestens 4,5 mm zwischen dem
  Quarz und den Takt-Pins, was den größten Teil der 5 mm nimmt. Der Platz ist
  festgelegt zwischen den Vias der NFC-Leitungen darüber und den
  VDD_BAT-Bauteilen darunter, und die beiden Signal-Pads des Quarzes liegen auf
  einer Diagonale, sodass jede Leitung am Masse-Pad dazwischen vorbeiläuft.
- **Abhilfe.** Keine Vias, Massefüllung auf beiden Seiten und ungeteilte Masse
  darunter, keine Leiterbahn unter dem Quarz auf irgendeiner Lage. Die längere
  Leiterbahn fügt etwa 0,3 pF hinzu, innerhalb der 3 pF Streukapazität, für die
  die Lastkondensatoren bemessen sind. Der Inbetriebnahmeplan misst die
  Frequenz, und die Lastkondensatoren werden geändert, wenn sie abweicht
  (Inbetriebnahmeplan, „MCU“, Schritt 3).
- **Spätere Revision.** Die Vias der NFC-Leitungen nach links und den Quarz bis
  auf 5 mm nach oben verschieben, mit neuer Verlegung dieser Ecke.

### Strom aus einer reinen USB-Versorgung (Review-Punkt 2.4)

- **Ziel.** Den Strom lesen, den die USB-C-Quelle anbietet (ihr CC-Pegel), und
  die Platine darauf begrenzen.
- **Erreicht.** Eine feste Grenze: Die Firmware weiß, wann USB die einzige Quelle
  ist (DC und PoE am IO-Expander vorhanden) und hält die Platine dann innerhalb
  von 500 mA, dem Kleinsten, das irgendeine Quelle anbietet (geschätzt 0,43 A).
- **Warum.** Die freien ADC-Pins liegen auf der anderen Seite des MCU, und es
  blieb kein Weg zum USB-C-Steckverbinder, ohne das USB-Paar, die
  Hintergrundbeleuchtungsleitung oder den RMII-Bus neu zu verlegen.
- **Abhilfe.** Eine harte Firmware-Anforderung mit einem Inbetriebnahmetest
  (firmware-port.md, Regel 19; Inbetriebnahmeplan, „Stromquellen“). Ohne die
  Firmware begrenzt der eFuse den Strom auf 1,8 bis 2,2 A, und eine Quelle, die
  ihn nicht liefern kann, schützt sich selbst.
- **Spätere Revision.** CC1/CC2 an zwei ADC-Pins, sodass eine Quelle mit 1,5 A
  oder 3 A die Platine mit voller Helligkeit betreiben kann.

### Merkmale an den Grenzen von JLCPCB (Review-Punkt 6.2)

- **Ziel.** Nichts an der Grenze der Fertigung, es sei denn, der Raster des
  Bauteils erzwingt es.
- **Erreicht.** Fünf Merkmale an der Grenze, keines mit negativer Reserve
  (Tabelle in „Reserven zu den Grenzen von JLCPCB“): die Pad-Lücke und der Lötstoppsteg
  am MCU mit 0,35 mm Raster und am LGA des Beschleunigungssensors sowie die
  Linienbreite, die Texthöhe und der Abstand zu Pads beim Bestückungsdruck.
- **Warum.** Espressifs Land Pattern für den P4 legt die Pad-Lücke und den Steg
  fest; der Bestückungsdruck liegt an JLCPCBs Minimum, damit die Bezeichner
  überhaupt passen.
- **Abhilfe.** Grüner Lötstopplack, die einzige Farbe mit einem Steg von 0,10 mm;
  die AOI und das Röntgen der Bestückung suchen am MCU nach Brücken; die ersten
  Platinen werden geprüft (Inbetriebnahmeplan).
- **Spätere Revision.** Keine nötig, es sei denn, die ersten Platinen zeigen
  Brücken.

### Platzierung der WLAN-Antenne (Review-Punkt 9.3)

- **Ziel.** Espressifs Platzierung für ein Modul mit Leiterplattenantenne
  (ESP32-C5 HDG 1.4.7, Abbildungen 22 und 23): die Antenne über den Platinenrand
  hinaus oder über einem Ausschnitt auf beiden Seiten und darunter mit
  mindestens 15 mm auf der Seite des offenen Endes; der Massepunkt der Antenne
  innerhalb von 1 mm von einer Platinenkante, an einer Ecke (nur die rechten
  Ecken sind für dieses Modul angehakt); 15 mm freier Raum rund um die Antenne
  im Gehäuse.
- **Erreicht.** Das Modul an der oberen Kante, seine Antenne über einem
  Ausschnitt von 6,0 mm Tiefe von x 8,6 bis 37,5: 11,5 mm hinter dem offenen
  Ende, 2 mm hinter dem Massepunkt, der Boden des Ausschnitts 0,15 mm über der
  unteren Grenze der Antenne; kein Kupfer auf irgendeiner Lage innerhalb von
  15 mm daneben (Sperrfläche x 0 bis 50,5). Der Massepunkt liegt auf der
  Innenseite der Platine, 51 mm vom rechten Rand. Im Gehäuse 1,8 mm zur oberen
  Wand und 4,7 mm zur Vorderwand. Im Vollwellenmodell, im Gehäuse mit dem
  Display, strahlt der Platzhalter -3,0 / -3,5 / -4,1 dB der eingespeisten
  Leistung bei 2,4 GHz (Kanäle 1, 7, 13) und -3,8 / -2,5 / -4,0 dB bei 5,18 /
  5,50 / 5,70 GHz, gegenüber -1,1 / -1,1 / -1,2 und -9,3 / -5,0 / -3,2 dB an
  Espressifs Position 3: innerhalb von 3 dB in jedem Kanal („WLAN-Antenne“,
  Vollwellentabelle).
- **Warum.** Position 3 ist die obere rechte Ecke der Platine, wo USB-C, sein
  eFuse-Pfad, sein ESD-Bauteil und ein Montageloch sitzen und das USB-Paar
  beginnt: Sie zu verschieben würde das impedanzkontrollierte USB-Paar neu
  verlegen und den Schraubdom des Gehäuses verschieben (Review-Punkte 5.2, 4.5
  und 2.3, heute bei A-). Über den Rand hinaus bräuchte die Antenne ein um 7 mm
  höheres Gehäuse. 15 mm Abstand passen nicht in ein Gehäuse mit 1,5 mm zu
  seinen Wänden. Das obere linke Montageloch stoppt den Ausschnitt bei 11,5 mm.
- **Abhilfe.** Der Ausschnitt auf beiden Seiten und unter der Antenne, die
  Kupfer-Sperrfläche auf allen Lagen, die Masse-Vias unter dem Modul, eine
  bedruckte Front über der Antenne (eine Frontplatte aus Aluminium nur mit
  einem Fenster über x 0 bis 50,5 mm; ohne dieses verliert das Modell bei
  2,4 GHz 1,5 bis 1,9 dB). Das Zertifikat des Moduls deckt seine Antenne ab; die
  Strahlungstests des Lesers werden im Labor mit dem Leser in seinem Gehäuse
  gemacht (compliance.md). Die Reichweite auf beiden Bändern gegenüber einem
  C6-Leser im Einsatz wird bei der Inbetriebnahme gemessen.
- **Spätere Revision.** Das Modul in der oberen rechten Ecke, mit dem
  USB-C-Steckverbinder nach unten an der rechten Kante oder an der oberen Kante
  links vom Modul, oder ein Gehäuse mit Platz für die Antenne über den Rand
  hinaus.

### SDIO-Leiterbahnen zum WLAN-Modul (Review-Punkt 5.2)

- **Ziel.** Espressifs Layout-Regeln für die SDIO-Leitungen des C5 (HDG 1.4.9):
  Befehl und Daten innerhalb von 50 mil (1,27 mm) der Länge des Takts,
  nötigenfalls Mäander; höchstens 2000 mil (50,8 mm); 50 Ohm +-10 %; „Ensure
  that SDIO traces do not cross layers“, über einer ungeteilten Bezugsfläche;
  Massekupfer rund um den Takt.
- **Erreicht.** Alle bis auf eine: Die sechs Leitungen sind je 40,3 mm von Pad zu
  Pad lang, gleich auf 0,01 mm genau (`scripts/layout_report.py`), 0,15 mm auf
  der Rückseitenlage über der Massefläche In4 (49 Ohm), der Takt mit Massefüllung
  auf beiden Seiten. Die eine verfehlte Regel: Jede Leitung wechselt zweimal die
  Lage, einmal neben dem MCU und einmal unter dem Modul (zwei Vias pro Leitung,
  bei allen sechs gleich). Ein Masse-Via steht innerhalb von 1,7 mm von jedem
  davon (0,7 bis 1,45 mm unter dem Modul, 0,9 bis 1,7 mm neben dem MCU;
  `routes_sdio.py` setzt die, für die der Nachbearbeitungsschritt nach dem
  Verlegen keinen Platz findet).
- **Warum.** Die Pads beider Chips liegen auf der Vorderlage, und die Vorderlage
  zwischen ihnen ist belegt: Der Core-Wandler (U202, L201 und seine
  Kondensatoren) steht im Weg, und die 5-V-Zuleitung (0,8 mm) und die
  Core-Versorgung (0,6 mm) kreuzen sie auf dieser Lage. Den Wandler wegzurücken
  würde die Abblockwege des MCU-Core verlängern (Review-Punkt 5.3, der nicht
  fallen darf). Jede andere Lage bedeutet also ein Via an jedem Ende.
- **Abhilfe.** Beide Lagenwechsel liegen zwischen zwei Masseflächen (In1 unter
  der Vorderlage, In4 über der Rückseitenlage) mit einem Masse-Via innerhalb von
  1,7 mm von jedem Signal-Via, sodass der Rückstrom die Fläche in der Nähe
  wechselt; gleiche Via-Zahlen halten die Leitungen in der Laufzeit gleich. Das
  Timing auf der verlegten Platine (`sim/si.py`): Takt und Daten treffen
  innerhalb von 0,18 ns zueinander ein, und Takt hinaus und Daten zurück
  brauchen 1,01 ns, was dem P4 bei 50 MHz 5,0 ns lässt (10,0 ns bei 40 MHz) nach
  einem Modul, das innerhalb der 14 ns des SD-Standards antwortet. Die
  Inbetriebnahme führt den Raw-Durchsatztest von esp-hosted bei 40 und 50 MHz
  aus und zählt CRC-Fehler und Zeitüberschreitungen, bevor irgendetwas anderes
  die Verbindung nutzt.
- **Spätere Revision.** Das Modul neben den Slot-0-Pins des P4, mit dem
  Core-Wandler auf der anderen Seite des P4, würde einen Bus auf der Vorderlage
  erlauben.

### ESD an den LED-Fenstern, am Summer und an den Verschlussschrauben (Review-Punkt 9.1)

- **Ziel.** Jeder Anschluss und jede Fläche erreicht den ESD-Prüfpegel (4 kV
  Kontakt, 8 kV Luft, Kriterium B), gezeigt durch die Bemessung des schützenden
  Bauteils.
- **Erreicht.** Jeder Kabelanschluss, die Kanten und das Flexkabel des Displays,
  der NFC-Bereich und das Glas: Tabelle in „ESD je Anschluss“. Nicht gezeigt: die
  LED-Fenster (die SK6812MINI-E ist mit 2 kV HBM bemessen, ein Handhabungswert),
  die Summerlöcher (keine Bemessung für den Summer oder seinen FET) und die zwei
  schwebenden Verschlussschrauben.
- **Warum.** Eine Diode an jeder der acht LEDs, am Summer und an den Schrauben
  ist auf dieser Platine nicht praktikabel; was hier entscheidet, ist der Luft-
  und Kriechweg durch das Gehäuse, den kein Datenblatt angibt.
- **Abhilfe.** Ein ESD-Vortest an den ersten Lesern vor dem Labor: 8 kV Luft an
  jedem LED-Fenster, den Summerlöchern, den Fugen und den Glaskanten, 4 kV
  Kontakt an den Verschlussschrauben (Inbetriebnahmeplan).
- **Spätere Revision.** Falls der Vortest fehlschlägt: Diffusoren mit einem
  Flansch, der die Fuge schließt, gegenüber dem Anschluss versetzte Summerlöcher,
  Verschlussschrauben aus Nylon.

### Bezeichner der kleinen Passivbauteile (Review-Punkt 7.6)

- **Ziel.** Der Bezeichner jedes Bauteils auf dem Bestückungsdruck; wo einige
  nicht passen, deckt die Bestückungszeichnung sie ab.
- **Erreicht.** Jeder IC, Quarz, jede Induktivität, Perle, Diode, jeder
  Transistor, Steckverbinder, Schalter, jede Sicherung, jedes Array und der
  Summer trägt seinen Bezeichner (23 davon mit einer Hinweislinie; ein Test
  schlägt fehl, wenn einer fehlt). Von den 0402- und 0603-Passivbauteilen tragen
  114 um den MCU, den PHY und den NFC-Chip keinen.
- **Warum.** Bei 1,0 mm Text, JLCPCBs Minimum, ist zwischen den Bauteilen kein
  Platz für sie, ohne Pads zu überdecken.
- **Abhilfe.** Die Bestückungszeichnung (fab/jlcpcb/*-assembly.pdf) zeigt jeden
  Bezeichner, mit vergrößerten Seiten dieser Bereiche.
- **Spätere Revision.** Keine geplant.

## Design-Review

Im November 2026 wurde das Design vor der ersten Bestellung geprüft: jedes
Bauteil gegen sein Datenblatt (Pin-Nummern, Versorgungsschema, Werte), jedes
Footprint gegen das Footprint der Bibliothek von JLCPCB für dieselbe
Teilenummer, die Platine gegen die veröffentlichten Grenzen von JLCPCB und die
Mechanik gegen die Zeichnungen des Displays und der Steckverbinder. Es wurde
nichts gebaut oder gemessen.

### Gefunden und geändert

| Befund | Änderung |
|---|---|
| Summer: Beide Spulen-Pads lagen auf einem Netz, der Transistor schaltete zwei Pads, die das Bauteil nur halten. Er wäre stumm geblieben. | Spulen-Pads 1 und 2 auf den beiden Netzen, Pads 3 und 4 unbeschaltet. |
| Ethernet-Buchse hinter dem Display: Ihre Pins stehen mindestens 1,45 mm aus der Displayseite, und die Notizen verlangten das Display innerhalb von 1 mm von der Platine. | Die Buchse bleibt (sie unter das Display zu setzen würde 19 mm Steckerraum kosten, und das Gehäuse müsste um so viel wachsen). Stattdessen wird der Displayabstand von beiden Seiten festgelegt: 1,5 mm, höchstens 2,0 für das Flexkabel, mit auf 1 mm gekürzten Pins der Buchse und Polyimidband an dieser Ecke des LCD. Die zwei 48-V-Pins stehen neben der Metallrückseite, nicht dahinter. |
| Der Platzierungswinkel von vier Bauteilen wich von JLCPCBs Bibliothek ab: der PN532 (zweite Quelle), der Transistor und die Widerstandsarrays (Footprints von KiCad), später der neue Pegelwandler. Der PN532 wäre um eine Vierteldrehung versetzt platziert worden. | Der Export korrigiert diese Winkel. Neues Target `check-footprints`. |
| Die NFC-Anpassung war für eine größere Schleife berechnet: etwa 140 mA Senderstrom mit der Schleife auf der Platine, Grenze 100 mA. | Werte, die für jede Schleife zwischen 1,0 und 1,3 uH unter 90 mA bleiben, wenn jedes Bauteil seinen genauen Wert hat (mit der Toleranz der Bauteile: 1,12 bis 1,22 uH). Nach der Simulation noch einmal geändert, siehe unten. |
| 48-V-Bauteile und -Leiterbahnen unmittelbar an der Rückwand des Metallgehäuses der Buchse (0,1 bis 0,3 mm), ebenso die Mittelanzapfungskondensatoren. | Bauteile um 2 mm weggerückt, 48-V-Netze unter dem Gehäuse auf der Innenlage, Ethernet-Paare auf der Rückseitenlage. |
| Kupferfläche unter dem PoE-Modul, wo seine Isolationsbarriere liegt. | Dort auf keiner Lage Kupfer. |
| DC-Eingang ohne Filter: Die Welligkeit des Wandlers wäre auf das Versorgungskabel hinausgegangen. | Pi-Filter C117, L103. |
| Unversorgte Eingänge schwimmen durch den Leckstrom der ODER-Dioden hoch; ein USB-C-Host versorgt den Anschluss dann womöglich nicht. | Ableitwiderstände R104, R105. (Die Dioden sind inzwischen ersetzt, siehe „Stromversorgung“; die Widerstände bleiben.) |
| Summerwiderstand: 0,16 W in einem 0,1-W-Bauteil. | 0,25-W-Bauteil gleicher Größe. |
| Pegelwandler 74AHCT1G125 ist ab 4,5 V spezifiziert; die 5-V-Schiene kann niedriger sein. | 74LV1T125 (1,6 bis 5,5 V), gleiche Pads. |
| LED-Datenleitung schwimmt, solange der MCU im Reset ist. | Pull-down R705. |
| LED-Fenster 3,4 x 3,0 mm mit runden Innenecken für einen Körper von 3,2 x 2,8 mm mit eckigen. | Footprint von KiCad mit freigestellten Ecken. |
| Freiliegendes Pad des MCU: Paste über das gesamte 7,5-mm-Pad. | Neun Fenster, 70 %. |
| WLAN-Antenne: Kupfer 3,4 mm daneben, Platine darunter. | Auf 44 mm entlang der Kante kein Kupfer, Platine unter der Antenne ausgeschnitten. |
| Beschriftungen der vier WLAN-Testpunkte überlappten sich. | Zwei davon um 1,4 mm verschoben. |
| Die Metallrückseite des Displays hatte keine Verbindung zur Masse. | Vier blanke Masse-Pads auf der Displayseite für leitfähiges Band. |

### Geprüft und für richtig befunden

- Jeder Pin des ESP32-P4, des ESP32-C6-Moduls, des PHY, der Buchse, des
  PoE-Moduls, des PN532, der Wandler und der kleinen ICs gegen die Pin-Tabellen
  der Hersteller. Das Versorgungsschema, die Straps, die Flash-Verdrahtung und
  die Pin-Funktionen des P4 (RMII, SDIO-Slot 0, USB) gegen die Dokumente von
  Espressif.
- Die Pin-Tabelle des Panels gegen das Datenblatt des Panels und Waveshares
  Schaltplan, die Hintergrundbeleuchtung (zwei Stränge aus je vier LEDs, zusammen
  40 mA) und die gespiegelte Pin-Reihenfolge am Steckverbinder: Panel-Pin 1
  landet auf Steckverbinder-Pad 40, und die Kontakte zeigen nach dem Falten zur
  Platine.
- Die Polarität aller Dioden und des Elektrolytkondensators in JLCPCBs
  Bibliothek gegen die Platine.
- Alle Teilenummern der Stückliste: Jede ist der Wert, die Größe und die
  Bemessung, die das Design meint.
- Elektrische und Design-Regel-Prüfungen, Schaltplan gegen Platine, und die
  Platine gegen JLCPCBs Grenzen (Leiterbahnen 0,11 mm gegen 0,09, Vias 0,45 /
  0,2 mm ohne Aufpreis, Kupfer zu gefrästen Kanten 0,31 mm gegen 0,2).

### Review gegen Layout-Regeln

Später im November 2026 wurde die verlegte Platine gegen eine Sammlung von
Layout-Regeln gemessen (Bezugsflächen und Rückstrompfade, Versorgungsverlegung,
Abblockung, Stitching, Löten und Bestellen). Die Design-Regel-Prüfung war vorher
und nachher sauber; sie sieht sich nichts davon an.

| Befund auf der Vierlagenplatine | Änderung |
|---|---|
| Die 3,3-V-Kupferfläche teilte sich die Innenlage In2 mit 1150 mm Signalleiterbahnen, die sie in fünf Stücke zerschnitten. Die Rückseitenlage hatte diese Fläche als Bezug: 23 % der Länge der schnellen Signale auf der Rückseitenlage und 28 % auf In2 hatten kein Kupfer einer Fläche daneben (der 50-MHz-Ethernet-Takt auf 18 seiner 47 mm). | Sechs Lagen. Die Verlegung ist dieselbe; die 3,3-V-Fläche hat eine eigene Lage und die Rückseitenlage eine Massefläche. 7 % der Länge der schnellen Signale auf diesen beiden Lagen sind weiterhin ohne Fläche daneben, an Vias und dort, wo die Flächen enden. |
| 17 der 42 Vias schneller Signale hatten kein Masse-Via innerhalb von 3 mm, die sechs SDIO-Vias am WLAN-Modul keines innerhalb von 6 bis 12 mm. | Ein Masse-Via neben jedem, wo Platz ist: 6 bleiben ohne eines innerhalb von 3 mm (höchstens 3,8 mm). |
| Etwa 1000 mm2 jeder äußeren Massefüllung lagen mehr als 10 mm von einem Masse-Via entfernt; der Streifen rechts der WLAN-Antenne hatte gar keines. | 342 Stitching-Vias. Keine Füllung ist mehr als 5,6 mm von einem Masse-Via entfernt. |
| Core-Schiene: Die Kupferfläche auf der Rückseitenlage erreichte den Wandler nicht, weil ihre Kontur eine Ecke zweimal besuchte und KiCad nur das Quadrat unter dem MCU füllte. Die Schiene hing an einer Leiterbahn von 0,2 mm und einem Via mit 0,2-mm-Loch. | Eine Kontur; drei 0,3-mm-Vias am Ausgangskondensator in die Kupferfläche; Versorgungsleiterbahnen verbreitert. |
| Eine 48-V-Leiterbahn auf der Rückseitenlage (19 mm neben dem PoE-Modul), wo diese Notizen sagten, es gebe keine. Innere Kupferflächen 0,9 mm vom 48-V-Pad von C102. | Die Leiterbahn liegt auf der Innenlage. Kupferflächen enden auf jeder Lage 2 mm vor 48-V-Kupfer. |
| PN532: Die Kondensatoren seiner Analogversorgung waren 8,3 mm vom Pin entfernt. | Die 100 nF sind 4,1 mm davon entfernt. Näher ist nicht möglich: Die Vias und Leiterbahnen des Senders nehmen den Platz über dem Pin. |
| 104 kleine Bauteile standen mit einem Pad massiv in der Massefüllung und dem anderen an einer dünnen Leiterbahn (Grabsteineffekt). | Thermal-Speichen an den Pads aller 0402- und 0603-Bauteile. |
| Vias unter Lotpaste: 9 von 25 im freiliegenden Pad des MCU, alle in den Masse-Pads des PHY und des WLAN-Moduls, eines in einem Kondensator-Pad. | Jetzt keine. |
| Die vier Induktivitäts-Footprints waren als Durchsteckbauteile markiert. Ein Platzierungsexport nur für oberflächenmontierte Bauteile hätte sie weggelassen (der Export dieses Projekts tat es nicht). | Als oberflächenmontiert markiert. |
| LED-Pads 0,25 mm von den gefrästen Fenstern, bei einer Konturtoleranz von 0,2 mm. | Pads 0,1 mm kürzer: 0,3 mm und mehr. |
| TVS des DC-Eingangs: 45 V bei seinem Nennstrom gegen die 40 V des Wandlers. | SMBJ26A (inzwischen durch eine SMBJ28A ersetzt, siehe „Stromversorgung“). |
| Bestückungsdruck-Text von 0,9 mm; die Markierung `JLCJLCJLCJLC` für eine Bestellnummer, die JLCPCB im Mai 2026 nicht mehr aufdruckt. | Text 1,0 mm; ein Feld für JLCPCBs Seriennummer. |
| Kein Lagenaufbau in der Platinendatei. Bauteilzahlen und Buslängen in diesen Dokumenten waren veraltet. | Ergänzt und korrigiert. |

Angesehen und so gelassen:

- Der Versorgungspin des Flash hat seine 100 nF 5,3 mm entfernt. Unter dem Pin
  laufen die Leiterbahnen für Datenausgang und Chip-Select, daneben liegt der
  Körper des Flash; auf dieser Seite der Platine gibt es keinen näheren Platz.
- Die sieben RMII-Vias über dem MCU schneiden einen Schlitz von 4 x 1,6 mm in die
  Flächen. Sie zu verteilen würde den Fan-out der oberen Kante des MCU
  auseinandernehmen.
- Teardrops. KiCad erzeugt sie nur in seinem Platineneditor, nicht aus einem
  Skript. Die größeren Via-Pads erfüllen einen Teil ihrer Aufgabe.
- Der vierte Core-Versorgungspin und die Versorgungsleiterbahnen an Pins mit
  feinem Raster bleiben schmal (siehe „Verwendete Layout-Regeln“).

### Prüfung vor der ersten Bestellung

Am 22. November 2026 wurde die Schaltung noch einmal Pin für Pin mit den
Dokumenten verglichen, auf denen sie beruht, und der Strompfad wurde berechnet.
Die Dokumente: Espressifs Hardware Design Guidelines für den ESP32-P4 (Version
2.0 vom 12. November 2026) und sein Datenblatt (0.7), der Schaltplan des
ESP32-P4-Function-EV-Board (1.52), die Konfigurationsdatei von esp-hosted und
die Datenblätter jedes ICs, der Buchse, des PoE-Moduls, der Dioden, Sicherungen,
Induktivitäten und Quarze. Es wurde nichts gebaut oder gemessen.

| Befund | Änderung |
|---|---|
| PN532: Sein Footprint hatte Lotpaste über dem gesamten freiliegenden Pad und eine weitere Öffnung auf jedem der vier thermischen Vias darin, auf beiden Seiten der Platine. Das Lot wäre in die vier Löcher gelaufen, und die Bestellung hätte eine Pastenlage für die Seite ohne Bauteile enthalten. | Acht Pastenfenster um die Vias, keines auf einem Loch, nur auf der Bestückungsseite. Ein Test liest jetzt die Footprint-Bibliothek nach Paste auf durchkontaktierten Löchern. |
| NFC-Anpassung: Diese Notizen nannten die bestückten Werte sicher für jede Schleife von 1,0 bis 1,3 uH. Das gilt für exakte Bauteilwerte; mit den bestückten 5-%-Bauteilen gilt es von 1,12 bis 1,22 uH. | Damals kein Bauteil geändert: Die Werte waren für die erwartete Schleife (1,2 uH) richtig. Die Simulation unten fand eine größere Schleife und änderte sie. |
| Einstecken einer aktiven 24-V-Versorgung: Diese Notizen sagten, die TVS halte den Eingang des Wandlers unter 40 V. Das beruhte auf einem Strom von höchstens 11 A. Die drei Eingangskondensatoren (10 uF / 50 V) behalten bei 24 V nach der Kurve ihres Herstellers je 1,35 uF, und mit dieser Kurve simuliert erreichte der Eingang 41 bis 45 V, mit bis zu 19 A in der TVS, bei 3 bis 10 m gewöhnlicher Installationsleitung. | C112, C113 und C117 sind 2,2 uF / 100 V X7R in derselben Größe: höchstens 38 V. Zahlen und was es kostet in „Stromversorgung“. (Der 47-uF-Elektrolytkondensator C120 ist inzwischen hinzugekommen, siehe „Stromversorgung“.) |
| USB-Anschluss, während eine andere Versorgung die Platine betreibt: Der Ableitwiderstand hält den nicht angeschlossenen Anschluss nur so lange unter dem, was ein USB-C-Host akzeptiert, wie die ODER-Diode nicht mehr leckt als der typische Wert bei 75 °C. | Kein Bauteil geändert. Zahlen in „Stromversorgung“, eine Prüfung mit dem warmen Leser im Inbetriebnahmeplan. (Die ODER-Diode ist inzwischen durch den eFuse U105 ersetzt, siehe „Stromversorgung“.) |

Geprüft und für richtig befunden, über das hinaus, was das erste Review auflistet:

- ESP32-P4: alle 105 Pin-Nummern des Symbols gegen die Tabelle des Datenblatts.
  Jeder Versorgungspin hat die Kondensatoren, die die Richtlinien verlangen
  (10 uF und 100 nF an der Versorgung der Regler, der Wandlersteuerung, der
  Low-Power-Domäne und des Batteriepins; 100 nF an jeder IO-Versorgung, an der
  Analogversorgung und an jedem der vier Core-Pins, mit 10 uF am ersten; 1 uF an
  jedem Reglerausgang; 10 nF, 100 nF und 4,7 uF am USB-PHY). Reset: 10 k und
  1 uF, die Werte, die die Richtlinien seit Juli 2026 nennen. Straps: GPIO35 hoch
  über 10 k und tief über den Taster, GPIO36 hoch über die 1,5 k, die bei beiden
  Versionen bestückt sind (der Download-Modus braucht sie hoch), GPIO34 hoch
  über 10 k (er hat keinen eigenen Pull-Widerstand), GPIO37 und 38 frei. Die
  Eingänge des PHY an GPIO34 und 35 haben keine Pull-Widerstände, die dagegen
  arbeiten könnten. Quarz: 9 pF Last, 10 ppm, mit 12 pF auf jeder Seite.
- Core-Wandler: Pinbelegung, 2,2 uH, 22 pF über dem oberen Widerstand und zwei
  22 uF am Ausgang, was TIs Tabelle für Ausgänge unter 1,2 V nennt (Espressifs
  Platine hat eine). Die Induktivität sättigt bei 2,3 A, unter der eigenen
  Grenze des Wandlers von 3 A und weit über dem, was der Core zieht.
- Die Pins des WLAN-Moduls gegen sein Datenblatt; seine SDIO-Pins sind fest, und
  die des MCU für Slot 0 ebenso. esp-hosted listet genau diese Paarung für den
  P4 (Befehl 44, Takt 43, Daten 39 bis 42). Für den Reset nimmt es jeden Pin,
  sobald sein Board-Preset aus ist; das Preset, das es von selbst wählt, ist
  Espressifs Platine, mit anderen Pins (siehe
  [firmware-port.md](hardware/touch-p4/firmware-port.md)).
- Der PHY gegen sein Datenblatt und Espressifs Platine: Straps, Adresse 1, der
  Taktausgang mit dem Takteingang verbunden, die unbenutzten Pins (sein Pin 21
  ist ein Ausgang). Die LEDs der Buchse: Anoden an den Pins 11 und 13, wie
  verdrahtet.
- PN532: Schnittstellenwahl (I0 hoch, I1 tief ist I2C in NXPs Application Note;
  die Tabelle des Datenblatts allein kann auch andersherum gelesen werden), das
  Versorgungsschema mit dem eigenen Regler des Chips, der den Analog- und den
  Senderversorgungspin speist, Reset-Schwelle (0,9 der 3,3-V-Versorgung, obwohl
  der Chip mit 5 V läuft), Quarzlast. Das Anpassnetzwerk neu berechnet: Die
  Tabelle in „NFC“ ist richtig.
- Die drei Wandler, der Treiber der Hintergrundbeleuchtung, der IO-Expander, der
  Pegelwandler, die drei Sensoren, der USB-Schutz und das PoE-Modul gegen ihre
  Datenblätter: Pin-Nummern, Werte, Spannungsbemessung der Kondensatoren darum.
- Ströme. Bei allem gleichzeitig eingeschaltet (was die Firmware nie tut) trägt
  die 5-V-Schiene 1,5 A, 7 W: Der 3,3-V-Wandler liefert dann 1,1 A seiner 2 A,
  der DC-Wandler 1,5 A von 2 A, und das PoE-Modul liegt unter seinen 9 W. Die
  damals bestückte ODER-Diode verbrauchte 0,6 W. Die Ideal-Dioden, die sie
  ersetzen (siehe „Stromversorgung“), verbrauchen etwa 0,04 W in jedem
  IRLML0030 bei 0,9 A. Der DC-Eingang zieht dann 0,75 A bei 12 V. Seine
  Sicherung hält 1,1 A bei 25 °C und 0,7 A bei 60 °C, ist also das knappste
  Teil der Kette: in Ordnung für die 4,5 W Spitze, die diese Notizen annehmen
  (0,5 A), keine Reserve für 7 W in einem warmen Gehäuse.
- Start: Der 3,3-V-Wandler startet bei 3,5 V auf der 5-V-Schiene und läuft
  4 ms hoch; die Reset-Pins des MCU und des WLAN-Moduls folgen 14 ms später; der
  Core läuft vom eigenen Regler des Chips, bis die Firmware den Wandler
  einschaltet. Hintergrundbeleuchtung, LEDs, Summer und PN532 werden bis dahin
  von Widerständen ausgeschaltet gehalten. (Inzwischen geändert: Der
  3,3-V-Wandler ist ein TLV62569, und der Supervisor U204 hält den MCU 120 bis
  280 ms im Reset, siehe „Stromversorgung“.)
- Pin-Belegung: Kein GPIO wird doppelt verwendet, die vier USB-Pads werden
  respektiert (GPIO26, die Hintergrundbeleuchtung, ist eines davon; Espressifs
  Platine nutzt ihn ebenfalls für ihre Hintergrundbeleuchtung), die
  Ethernet-Signale liegen auf Pins, die das MAC ohne die GPIO-Matrix erreicht.
- Fertigungsdateien: Bohrtabelle (kleinstes durchkontaktiertes Loch 0,2 mm,
  kleinstes nicht durchkontaktiertes 0,6 mm, Langlöcher 0,8 und 1,0 mm breit),
  Lagenaufbau in der Job-Datei und die Pastenlage der Displayseite, die jetzt
  leer ist.

Angesehen und so gelassen:

- Der Teiler des Core-Wandlers hatte zweimal 510 k, wo Espressifs Richtlinien
  sagen, 499 k „must be populated“. Im Industry-Review auf 499 k geändert
  (siehe „Industry-Review“ unten).
- Die 100 k vom Enable-Eingang des Wandlers nach Masse sind nicht in Espressifs
  Schaltung. Sie sind nur wichtig, solange der Chip den Pin nicht treibt.
- Die SDIO-Leitungen haben nur im Takt einen Serienwiderstand. Die Richtlinien
  verlangen, in jeder Leitung einen vorzusehen; Espressifs eigene Platine hat
  keinen.
- Schienen ohne Testpunkt: die zwei Reglerausgänge des MCU (Flash, PSRAM), die
  3,0 V des PN532, die 1,1 V des PHY, die Ausgänge des DC-Wandlers und des
  PoE-Moduls, die Hintergrundbeleuchtung. Der Inbetriebnahmeplan nennt jeweils
  einen Kondensator oder eine Diode zum Messen; ein Testpunkt für jede bräuchte
  Platz nahe dem MCU, den die Platine nicht hat. (Seit Review-Stufe 3 haben
  alle bis auf die PSRAM-Versorgung und die 1,1 V des PHY einen kleinen
  Testpunkt.)

### Simulation

Am 24. November 2026 wurde die verlegte Platine dort simuliert, wo eine
Simulation antworten kann. Das Kupfer wird aus der Platinendatei gelesen und die
Bauteilwerte aus der Schaltungsbeschreibung, die Zahlen gelten also für dieses
Layout, nicht für ein Lehrbuchlayout. Die Skripte liegen in `sim/` und laufen
als Target `simulate`, das fehlschlägt, wenn eine Grenze eines Bauteils verfehlt
wird; [Simulationen](hardware/touch-p4/simulations.md) sagt, was jede davon
modelliert. Dafür wurden zwei Feldlöser geschrieben (Induktivität und Feld von
Leiterbahnen und Kupferflächen; Impedanz einer Leiterbahn im Lagenaufbau). Beide
werden bei jedem Lauf gegen geschlossene Formeln geprüft. Die Schaltungen laufen
in ngspice und die WLAN-Antenne in openEMS, einem Vollwellenlöser (das Target
`simulate-antenna`). Es wurde nichts gebaut oder gemessen.

Gegenprüfungen gegen unabhängige Referenzen (bei jedem `simulate` ausgeführt
oder von Hand gerechnet, wo vermerkt):

| Was | Modell | Referenz | Übereinstimmung |
|---|---|---|---|
| NFC-Schleife in freier Luft | 1,269 uH (`sim/peec.py`, die verlegte Schleife) | 1,239 uH nach der modifizierten Wheeler-Formel und 1,313 uH nach dem Stromschicht-Ausdruck für quadratische Spiralen, Mohan, Hershenson, Boyd und Lee, IEEE J. Solid-State Circuits 34(10), 1999, Gl. 1 und 2, Tabellen I und II, typischer Fehler 2 bis 3 %; die 35 x 37 mm große Schleife als Quadrat genommen | +2,4 % und -3,4 %, innerhalb des eigenen Fehlers der Formeln und der Quadratnäherung |
| Induktivität und Feld einer einzelnen Schleife, einer Schleife in einem kurzgeschlossenen Ring, einer Schleife über einer Platte | derselbe Löser | Neumanns Doppelintegral und die geschlossenen Formen in `sim/test_solvers.py` | innerhalb von 1,5 % (210,6 gegen 210,5 nH für die Schleife allein) |
| Impedanz des USB-Paars und der Ethernet-Leitungen | `sim/field2d.py` auf den verlegten Querschnitten | JLCPCBs Impedanzrechner für den Lagenaufbau und TIs geschlossene Formel (SNLA187) | innerhalb von 1 Ohm vom Rechner (Tabelle in „Impedanz“) |
| Streifenleitung zwischen zwei Flächen | `sim/field2d.py` | Cohns geschlossene Formel mit der Dickenkorrektur | 53,8 gegen 54,3 Ohm |
| Spannungsabfall auf Versorgungsleiterbahnen | `sim/irdrop.py` | Ohmsches Gesetz an ausgedachten Netzen: Leiterbahn, Via und Leiterbahn in Reihe; zwei Leiterbahnen nebeneinander | gleich auf 0,1 % (51,1 mOhm) |
| Wärme im geschlossenen Gehäuse | `sim/thermal.py`: der mittlere Anstieg der Platine, PoE, typische Nutzung, +30 K | von Hand: Die 3,4 W verlassen die Platine über ihre Flächen mit den Oberflächenkoeffizienten des Modells (6,9, 5,1 und 4,2 W/(m2 K) für die Displayseite unter dem LCD, die Displayseite daneben und die Bestückungsseite) über die 0,0107 m2 der Platine (das LCD bedeckt 0,0057 m2 davon): 3,4 W / 0,11 W/K = 31 K | innerhalb von 3 %; die Lehrbuchkoeffizienten selbst sind es, wofür die angegebenen +-40 % gelten |

| Befund | Änderung |
|---|---|
| NFC-Schleife: 1,25 uH auf der Platine und 1,20 uH an einer Metallwand, wo diese Notizen 1,1 bis 1,25 uH erwarteten. Die Kupferflächen um die Schleife sind auf einer Seite offen und nehmen nur 2 %. Zusammen mit den eigenen 2,4 pF der Schleife brachte das die bestückte, für 1,2 uH berechnete Anpassung an den Rand ihres Bereichs: 3,8 Vss am Empfängereingang gegen eine Grenze von 4 Vss, mit der Toleranz der Bauteile bei 45 von hundert Platinen darüber, und der Sender bei fünf über 100 mA. | Parallelkondensatoren C515 und C519 10 pF statt 18 pF, Empfangsteiler R506 3,9 k statt 2,7 k: 41 mA und 1,9 Vss bei 1,25 uH, 35 mA und 1,2 Vss bei 1,20 uH, und keine Platine von hundert außerhalb einer der beiden Grenzen. Zahlen in „NFC“. |
| Die Montageschraube neben der NFC-Schleife steht in der Lücke, die verhindert, dass das Kupfer um die Schleife eine kurzgeschlossene Windung ist. Die Massekupferflächen liefen unter ihrem Kopf und unter der Einschmelzmutter auf der anderen Seite, auf beiden Seiten der Lücke, mit nur Lötstopplack dazwischen. Metall über der Lücke bringt die Schleife von 1,25 auf 1,03 uH. | Keine Kupferfläche auf den Außenlagen innerhalb von 3,3 mm um dieses Loch. |

Die Platine wurde für diese beiden Änderungen vom Generator neu gebaut. Jede
Leiterbahn und jedes Via liegt, wo es war; drei Bauteilwerte und 16 mm2
Kupferfläche auf jeder Außenlage unterscheiden sich.

Simuliert und für richtig befunden:

- DC-Eingang, eine aktive 24-V-Versorgung eingesteckt: 35 bis 38 V am Wandler für
  die Kabel der Tabelle in „Stromversorgung“ (38,1 V und 8,6 A in der TVS mit 5 m
  1,5 mm2), 39,9 V aus einer 26,4-V-Versorgung. Dieses zweite, unabhängige
  Modell stimmt mit jener Tabelle innerhalb von 1,5 V überein. Der
  Filterkondensator vor der Induktivität (C117) sieht mehr, bis zu 43 V; er ist
  ein 100-V-Bauteil. (Seitdem dämpft der 47-uF-Elektrolytkondensator C120 den
  Eingang, siehe „Stromversorgung“.)
- Hochlauf aus USB: Die 3,3-V-Schiene steht nach 3,8 ms. Der Reset-Eingang des
  MCU liegt dann bei 0,53 V und passiert 0,83 V, den höchsten Pegel, den er noch
  als tief nimmt, 1,1 ms später; der Chip verlangt 50 us. An einem schwachen
  Anschluss (4,5 V hinter 0,5 Ohm) läuft die 5-V-Schiene mit 3,8 V, dem
  Wenigsten, womit der 3,3-V-Wandler arbeitet: genug, ohne etwas übrig zu haben.
  Das Einstecken zieht einige Mikrosekunden lang 7,5 A, in etwa 50 uF, wo der
  USB-Standard einem Gerät 10 uF erlaubt. Anschlüsse halten das aus; es ist ein
  Grund mehr, warum dies ein Serviceanschluss ist. (Inzwischen geändert: Der
  eFuse U105 fährt die 5-V-Schiene hoch, und beim Einstecken sieht der
  Anschluss nur die 10 uF von C101, siehe „Stromversorgung“.)
- Leiterbahnimpedanz auf diesem Lagenaufbau, 0,15 mm Leiterbahn mit der
  Massefüllung daneben: 49 Ohm auf den Außenlagen, 46 Ohm auf In2 (5,7 und
  7,0 ps/mm).
- Reflexionen auf den schnellen Leitungen, mit den verlegten Längen. Die Leitungen
  mit Serienwiderstand (RMII-Takt und -Empfangsleitungen, SDIO-Takt,
  Displaytakt) zeigen keine. Die Leitungen ohne einen (RMII-Senden, SDIO-Daten
  und -Befehl, 40 bis 48 mm) schwingen bei der Standard-Treiberstärke des MCU
  um 0,13 V über und bei der stärksten um 0,6 bis 0,8 V, wo der Pegel dann auf
  3,0 V zurückschwingt. Die Firmware muss diese Pins bei der Standardstärke
  oder darunter lassen
  ([firmware-port.md](hardware/touch-p4/firmware-port.md)).
- Versorgungsleiterbahnen bei allem gleichzeitig eingeschaltet, 1,5 A auf der
  5-V-Schiene: höchstens 0,13 V Verlust, an der fernen LED-Reihe, und keine
  Leiterbahn der Außenlagen trägt mehr als den Strom für 20 K Erwärmung. Die
  1,5 A des USB-Eingangs laufen über 13 mm Innenlage mit 0,62 mm Breite, mehr,
  als die Regel für eine freie Innenleiterbahn erlaubt; diese liegt 0,1 mm von
  einer Fläche, die ihre 70 mW aufnimmt.
- SDIO-Verbindung zum WLAN-Modul (der C5, am 26. November 2026 neu verlegt):
  Alle sechs Leitungen sind von Pad zu Pad 40,3 mm lang. Der Takt trifft 0,59 ns
  nach dem Verlassen des MCU ein, die Datenleitungen 0,41 bis 0,42 ns, sodass sie
  innerhalb von 0,18 ns zueinander bleiben: Die 22 Ohm des Takts und der Eingang
  des Moduls verlangsamen ihn, nicht seine Länge. Takt hinaus und Daten zurück
  brauchen 1,01 ns. Nach einem Modul, das innerhalb der 14 ns des SD-Standards
  antwortet, lässt das dem MCU 10,0 ns bei 40 MHz und 5,0 ns bei 50 MHz. Die
  Platine ist nicht das, was diese Verbindung begrenzt (siehe „WLAN und
  Bluetooth“).
- WLAN-Antenne, in einem Vollwellenmodell (`sim/wifi_antenna.py`, das Target
  `simulate-antenna`; am 25. November 2026 für das C5-MINI-1 neu gelaufen). Die
  Antenne des Moduls ist nicht veröffentlicht, daher wurde ein Dualband-Platzhalter
  gleicher Größe und Art (eine invertierte F-Antenne mit einem 2,4-GHz-Arm und
  einem 5-GHz-Arm) auf einer kleinen Evaluationsplatine auf 2,429 und 5,440 GHz
  abgestimmt und dann unverändert auf diese Platine gesetzt, an die Stelle des C5
  und zum Vergleich an Espressifs Position 3: auf der Platine, mit dem Display,
  im gedruckten Gehäuse, mit einer Metallwand dahinter und mit einer Frontplatte
  aus Aluminium, mit und ohne Fenster. Die Tabelle und was daraus folgt stehen in
  „WLAN-Antenne“. Kurz: Im Gehäuse mit dem Display strahlt der Platzhalter -3,0
  bis -4,1 dB der eingespeisten Leistung bei 2,4 GHz und -2,5 bis -4,0 dB bei
  5 GHz, in jedem Kanal innerhalb von 3 dB von Position 3; eine geschlossene
  Aluminium-Frontplatte kostet bei 2,4 GHz bis zu 1,9 dB mehr. Die absoluten
  Zahlen sind die des Platzhalters, nicht die des Moduls.
- Versorgungsimpedanz am MCU, die Platine ohne das Gehäuse des Chips: Über 30 MHz
  sieht die Core-Schiene wie 1,1 nH aus (2,4 nH für einen Pin allein), ein Pin
  der 3,3-V-Schiene wie 1,2 nH. Das ist etwa das, was ein Gehäuse dieser Art pro
  Pin selbst beiträgt, sodass der Abstand der Kondensatoren (siehe unten) nicht
  herausragt.
- NFC-Feld, gemittelt über eine zum Leser parallel gehaltene Karte: 4,1 A/m an
  einer Karte, die auf dem Gehäuse liegt, 3,3 A/m mit dem Leser an einer
  Metallwand. ISO/IEC 14443 verlangt 1,5 bis 7,5 A/m an der Karte. Das Feld fällt
  19 mm vor dem Gehäuse auf 1,5 A/m (15 mm an einer Metallwand): bis dorthin
  wird eine Karte versorgt, die das volle Minimum des Standards braucht. Die
  meisten Karten brauchen weniger und werden weiter außen versorgt; ob der Leser
  ihre Antwort dort noch hört, steht nicht im Modell. Mehr Reichweite, falls die
  erste Platine sie will: Der Sender läuft mit 41 mA seiner 100 mA, die
  Anpassung hat also Spielraum (Inbetriebnahmeplan).
- PoE-Isolation: Der kürzeste Weg von 48-V-Kupfer zu jedem anderen Kupfer ist
  2,01 mm entlang einer Lage und 2,02 mm durch die Platine, an Pin 10 der Buchse
  auf jeder Lage; nirgends liegt 48-V-Kupfer über oder unter anderem Kupfer. In
  Luft halten 2,0 mm eine Spitze von 3,0 kV (IEC 60664-1); der 1500-V-Effektivwert-Test
  erreicht 2,1 kV. Nicht in dieser Zahl, weil sie in Bauteilen liegen: die
  4,5 mm zwischen den Pads von C102 (1,8 mm bis zum Industry-Review), die eigene
  Barriere des PoE-Moduls und die 0,5 mm zwischen Pin 9 der Buchse und der
  Metallrückseite des Displays, die das Polyimidband halten muss (siehe
  „PoE-Isolation“).
- Wärme im geschlossenen Gehäuse, auf 40 % genau geschätzt (Lehrbuchwerte für
  ruhende Luft, Anstieg über Raumtemperatur):

  | Versorgung | Typische Nutzung | Platine | Wärmste Stelle | Display | WLAN-Modul: Platine darunter, Hohlraum | Alles lange eingeschaltet: Platine, LED-Reihen, Platine des WLAN-Moduls, Hohlraum |
  |---|---|---|---|---|---|---|
  | USB | 2,5 W | +22 K | +33 K | +16 K | +27 K, +16 K | +39 K, +70 K, +48 K, +29 K |
  | DC, 12 V | 2,9 W | +26 K | +37 K | +19 K | +30 K, +19 K | +46 K, +75 K, +54 K, +34 K |
  | PoE | 3,5 W | +31 K | +40 K | +23 K | +35 K, +23 K | +52 K, +82 K, +60 K, +38 K |

  (Am 25. November 2026 mit dem C5, seinem Wandler und ihren Plätzen noch einmal
  gerechnet und am 26. November 2026 auf der für den SDIO-Bus neu verlegten
  Platine, mit denselben Zahlen, aber bei DC 1 K mehr an den LED-Reihen; mit dem
  C6 hatte jeder Fall 0,1 W weniger und bis zu 1 K weniger.) In einem Raum von
  25 °C ist die typische Nutzung weit von jeder Grenze entfernt. In einem Raum
  von 40 °C bei PoE setzt die Schätzung das Display auf 63 °C (Grenze 70 °C), die
  Luft um das PoE-Modul auf 71 °C (85 °C) und die Luft unmittelbar außerhalb des
  WLAN-Moduls zwischen 63 °C (der Hohlraum) und 75 °C (die Platine darunter;
  Grenze 85 °C): innerhalb der Grenzen, beim Display und beim PoE-Modul um
  weniger, als die Schätzung genau ist. Die Sicherung des DC-Eingangs hält dann
  0,66 A gegen 0,28 A Verbrauch. Die Verluste des Moduls, die Schranken und die
  daraus folgende Sendegrenze: „WLAN-Modul: ESP32-C5-MINI-1“. Alles gleichzeitig
  für lange Zeit eingeschaltet übersteigt, was das Gehäuse abführen kann: Die
  LED-Reihen auf schmalem Kupfer zwischen den Ausschnitten werden 70 bis 80 K
  wärmer als der Raum. Die Firmware begrenzt die LEDs und überwacht die
  Temperatur des Chips
  ([firmware-port.md](hardware/touch-p4/firmware-port.md)).
- Hall-Schalter: 22 mT vom Magneten des Docks am Schalter, 10,3 mm von dessen
  Fläche, und noch 16 mT mit dem schwächsten Magneten, 4 mm neben seiner Achse
  und 40 K wärmer; der Schalter braucht 4,8 mT. Abgehoben schaltet er womöglich
  nach 9 mm und hat nach 33 mm sicher geschaltet.
- Für die verwendeten Grenzen noch einmal gelesen: das Datenblatt des PN532
  (Senderstrom, Treiberwiderstand, Empfängereingang) und das der LED (ihre
  Zeichnung zeigt die Linsenseite; kopfüber montiert sind die Pads ihr
  Spiegelbild, was die Platine hat). Alle 82 Footprints gegen JLCPCBs Bibliothek
  nach der Änderung der drei Teilenummern: kein Problem.

Was dies nicht sagt: ob Pins und Footprints richtig sind (dafür sind die Reviews
oben da), ob das Flexkabel des Displays, das gekauft wird, reicht (seine Länge
ist eine Zahl aus einer Zeichnung; kein Modell macht sie sicherer), ob der
Leser eine Karte am Rand seines Feldes hört, wie sich die Platine in einem
EMV-Test schlägt, ob sich der PN532 der zweiten Quelle wie das Original verhält
und irgendetwas über Firmware. Die Modelle verwenden die typischen Werte der
Hersteller. Die Liste unten steht weiter, in einigen Punkten kürzer und mit
einem mehr.

### Branchen-Review

Im November 2026 wurde das Design an der Branchenpraxis gemessen: Lesbarkeit des
Schaltplans, Bauteile und Stückliste, Layout, Fertigungs- und Bestückungsunterlagen,
EMV und Sicherheit, Verifikation. ERC und DRC wurden ausgeführt, jedes Blatt wurde gerendert und
gelesen, und die folgenden Aussagen wurden an ihren Primärquellen geprüft. Die Änderungen
wurden im Generator gemacht, der die maßgebliche Quelle bleibt (siehe
[release.md](hardware/touch-p4/release.md)). Die Bewertungsskala, was jede Note verlangte, die Noten
vorher und nachher und die unterwegs getroffenen Entscheidungen stehen in [review.md](hardware/touch-p4/review.md).

| Befund | Änderung |
|---|---|
| Kernwandler: zwei 510 k im Rückkopplungsteiler. Espressifs Hardware Design Guidelines (v2.0, Schaltplan-Checkliste, Chip-Revision v3.0 und später): "The two 499 kΩ feedback resistors and one 22 pF feedforward capacitor must be populated". | R204 und R205 499 k 1 % (UNI-ROYAL 0402WGF4993TCE, C25793). |
| C102 (über der PoE-Barriere) und C410 (Schirm gegen Masse) waren 1-nF-/2-kV-Bauteile. Nach IEEE 802.3 §33.4.1 hält das Endgerät (Powered Device) 1500 V effektiv für 60 s aus, oder 2250 V DC für 60 s, oder zehn 1500-V-Impulse 10/700 µs (TI SLUA818; IEEE-Auslegung interp-3-0704). 2 kV liegt unter den 2,1 kV Spitze der ersten und unter der zweiten Prüfung. | C102: zertifizierter X1/Y2-Kondensator, Murata GA352QR7GF102KW01L (C91599), Bauform 2211, mit 2000 V AC für 60 s stückgeprüft (2,8 kV Spitze), auf einem Land Pattern mit 4,5 mm zwischen den Pads (Muratas Testplatine). C410: 1 nF / 3 kV, Fenghua 1808B102K302NT (C967608). Kein 1-nF-Bauteil mit 3 kV oder mehr ist in 1206 vorrätig (geprüft bei JLCPCB und LCSC am 25. November 2026). Die PoE-Abstandsregel nimmt C102 nicht mehr aus. |
| Schaltplan: Jedes Bauteil stand allein und war nur über Labels mit dem Rest verbunden; Text überlappte an mehreren Stellen (der Wert von U103 über seinen Pins, der Text der Buchse über ihren Pins, die oberen Labels des PHY, ein Gruppentitel über einem anderen, die USB-C-Pin-Nummern über den Pin-Namen, die NFC-Antenne vom Blattrahmen abgeschnitten). | Neu gezeichnet von einem neuen Generator (`scripts/bootstrap/sch_*.py`): verdrahtete Blöcke, die von links nach rechts lesen, Versorgung oben und Masse unten, Labels nur zwischen Blöcken und für Busse. Ein Überlappungs-Lint lässt den Build fehlschlagen, außer er findet nichts. KiCads Netzliste der neu gezeichneten Blätter stimmt Pin für Pin mit der Schaltungsbeschreibung überein. |
| Symbole: D101, D103, D106 als Zenerdioden gezeichnet; U702 als LIS2DE12, U703 als DRV5033, U701 als 74AHCT1G125, U104 als AP63203, U301 als MINI-1-N4. | Unidirektionale TVS-Symbole; jedes Symbol nach dem bestückten Bauteil benannt (`make_lib.derived_symbols()`). |
| Kondensatorwerte ohne Spannung und Dielektrikum. | Jeder Kondensator zeigt seine Nennwerte (zum Beispiel `16V X7R`), die Widerstände, bei denen die Toleranz zählt (Rückkopplungsteiler, Strommessung, NFC-Abstimmung, PHY-Vorspannung), ihre; die Nennwerte kommen mit der Bauteilnummer aus dem Herstellercode. |
| Schriftfelder ohne Datum; keine Revisionshistorie. | Datum, gezeichnet von, geprüft von und die Revisionshistorie auf dem Stammblatt. |
| Der Überlappungs-Lint sah nur Labels und Bauteilfelder: Ein Feld über dem Pin-Namen oder der Pin-Nummer eines anderen Symbols, über dem eigenen Körper oder ein Label über dem Text eines Pins kam durch. Der Körper des PN532 war für seine Pin-Namen zu schmal. | Der Lint nimmt jetzt auch Name und Nummer jedes Pins (wie KiCad sie platziert), die Pin-Linien und die Körper, mit 0,25 mm zwischen Texten; der Build schlägt bei jedem Treffer fehl. Textbreiten wurden an KiCads Schrift gemessen. Der PN532 ist 63,5 mm breit mit gespreizten oberen Pins, Referenz und Wert außerhalb des Körpers. Jedes Blatt wurde mit 200 dpi gerendert und Block für Block gelesen. |
| Stücklisten nur mit LCSC-Nummer und Wert. | Jede Zeile trägt Hersteller, Bauteilnummer, eine vollständige Beschreibung (mit Nennwert und Toleranz), eine Alternative und, für ICs und Module, den Lebenszyklusstatus des Herstellers (`scripts/bootstrap/parts_info.py`; [parts.md](hardware/touch-p4/parts.md) listet die Quellen). Das Display und die WLAN-Antenne, die JLCPCB nicht bestückt, stehen ebenfalls in den Stücklisten (die Antenne ist inzwischen mit der Platinenantenne des C5 entfallen). Ein Test schlägt fehl, wenn einem bestückten Bauteil diese Daten fehlen. |
| Keine Fertigungszeichnung, keine Netzliste für den Test der unbestückten Platine. | `fab/jlcpcb/attractap-touch-p4-fab.pdf` (Umriss, Maße, Bohrungen und Ausschnitte, Lagenaufbau, Bohrtabelle, Material, Oberfläche, IPC-Klasse, Via-Füllung) und `attractap-touch-p4.ipc` (IPC-D-356), beide von `export` geschrieben. |
| 3D-Modelle nur für den Display-Anschluss. | Ein Modell für jedes Footprint mit einem Körper (`kicad/lib/attractap.3dshapes/`, `scripts/bootstrap/collect_models.py`); ein Test schlägt fehl, wenn eines fehlt. |
| Versorgungs-ODER mit drei Schottky-Dioden: Die 5-V-Schiene lag bei etwa 4,6 V, die Dioden speisten warm in einen nicht angesteckten USB-Port zurück, und nichts begrenzte den USB-Einschaltstrom. | USB über eine eFuse (TPS259470A: Sanftanlauf, 2-A-Grenze, Rückstromsperre, Sperrschwellen), DC und PoE über ideale Dioden (LM74700-Q1 mit IRLML0030); siehe "Power". |
| 3,3-V-Wandler AP63203: kein Bestand bei LCSC oder JLCPCB. | TLV62569 (das Bauteil des Kernwandlers), aufgebaut wie von TI gezeigt. |
| Die 5-V-Schiene folgt jetzt ihrer Quelle; ihre Obergrenze war nicht gegen das angegeben, was die 5-V-Lasten aushalten. | Tabelle in "The 5 V rail's ceiling"; die OVLO der eFuse mit einem 0,1-%-Teiler öffnet zwischen 5,53 und 5,74 V. |
| DC-Eingang: Die TVS-Diode klemmt bei ihrem Nennstrom auf 45 V gegen die 40 V des Wandlers; welche Surge-Prüfung gilt, war nicht angegeben. | Normen ausgearbeitet (EN 301 489-1: keine an DC-Stromanschlüssen; EN 50130-4: Leitung gegen Erde über 42 Ohm); eine bidirektionale TVS-Diode am Anschluss und eine 100-V-Verpolschutzdiode; `sim/dc_surge.cir`: höchstens 39,6 V am Wandler. |
| 3,3-V-Schiene: etwa 76 uF effektiv bei 3,3 V an einem Wandler, den TI bis 52,8 uF nachgewiesen hat. | Etwa 49 uF: ein 10 uF am Wandler, 10 uF am WLAN-Modul, 4,7 uF am Näherungssender; ein Test addiert sie. Seit dem C5: 44,5 uF, das WLAN-Modul an einem eigenen Wandler mit 47,2 uF, seine eigenen Kondensatoren eingerechnet; ein Test je Schiene. |
| DRC mit abgesenkten Schweregraden ausgeführt (50 Warnungen bei KiCads Standardwerten). | KiCads Standard-Schweregrade, keine Regel abgeschaltet oder abgesenkt: 0 Fehler, 0 Warnungen, 0 nicht verbundene. Bestückungsdruck im Generator von Pads und Platinenrändern zurückgenommen; Passmarken mit Kupfer-Sperrfläche; überall 3 mm PoE-Abstand. |

#### Land Patterns gegen die Zeichnungen der Hersteller

`check-footprints` vergleicht jedes Footprint mit JLCPCBs Bibliothek, derselben EasyEDA-
Quelle, aus der die meisten konvertiert wurden. Die kritischen wurden zusätzlich gegen
die eigenen Zeichnungen der Hersteller vermessen (Pad-Tabellen von einem Skript aus den Footprint-Dateien gelesen;
die Maße der Zeichnungen, in den Vektorgrafiken des PDF, wo der Text keine Zahl gab).
Verwendete Toleranz: innerhalb von 0,05 mm ist eine Übereinstimmung; ein Pad, das um bis zu etwa
0,2 mm länger oder verschoben ist, wobei der Anschluss noch bedeckt ist, ist eine akzeptable Abweichung; ein falsches Raster, eine falsche Pin-
Reihenfolge oder Lochposition ist ein Defekt.

| Bauteil | Dokument | Ergebnis | Änderung |
|---|---|---|---|
| U201 ESP32-P4 (QFN-104, 0,35 mm) | Datenblatt v0.7 Abb. 6-1 (Gehäuse); Espressifs KiCad-Footprint `ESP32-P4.kicad_mod` (espressif/kicad-libraries, 2025-10-07), da weder Datenblatt noch Guidelines ein Land Pattern angeben | Raster, Anzahl, Pin 1 und Nummerierung stimmen überein (schlechtester Wert 0,005 mm). Die konvertierten Pads waren 0,15 x 0,65 mm, 0,125 mm weiter außen als Espressifs 0,20 x 0,65 mm, und teils gedreht, teils mit vertauschter Breite und Länge gespeichert | Espressifs 0,20 x 0,65 mm von 4,55 bis 5,20 mm Abstand von der Mitte, Lötstopplack-Aufweitung 0,025 mm (Steg 0,10 mm). Die acht Eckpads enden innen 0,04 mm früher: 0,163 mm über jede Ecke, wo Espressifs Muster 0,113 mm hat und JLCPCB 0,15 mm zwischen Pads verlangt. Der Konverter hatte die Pad-Positionen auf 0,01 mm gerundet (stellenweise Lücken von 0,14 mm); jedes Pad sitzt jetzt auf dem 0,35-mm-Raster (`make_lib.p4_signal_pads`) |
| U105 TPS259470A (VQFN-10 RPW, 2 x 2 mm) | TI SLVSFC9C, Gehäuse RPW0010A und Beispiel-Platinenlayout | Die konvertierten Pads sind TIs Polygone, gezeichnet mit einer 0,1-mm-Kontur, die ringsum 0,05 mm Kupfer hinzufügt | Kontur entfernt: Das Kupfer ist TIs Land (`make_lib.custom_pad_strokes`) |
| U301 ESP32-C5-MINI-1 | Datenblatt v1.4 Abb. 11-1 (mit 300 dpi gelesen), Pin-Belegung Abb. 3-1 | 60 Pads 0,40 x 0,80 mit 0,85 mm Raster, 15 je Seite, erster bis letzter 11,90, Reihen 14,00 auseinander von Mitte zu Mitte; Eckpads 62 bis 65 0,80 x 0,80 an den Reihenkreuzungen; neun Masse-Pads 1,20 mm mit 1,65 mm Raster (4,50 insgesamt; die Zeichnung schreibt das Raster als 1,7), auf dem Modul zentriert; Antennenbereich 5,85 mm, seine Grenze 7,75 mm über der Pad-Mitte, die Unterkante des Moduls 7,70 darunter; Nummerierung ab Pin 1 oben an der linken Seite, gegen den Uhrzeigersinn, 46 bis 60 entlang der Antennenkante: alles stimmt innerhalb von 0,05 mm überein. Die Zeichnung fasst ein Masse-Pad als Pin-1-Markierung ab; das des Footprints ist quadratisch | keine |
| J101 USB-C TYPE-C-31-M-12 | HRO-Zeichnung 2020-12-08 | Raster, Pin-Reihenfolge, Signal-Pads, Positionierlöcher und Positionen der Schirmschlitze stimmen überein. **Die vier Leistungs-Pads waren Polygone mit 0,1-mm-Kontur: 0,70 x 1,40 mm in Kupfer, 0,10 mm von VBUS zu GND**, wo die Zeichnung 0,20 mm hat. Pads 0,19 mm weiter hinten als gezeichnet und Schirmschlitze 0,2 mm breiter: akzeptabel | Leistungs-Pads 0,6 x 1,3 mm (`make_lib.usb_c_power_pads`); die DRC-Ausnahme, die 0,09 mm an J101 erlaubte, entfällt |
| J102 PJ-002A | Dasselbe Datenblatt von Sky, Rev. 1.05 | Anschlusspositionen, Schlitze und Ausrichtung stimmen überein | keine |
| J103 WAGO 250-202 / 2601-3102 | WAGO-Datenblätter 250-202 (2019-05-01), 2601-3102 (2022-08-15) | Raster 3,5, Reihen 5,0 und Umrisse stimmen überein; Pin 1 bei beiden vorn rechts. Löcher 1,2 mm passen zur 2601 und liegen 0,1 mm über dem Maximum der 250 | keine; die Lochfüllung an den ersten Platinen prüfen |
| J401 HY931147C | HanRun REV.A/1, Montagemuster | Signal- und Schirmpins und Pin 1 innerhalb von 0,005 mm; große Löcher 11,40 gegen 11,43 mm; LED-Löcher 1,10 gegen 1,02 mm | keine |
| J601 FH12-40S-0.5SH(55) | Hirose-FH12-Katalog (2016-11-01) | Raster, Spannweite, Haltelaschen und Pin 1 stimmen überein. Signal-Pads 0,25 mm, Hiroses Schablonenöffnung, gegen 0,30 mm Kupfer | Kupfer 0,30 mm, Paste 0,25 mm (`make_lib.fpc_signal_pads`) |
| U102 DP9900M / Ag9905M | SDAPO-Datenblatt der Serie DP9900, Abschnitt 4.1 (Gehäuse und Platinen-Footprint); Silvertel Ag9900 V3.5 Abb. 3, 19, 23 | Pads 1,25 x 4,0 mm, 2,54 mm Raster, Gruppen 13,56 auseinander (SDAPO 13,57), Reihen 14,00: SDAPOs Muster innerhalb von 0,01 mm; Silvertels Pins innerhalb von 0,03 mm. **Die Sperrfläche unter dem Modul war nicht Silvertels gestuftes 3-mm-Band** | Das Band von Abb. 23, auf jeder Lage frei von Kupfer (Stufe 3, mit der 3-mm-Isolation) |
| U501 PN532 (QFN-40) | Tokmas-Datenblatt (Dez. 2025); NXP-Reflow-Footprint SOT618-1 (2022-11-25) | Pads 0,28 x 0,665 mm bei 6,485 / 5,155 gegen NXPs 0,29 x 0,90 bei 7,00 / 5,20: 0,24 mm über den Körper hinaus (NXP 0,50, IPC 0,30), akzeptabel; das Exposed Pad passt zu beiden Herstellern | keine |
| U401 IP101GRI (QFN-32) | IC-Plus-Datenblatt R01 (2014); nominale Ziele nach IPC-7351B (Zehe 0,30, Ferse 0, Seite -0,04, wie in KiCads Footprint-Generator) | Raster, Pin 1 und Zehe richtig; Ferse 0,10 mm zu kurz, akzeptabel; Exposed Pad 2,80 gegen 2,70 | keine |
| L102 CKCSA4020-6.8uH (kein JLCPCB-Footprint) | CENKER-Datenblatt, empfohlenes Muster | Pads 1,6 x 3,5 mm mit 1,6 Abstand gegen 1,4 x 3,7 mit 1,2 Abstand: Die Anschlüsse sind bedeckt. Anschlüsse entlang x: Bestückungswinkel 0 (oder 180), wie der Export ihn schreibt | keine |

#### Gehäusepassung gegen die 3D-Modelle

Die Platine wurde mit dem Modell jedes Bauteils exportiert (`kicad-cli pcb export step`), in
das Gehäusedesign gesetzt (`case/cad/attractap-touch-case.sc`: Bestückungsseite bei `z_pf`,
X = 103 − x, Y = 79,15 − y in KiCad-Koordinaten) und mit den Kollisions- und Abstandsprüfungen von SolidCraft
gegen Kappe, Dock, Displayrahmen und das LCD-Modul geprüft. Höhen sind die der Hersteller, wo sie eine angeben.

| Bauteil | Höhe über der Platine | Nächstes Gehäuseteil | Spalt |
|---|---|---|---|
| J401 RJ45 | Körper 13,95 max.; Schirmfedern an der Öffnung 15,21 ± 0,50 (HanRun HY931147C REV.A/1, Seitenansicht) | Dock-Platte, 13,9 mm von der Platine (`cav`), mit einer 0,8 mm tiefen Vertiefung unter der Buchse und einem Fenster hindurch unter den beiden Federn | Körper 0,90 mm bis zur Vertiefung, 0,70 mm im Maximum; Federn 1,70 mm bis zur Wand hinter dem Fenster, 1,14 mm im Maximum, 1,0 mm bis zu den Seiten des Fensters |
| U102 DP9900M | 13,35 ± 0,5 (SDAPO-Datenblatt 4.1) | Dock-Platte, mit einer 0,8 mm tiefen Vertiefung unter dem Modul | 1,35 mm, 0,80 mm im Maximum |
| J103 WAGO 250-202 | 13,2 (Modell) | Dock-Platte | 0,70 mm |
| J102, J103 Pins | 1,95 mm aus der Displayseite | Vorderwand der Kappe | 0,44 mm |
| J401 Pins | 1,45 mm aus der Displayseite, ungekürzt | LCD-Modul, 1,5 mm von der Platine | 0,1 mm; 0,5 mm auf 1 mm gekürzt, wie die Anleitung sagt |
| J101 USB-C | 3,25 | Seitenwand der Kappe | 0,63 mm |
| C120 47 uF Elektrolytkondensator, 6,3 mm | 7,7 (Modell) | Dock-Platte; Seitenwand der Kappe | 6,2 mm; 13,9 mm |
| Bauteile der Review-Stufe 3: D106, D107 (SMB), F102, U105, U106, U107, Q101, Q102, U204 | höchstens 2,4 | keines innerhalb von 3 mm | mehr als 3 mm |

Am 25. November 2026 mit den Bauteilen der Review-Stufe 3 erneut geprüft (SolidCrafts
Abstandsprüfung, 3 mm und 15 mm). C120 hält auch Abstand zum gefalteten Display-Flexkabel,
das das Gehäusedesign nicht modelliert: Sein Modell (x 13,9 bis 21,7, y 60,7 bis 67,3)
endet 8,7 mm vor dem Bereich, in dem das Flexkabel liegt (y 76 und darüber hinaus), und 10,8 mm links vom
Weg des Flexkabelendes zu J601 (x 32,5 bis 55,5); die Falte selbst liegt im Schlitz bei
y 89,5 bis 92,5, 22 mm entfernt. Der Build bricht ab, wenn ein Bauteil, das höher ist als ein kleines
Passives, in den Flexkabelbereich ragt (`placement.check_flex_area`).

Die Platte des Docks unter der Buchse und dem PoE-Modul (25. November 2026). Wie zuerst
gezeichnet, ragten die beiden Schirmfedern der Buchse 1,3 mm in die Platte, und das Modul
stand 0,55 mm von ihr entfernt. An den Modellen der Bauteile im Gehäuse gemessen: Von der Buchse kommen nur
die beiden Federn, je 1,9 mm breit an der Öffnung der Buchse, näher als 13,9 mm an
die Platine; ihr Körper und der Rest des Schirms bleiben bei 13,75 mm, das Modul
bei 13,3 mm. Die Platte hat jetzt unter jedem Bauteil eine 0,8 mm tiefe Vertiefung (ringsum 1 mm breiter als
das Bauteil) und unter den beiden Federn ein Fenster durch die Platte
(9,5 x 6,9 mm), sodass bei den Maximalhöhen der Hersteller jedes Bauteil mindestens
0,70 mm Abstand hält (Tabelle oben). Das untere Paar der Wandschrauben, das zu einer
Unterputzdose passt, stand unter den Federn; es wanderte 8,5 mm nach unten, und die Kabelöffnung
darunter verlor 2 mm an ihrer Oberkante, um einen Steg um die Senkungen der Schrauben zu behalten.
Die Platte bleibt in den Vertiefungen 2,2 mm dick, druckt ohne
Stützen auf ihrer Rückseite und liegt flach an der Wand oder am Ständer. Die Öffnungen
stehen 47 mm von der Achse des Näherungssensors entfernt, dessen Licht auf der Platte 8 mm von
ihr endet (`geometry.DOCK_OPENINGS`; ein Test prüft den Abstand), und 56 mm von der
Achse des Magneten: Die Messung des Sensors auf dem Dock und das Feld des Hall-Schalters
(`sim/dock.py`: 22 mT, 16 mT im ungünstigsten Fall) sind unverändert. Die Bohrschablone
in der Installationsanleitung zeigt die neuen Schraubenpositionen und die Öffnungen.

Drei der konvertierten Modelle wurden von easyeda2kicad neben ihre Pads gesetzt: die DC-Buchse
um 8 mm, die USB-C-Buchse um 2,2 mm und der Display-Anschluss um 2,6 mm.
`collect_models.py` schiebt jetzt jedes Modell auf seine Pads und Löcher (`model_fit.py`), und
ein Test schlägt fehl, wenn die Pins eines Modells die Löcher oder seine Anschlüsse die Pads verfehlen.

### Offen: auf dem Papier nicht zu klären

- **Das Display-Flexkabel und die Pins der Buchse.** Sie ziehen in entgegengesetzte Richtungen:
  Das Flexkabel will das Display nah an der Platine (höchstens 2,0 mm nach der
  Zeichnung, +-0,4 mm), die Pins der Buchse wollen es weg (sie sind mindestens 1,45 mm
  lang). Bei 1,5 mm mit gekürzten Pins hat jede Seite 0,5 mm. Eine zweite Zeichnung
  desselben Panels zeigt ein um 0,8 mm kürzeres Flexkabel, und Panels anderer Hersteller können
  abweichen. Eine Platine lässt sich nicht reparieren, wenn das Flexkabel zu kurz ist. Legen Sie vor dem Bestellen
  das Panel, das Sie kaufen werden, mit einem 1,5-mm-Abstandshalter auf einen 1:1-Ausdruck (erster Schritt des
  Inbetriebnahmeplans) und messen Sie, wie weit die Pins einer echten Buchse herausragen. Wenn das
  Flexkabel bei 1,5 mm nicht reicht, ist der Ausweg die Buchse unterhalb des Displays
  (Commit 74add084d hat diese Platine) mit einem um 19 mm längeren Gehäuse.
- **Abblockung am MCU.** 4 seiner 21 Versorgungspins haben einen Kondensator
  innerhalb des Review-Ziels (3 mm Kupfer für die Kern-, Speicher- und
  Reglerpins, 5 mm für IO); die anderen erreichen ihre über Vias und die
  Flächen (siehe "Decoupling and crystal at the MCU"). Simuliert beträgt der Anteil der Platine am Weg von einem Pin
  zu seinen Kondensatoren 1,2 bis 2,4 nH, etwa so viel, wie das Gehäuse
  selbst beiträgt. Wenn der MCU bei voller Taktfrequenz instabil läuft,
  ist dies der erste Verdächtige; siehe "Accepted deviations", warum Revision A
  einseitig bleibt und was eine spätere Revision tun kann.
- **NFC-Reichweite und Abstimmung**, der zweite PN532-Lieferant und die Wirkung von
  Ethernet-Stecker und -Kabel neben der Schleife bei der Version lan. Die Induktivität der Schleife
  ist simuliert (1,25 uH auf der Platine, 1,20 uH an einer Metallwand), nicht
  gemessen. Mit den bestückten Werten bleibt jede Platine sicher innerhalb der
  Grenze des Senders zwischen 1,12 und 1,25 uH, und 99 von hundert zwischen
  1,08 und 1,27 uH. Auch das Feld ist simuliert: Es versorgt eine Karte bis 19 mm
  vor dem Gehäuse (15 mm an einer Metallwand). Was kein Modell hier sagt, ist,
  wie gut der Leser die Karte hört.
- **WLAN-Antenne und Reichweite.** Die Antennen sind gewählt, und das Gehäuse hat
  einen Schacht für eine, mit eingezeichnetem Kabelweg (siehe "Wi-Fi antenna"); ob die
  zertifizierte Antenne hineinpasst, wartet auf ihre Zeichnung. Das Antennenmodell oben wurde
  für das Modul mit Platinenantenne gemacht und sagt nichts über eine Antenne im
  Schacht. Vergleichen Sie den ersten Leser mit einem aktuellen (Inbetriebnahmeplan).
- **Isolation der PoE-Seite** unter einer 1500-V-Prüfung (siehe "PoE isolation").
  Das Kupfer der Platine hält überall 2,0 mm ein, an der verlegten Platine gemessen,
  was in Luft für diese Prüfung genügt. Was eine Prüfung zeigen muss, ist, was in
  den Bauteilen und in der Baugruppe liegt: das Modul, C102 und das Klebeband zwischen
  Pin 9 der Buchse und dem Display.
- **Wärme.** Die obige Schätzung hält den Leser im typischen Betrieb innerhalb seiner Grenzen,
  mit wenig Reserve bei PoE in einem Raum von 40 °C. Messen Sie es: geschlossenes
  Gehäuse, an der Wand, nach einer Stunde (Inbetriebnahmeplan). Ist es wärmer als
  geschätzt, sind die LEDs und die Hintergrundbeleuchtung das, was die Firmware zurücknehmen kann.
- **Manipulationssensoren.** Was der Näherungssensor auf dem Dock und abseits davon liest,
  mit Docks in den verwendeten Farben, und ob Licht auf dem Gehäuse diese Messung
  verschiebt. Ob der Hall-Schalter bei den berechneten Abständen einschaltet und loslässt (erneut simuliert: sicher an auf dem Dock, aus nach 9 bis
  33 mm Anheben), ob der Magnet des Docks den Klang des Summers verändert und welche
  Schwellen des Beschleunigungssensors ein Klopfen von einer schließenden Tür unterscheiden.
- **Hot-Plug eines 24-V-Netzteils.** Laut Simulation bleibt der Eingang des Wandlers
  unter 35 V, gegen seine Grenze von 40 V, seit der 47-uF-Elektrolytkondensator C120
  den Eingang dämpft (siehe "Power"). Der Wert stammt aus einem Modell, messen Sie ihn also an
  der ersten Platine, mit einigen Metern dickem Draht zu einem steifen Netzteil
  (Inbetriebnahmeplan).
- **Der USB-Port an einem warmen Leser, der aus einer anderen Quelle läuft.** R104 hält
  VBUS des nicht angesteckten Ports nahe 0 V gegen die wenigen Mikroampere, die die eFuse U105
  zurückspeist (siehe "Power"). Prüfen Sie an der ersten Platine, warm, dass ein USB-C-Host
  seine Versorgung weiterhin einschaltet (Inbetriebnahmeplan).
- **Die Stabilität des 3,3-V-Wandlers.** Die Kondensatoren der Schiene kommen auf etwa
  49 uF effektiv, am oberen Ende dessen, was TI für den
  TLV62569 als stabil nachgewiesen hat (siehe "Power"). Ein Laststoß an der ersten Platine, mit und ohne
  den Feed-forward-Kondensator C108, zeigt den Spielraum (Inbetriebnahmeplan).
- **Was das Leistungsbudget voraussetzt.** Es verlässt sich darauf, dass die Firmware die
  LEDs zusammen unter 100 mA hält und nur piept, solange das NFC-Feld aus ist, und
  es nimmt 60 mA für die 3,3-V-Versorgung des Displaypanels an (siehe "Power"). Messen Sie
  das Panel und prüfen Sie beide Firmware-Grenzen an der ersten Platine (Inbetriebnahmeplan).
