# Design
<!-- llms-description: Der aktuelle Entwurf der Touch-P4-Platine und der Grund für jede Wahl: Mechanik, Stromversorgung, PoE-Potenzialtrennung, NFC, Ethernet, WLAN, Manipulationserkennung, ESD und Layout. -->

Was die Platine ist und warum, ein Abschnitt je Block, für Hardware-Entwickler. Die Ziele, an denen der Entwurf gemessen
wird, stehen in [Designstandards und Review-Kriterien](hardware/touch-p4/review.md); wo die Platine eines davon
verfehlt, siehe [Bekannte Einschränkungen](hardware/touch-p4/limitations.md).

Koordinaten auf dieser Seite: KiCad-Draufsicht auf die Bestückungsseite, Ursprung oben links an der Platine, x nach
rechts, y nach unten, Millimeter. Der Nutzer sieht auf die andere Seite.

## Entscheidungen

| Block | Wahl | Begründung |
|---|---|---|
| MCU | ESP32-P4NRW32X (Chip, Silizium v3.x) | Display-Leistung. Der P4 hat kein Funkmodul |
| WLAN und Bluetooth | ESP32-C5-MINI-1-N4-V1.2 über SDIO, mit esp-hosted | Wi-Fi 6 auf 2,4 und 5 GHz, zertifiziertes Modul mit eigener Platinenantenne, bei JLCPCB auf Lager |
| WLAN-Antenne | die Dualband-Platinenantenne des Moduls, über einem Ausschnitt im oberen Rand | Nichts zu kaufen oder zu montieren; vom Zertifikat des Moduls abgedeckt |
| Display | handelsübliches 4,0-Zoll-RGB-Panel mit 480 x 480 (ST7701S, GT911) | Größe und Auflösung der heutigen Leser; MIPI-Panels dieser Größe kosten ein Mehrfaches |
| NFC | PN532 auf der Platine, in einem eigenen Bereich unterhalb des Displays | Der NFC-Stack der Firmware bleibt. Die Metallrückseite des LCD schirmt 13,56 MHz ab, daher kann die Schleife nicht hinter dem Bildschirm liegen |
| LAN/PoE | gleiche Platine, bei der WLAN-Version nicht bestückt | Ein Entwurf, der zu pflegen und zu zertifizieren ist |
| PoE | fertiges, isoliertes Modul (SDAPO DP9900M-5V oder Silvertel Ag9905M) | Kein Transformator-Entwurf |
| Versorgung | DC 12 bis 24 V, PoE oder USB-C auf eine 5-V-Schiene, jeweils über einen Schalter, der Rückstrom sperrt (eFuse für USB, ideale Dioden für DC und PoE) | Jede Kombination darf angeschlossen sein; keine Quelle speist eine andere; die Schalter verlieren fast nichts |
| DC-Anschlüsse | Hohlsteckerbuchse 5,5 / 2,1 mm und WAGO-250-Drucktasten-Klemme parallel | Steckernetzteile und blanke Drähte funktionieren beide. Das Klemmen-Footprint nimmt auch die WAGO-2601-Hebelklemme auf (das 13-Fache des Preises) |
| Ethernet-Buchse | hinter der unteren rechten Ecke des Displays, 51 mm über dem unteren Platinenrand | Ein Stecker mit Knickschutz und der Bogen des Kabels in die Wand brauchen 49 mm unterhalb der Buchse innerhalb des Gehäuses. Unterhalb des Displays wäre das Gehäuse 19 mm länger. Der Preis: Die Pins der Buchse ragen hinter dem Display heraus (siehe [Displaymontage und Flexkabel](#displaymontage-und-flexkabel)) |
| USB-C | Service-Anschluss am Platinenrand neben dem MCU | Nur zum Flashen und Debuggen, nie für Nutzer vorgesehen |
| Manipulationserkennung | Beschleunigungssensor, Infrarot-Näherungssensor, der auf die Platte des Docks blickt, Hall-Schalter, der einem Magneten im Dock gegenübersteht | Stöße und Abreißen; „vom Dock“, erkannt aus dem geschlossenen Gehäuse; ein zweites, einfacheres Signal für „vom Dock“. Alle über I2C |
| Bestückung | alle Bauteile auf einer Seite | Das Display wird auf die andere Seite geklebt; eine Bestückungsseite ist günstiger |
| Lagen | sechs: Signale auf beiden äußeren Lagen und In2, jeweils neben einer eigenen Fläche | Zwei Signallagen reichen um den MCU nicht aus; bei vier Lagen zerschnitt die dritte Signallage die 3,3-V-Fläche und ließ die schnellen Busse ohne Rückstromfläche |

## Betrachtete Alternativen

- ESP32-S31-WROOM-1 (ein Modul mit Wi-Fi 6 und Ethernet-MAC): nicht auf Lager, in ESP-IDF nur Preview-Unterstützung.
- Waveshare-ESP32-P4-Modul: keine Funkzertifikate.
- ESP32-S3: kein Geschwindigkeitsgewinn gegenüber den heutigen Lesern.
- ESP32-C5-WROOM-1: zertifiziert, aber keine Variante bei JLCPCB oder LCSC auf Lager.
- ESP32-C5-MINI-1U / C5-WROOM-1U (externe Antenne): kein veröffentlichtes RED-Zertifikat für das MINI-1U; das WROOM-1U
  braucht eine neu gelegte Ecke und eine Antenne obendrauf.
- ESP32-C5-MINI-1, Variante -N8R2 (8 MB Flash, 2 MB PSRAM): nicht bei JLCPCB; der Co-Prozessor braucht keines von
  beiden.
- Leserchips der RC522-Familie statt des PN532: nur ein Funk-Frontend; die Firmware bräuchte einen neuen Treiber
  einschließlich ISO 14443-4 und die Platine ein neues Anpassnetzwerk.
- Die Platine in eine sechslagige MCU-Platine und einen günstigeren Träger teilen: kostet bei jeder Stückzahl mehr,
  sobald das Steckverbinderpaar und die zweite Bestückung mitgezählt sind (Zahlen in [Bauteile und
  Beschaffung](hardware/touch-p4/parts.md)).

## Mechanik

Das 3D-druckbare Gehäuse selbst ist unter [Gehäuse](hardware/touch-p4/case.md) beschrieben.

| Element | Position |
|---|---|
| Platine | 86 x 143,5, Eckenradius 2, beide unteren Ecken ausgeschnitten |
| Streifen über dem Display | y 0 bis 7: die WLAN-Antenne, zwei Befestigungslöcher |
| WLAN-Modul | x 20,1 bis 35,5, y 0,3 bis 21,6 (Pad-Mitte 27,8; 13,9), Antenne oben; sein Wandler in der Spalte links davon |
| Ausschnitt im oberen Rand unter der WLAN-Antenne | x 8,6 bis 37,5, y 0 bis 6,0; kein Kupfer auf irgendeiner Lage für x unter 50,5, y unter 6,3 |
| Display-Deckglas (84,3 x 84,3) | x 0,85 bis 85,15, y 7,0 bis 91,3 |
| LCD-Modul (Metallrückseite) | x 5,6 bis 80,4, y 12,8 bis 89,4 |
| Flexkabel-Schlitz (hinter dem Display) | x 33,05 bis 54,65, y 73,3 bis 83,8 |
| Ethernet-Buchse | x 68,8 bis 84,9, y 71,2 bis 92,8, öffnet nach unten in ihren Ausschnitt. Pin-Reihen bei y 73,0 und 75,55, hinter dem Display |
| Ausschnitt für den Ethernet-Stecker | x über 69,5, y über 92,5 (16,5 x 51) |
| Ausschnitt für den DC-Stecker | x unter 12, y über 107,5 (12 x 36) |
| Tap-Kachel (am Gehäuse) | Mitte (43; 117), auf der Mittellinie des Gehäuses; Schleife, LED-Ring und Kachel haben diese Mitte gemeinsam |
| NFC-Schleife | 35 x 37, Mitte (43; 117), auf der Displayseite |
| LEDs | 16 auf einem quadratischen Ring, auf jeder Seite 21,4 von (43; 117) entfernt (x 21,6 und 64,4, y 95,6 und 138,4), vier je Seite bei 5,35 und 16,05 von der Seitenmitte, 10,7 voneinander entlang des Rings; jede in einem Fenster von 3,4 x 3,0 mit freigestellten Ecken, die lange Seite entlang des Rings |
| LED-Versorgung | Schalter U705, Pegelwandler U701 und der 100-uF-Kondensator C725 in einer Reihe zwischen dem Flex-Schlitz und der Oberseite des Rings, x 36 bis 58, y 84 bis 93 |
| PN532-Block | unter dem Display, Chip bei (21,5; 80,1), Senderpins nach unten zu den Antennenzuleitungen |
| Befestigungslöcher (3,2 mm) | (4; 3,5), (82; 3,5), (17,4; 140), (16; 122) |
| DC-Buchse | x 0,2 bis 9,2, y 93,6 bis 108, öffnet nach unten in den DC-Ausschnitt |
| DC-Klemme | Mitte (15,5; 100,2), die Drähte treten von unten im Winkel von 40 Grad ein |
| USB-C | rechter Platinenrand, y 13,5 bis 22,5, öffnet seitlich |
| Massepads des Displays (5 x 5, blank, Displayseite) | (12,0; 23,5), (64,2; 37,2), (48; 17), (18; 36,5) |

### Displaymontage und Flexkabel

Für die Pinbelegung dient die Panel-Zeichnung Hongxiangrui HXR040WQI-H401-R4018 (dieselbe Pinbelegung wie das Waveshare
ESP32-S3-Touch-LCD-4). Die Mechanik stammt von einem Muster-Panel, gemessen am 26. November 2026: Glas 84,23 x 84,25 mm,
3,5 mm von der Vorderseite des Glases bis zur Metallrückseite (die Zeichnung sagt 3,14). Der Umriss des LCD-Moduls
stimmt mit der Zeichnung überein: Der danach gedruckte Displayrahmen passt auf das Muster.

- Das Flexkabel verlässt den unteren Rand des LCD-Moduls 1,9 mm über dem Rand des Deckglases, die Kontakte zeigen vom
  Glas weg. Der eigene Schwanz des Touch-Panels trägt den Touch-Controller und ist auf den Hauptschwanz gelötet.
  Zusammen sind sie von knapp unter der Glaskante bis etwa 13,5 mm dahinter steif (Chipstück etwa 10 x 8 mm bei x 15
  bis 25, seine Lötstelle und eine seitliche Lasche des Hauptschwanzes): Keine Biegung darf diesen Teil kreuzen.
  Danach geht nur der glatte Kontaktstreifen weiter, 20,4 mm breit, seine versteiften Kontakte ab 19,4 mm, sein Ende
  25,6 mm vom Rand des Deckglases.
- Das erste Layout führte das Flexkabel durch einen Schlitz knapp unter dem Modulrand und um die Platine herum auf die
  Bestückungsseite. Beide Biegungen dieses Wegs fallen in den steifen Teil, mit dem echten Panel geht er also nicht.
- Jetzt faltet sich das Flexkabel um 180 Grad um den unteren Rand des Moduls und liegt flach auf der Metallrückseite,
  was es ohne Spannung tut (am Muster ausprobiert). Der Touch-Controller zeigt zur Platine: 1,3 mm von der Unterseite
  des Flexkabels bis zur Oberseite des Chips. Hinter dem steifen Teil geht der Kontaktstreifen durch einen Schlitz
  hinter dem Display (x 33,05 bis 54,65, y 73,3 bis 83,8, mittig zu J601), in einer S-Biegung auf die Bestückungsseite
  und in J601. Das gefaltete Flexkabel reicht 25,6 mm vom Rand des Deckglases; nach der S-Biegung liegt sein Ende etwa
  3,6 mm hinter der Öffnung des Steckverbinders (y 72,3).
- Der Schlitz ist 10,5 mm lang. Beim ersten Druck war er 3 mm (y 73,3 bis 76,3), und der Streifen ging schräg in J601;
  der längere Schlitz lässt ihn flach einlaufen. Das Ende des steifen Teils (13,5 mm vom Rand des Deckglases, aus Fotos
  abgelesen, +-0,5 mm) liegt jetzt über dem Schlitz, was nicht stört: Der steife Teil liegt auf der Metallrückseite,
  nicht auf der Platine. Der Schlitz erlaubt dieses Ende irgendwo zwischen 7,5 und 18 mm.
- Den Abstand von der Platine zur Metallrückseite begrenzen unten der Chip (1,3 mm, plus 0,2) und die Pins der
  Ethernet-Buchse, oben die Länge des Flexkabels für die S-Biegung: **1,5 bis 2,0 mm**. Das Gehäuse hält das Display
  bei **1,7 mm**.
- Die Pins der Ethernet-Buchse stehen mindestens 1,45 mm aus der Displayseite heraus (Mindest-Pinlänge laut Datenblatt
  3,05 mm, kein Maximum). Hinter der Metallrückseite liegen die Pins 1 bis 8, 11, 12 (Signale, 3,3 V), eine
  Schirmlasche und ein Kunststoffzapfen; die 48-V-Pins 9 und 10 kommen 0,8 und 2,1 mm daneben heraus.
- Also: **die Pins, Laschen und Zapfen der Buchse** nach dem Löten auf der Displayseite **auf 1 mm kürzen** und
  **Polyimidband** auf die Metallrückseite über x 66 bis 80,4, y 69 bis 89,4 kleben, 2 mm um die Seitenkante des Moduls
  neben Pin 9 herumgeschlagen. Bei 1,7 mm halten die gekürzten Pins 0,7 mm Abstand zur Metallrückseite; ungekürzt wären
  es bestenfalls 0,25 mm.
- Nach der Faltung und der S-Biegung zeigen die Kontakte zur Platine: J601 ist ein **Hirose FH12-40S-0.5SH mit
  Kontakten unten**, mit seiner Öffnung zum Schlitz. Von der Bestückungsseite gesehen liegt Panel-Pin 1 rechts, also
  **Steckverbinder-Pin k = Panel-Pin 41 - k**; Schaltplan und Platine berücksichtigen das.
- Auf der Bestückungsseite deckt das Flexkabel nur den Streifen vom Schlitz in J601 ab (`geometry.FLEX_KEEPOUT`,
  x 32,5 bis 55,5, y 66 bis 84,5). Dort stehen nur Bauteile bis 0,9 mm Höhe; sonst bricht `placement.check_flex_area`
  den Build ab. Auf der Displayseite deckt es x 14,5 bis 62,5, y 72,5 bis 89,4 ab (`geometry.FLEX_BEHIND_LCD`); dort
  liegt kein Massepad (ein Test prüft das).
- Die Metallrückseite wird über Leitband oder Leitschaum auf mindestens zwei der vier blanken Massepads mit der Masse
  der Platine verbunden, außerhalb des Bereichs des Montagebands. Entladungen auf das Glas landen auf der
  Metallrückseite.

Bezugsquellen für das Panel. Das Panel ist ein gängiger Typ: 84,3 x 84,3 mm, 40-poliges Flexkabel mit 0,5 mm Raster, die
Pins 16 bis 33 sind DB0 bis DB17. Die Platine nutzt 16 Datenleitungen; Pin 16 (Blau-LSB) und Pin 28 (Rot-LSB) liegen auf
Masse. Die Zeichnung stammt aus dem Datenblatt, das Makerfabs für sein 4,0-Zoll-Display veröffentlicht (Hersteller
Shenzhen Hongxiangrui); kein Shop führt die Modellnummer des Herstellers.

| Angebot | Was passt | Nicht bestätigt |
|---|---|---|
| Elecrow DIS16804D, 4" quadratisches IPS 480x480, SPI+RGB, ST7701S | Umriss, Treiber, identische 40-Pin-Tabelle. Kommt auf einer HDMI-Treiberplatine; das Panel lässt sich abstecken | Touch-Controller |
| Waveshare / Luckfox LF40-480480-ARK (SKU 27738) | Umriss (84,2 x 84,2), GT911 | Pin-Tabelle und Treiber |
| Panel des Waveshare ESP32-S3-Touch-LCD-4 (aktuelle Leser) | Pinbelegung (aus dem Schaltplan dieser Platine) | Flexkabellänge gegenüber diesem Layout |
| AliExpress 1005005675144653 (SUNMAXIC), Variante „Capacitive touch“ | Dieselbe mechanische Zeichnung und Pin-Tabelle | Touch-Controller; die Variante „No touch“ hat keine Touch-Schicht |

Das Flexkabel des Panels messen, das in Stückzahlen gekauft werden soll. Das 4,0-Zoll-Panel mit 480 x 480 von LCSC
(C17496207, Focus E40RC-FS1000-C) ist MIPI DSI an einem 20-poligen Flexkabel, 77 x 80 mm: Es passt nicht; es zu
verwenden wäre ein neuer Display-Abschnitt.

### Gehäusehinweise

- **WLAN-Antenne.** Metall vom Streifen über dem Display für x unter 50,5 fernhalten: keine Schrauben, und eine
  Frontplatte aus Metall nur mit einem Fenster über diesem Streifen (siehe [Antenne](#antenne)).
- **Untere Ecken.** Die Ethernet-Buchse öffnet in den rechten Ausschnitt (16,5 x 51), die DC-Buchse in den linken (12 x
  36). Stecker und Kabel bleiben innerhalb des Platinenumrisses und gehen nach unten oder zurück in die Wand.
- **Platz für den Ethernet-Stecker.** Es zählt der steife Teil unterhalb der Buchse (Körper und Knickschutz, abzüglich
  der 13,5 mm in der Buchse): 24 bis 31 mm bei gängigen gespritzten Patchkabeln (37 bis 44 mm insgesamt).

  | Kabel | Biegeradius (4 x Durchmesser) | Der steife Teil darf unterhalb der Buchse enden: in die Wand | Gerade nach unten durch die untere Aussparung |
  |---|---|---|---|
  | Patchkabel 5,5 mm | 22 mm | 31 mm | 49 mm |
  | Cat-6-Patchkabel 6,3 mm | 25 mm | 29 mm | 49 mm |
  | Schlankes Patchkabel 3,8 mm (28 AWG) | 15 mm | 37 mm | 49 mm |

  Ein normales Patchkabel passt in beiden Fällen; ein schlankes lässt den meisten Platz und trägt den PoE-Strom (unter
  0,3 A). Stecker für die Feldkonfektionierung auf 7 bis 8 mm dickem Installationskabel (30 mm Bogen) passen nur zum
  Ausgang nach unten: Installationskabel in einer Dose enden lassen und ein kurzes Patchkabel verwenden.
- **Pins der Buchse auf der Displayseite** (x 68 bis 86, y 71 bis 88): Nichts darf auf sie drücken, kein Metall darf sie
  berühren; die Pins 9 und 10 (x 81,2 und 82,5) führen 48 V. Pin 9 ist 0,5 mm vom Rand des LCD-Moduls entfernt (sein Pad
  0,1 mm), daher passt dort keine Rahmenwand: Das Band ist die Isolierung.
- **Tiefe.** Die Displayseite der Platine liegt 5,3 mm hinter der Front des Gehäuses (1,7 mm Abstand, 3,5 mm Display,
  0,1 mm Vertiefung). Hinter der Platine 13,9 mm bis zur Dock-Platte, mit Vertiefungen und einem Fenster für die
  höchsten Bauteile (siehe [Gehäusepassung](#gehäusepassung)).
- **DC.** Der Ausschnitt nimmt einen geraden 5,5-mm-Hohlstecker bis 11 mm Dicke auf; mit dem Stecker des ausgelieferten
  Netzteils prüfen. Die Klemme (WAGO 250-202) nutzt zwei diagonale Löcher ihres Footprints („+“ oben links, „-“ unten
  rechts, im Bestückungsdruck angegeben); die Drähte treten im Winkel von 40 Grad ein, aus der Wand oder nach oben durch
  den DC-Ausschnitt. Dieselben vier Löcher nehmen die WAGO-2601-3102-Hebelklemme auf (Drähte im rechten Winkel). Neben
  der DC-Buchse sitzt keine Schraube: Das Gehäuse muss die Platine dort abstützen.
- **USB-C** liegt am Seitenrand hinter dem Display und braucht keine Öffnung im Gehäuse, wenn vor dem Zusammenbau
  geflasht wird.
- **Befestigungslöcher.** Keine Leiterbahnen auf den äußeren Lagen innerhalb von 3,3 mm um die Mitte eines Lochs
  (Schraubenköpfe oder Abstandshalter bis 6,6 mm). Das vierte Loch stand bei (66,3; 117) in der Lücke des Kupfers um
  die NFC-Schleife, bis die Tap-Kachel auf etwa 44 mm wuchs. Das Gehäuse setzt um jedes Loch einen Dom mit 3,7 mm
  Radius. Der Flansch der Kachel, flach auf der Displayseite, reicht 23,6 mm von der Mitte der Kachel (47,2 mm im
  Quadrat, Ecken r 7). Rechts der Kachel bräuchte ein Dom, der ihn frei lässt, x 70,3 oder mehr, der
  Ethernet-Ausschnitt lässt für die 1,9 mm Platine, die die anderen Löcher haben, höchstens 66,0; unter der Kachel und
  zwischen ihr und dem Display ist auch kein Platz. Das Loch sitzt bei (16; 122), zwischen Kachel und DC-Ausschnitt
  (2,4 mm Platine zum Ausschnitt), auf Höhe einer LED des Rings, abseits seiner 5-V-Vias. Sein Dom steht in einer
  Aussparung mit 3,9 mm Radius im Flansch, 0,2 mm rundum. Das dritte Loch rückte 0,6 mm zur Ecke, nach (17,4; 140), weg
  von der unteren linken LED des Rings (1,9 mm Platine zum unteren Rand). Das untere rechte Viertel der Platine hat
  jetzt keine Schraube: Der Körper der Kachel, flach auf der Displayseite um die Schleife, hält es.
- **Summer** BZ701 strahlt seitlich ab, zum unteren Platinenrand (Schallöffnung auf der Seite zu U701): Nahe daran eine
  Öffnung lassen.
- **LEDs** brauchen einen Diffusor vor den Fenstern: den weißen Körper der Tap-Kachel. Ein Kanal, 2,3 mm breit und
  2,5 mm tief, läuft in der Rückseite der Kachel über den Fenstern um den Ring und lässt 2,8 mm weißes ABS bis zum
  sichtbaren Rand, der 2 mm breit ist (20,4 bis 22,4 mm von der Mitte der Kachel).
- **NFC.** Kein Metall (Schrauben, Platten, geschirmtes Kabel) in oder direkt hinter der Schleife.

### Gehäusepassung

Die Platine mit dem 3D-Modell jedes Bauteils (`kicad-cli pcb export step`), gesetzt in
`case/cad/attractap-touch-case.sc` (Bestückungsseite bei `z_pf`, X = 103 - x, Y = 79,15 - y) und mit den Kollisions- und
Abstandsprüfungen von SolidCraft geprüft. Höhen sind die der Hersteller, wo sie eine angeben.

| Bauteil | Höhe über der Platine | Nächstes Gehäuseteil | Spalt |
|---|---|---|---|
| J401 RJ45 | Körper 13,95 max.; Schirmfedern an der Öffnung 15,21 +- 0,50 (HanRun HY931147C) | Dock-Platte bei 13,9 mm, 0,8 mm tiefe Vertiefung unter der Buchse, Fenster (9,5 x 6,9) unter den Federn | Körper 0,90 (0,70 im Maximum); Federn 1,70 bis zur Wand hinter dem Fenster (1,14 im Maximum), 1,0 zu den Seiten des Fensters |
| U102 DP9900M | 13,35 +- 0,5 | Dock-Platte, 0,8 mm tiefe Vertiefung | 1,35 (0,80 im Maximum) |
| J103 WAGO 250-202 | 13,2 | Dock-Platte | 0,70 |
| J102, J103 Pins | 1,95 aus der Displayseite | Vorderwand der Kappe | 1,0 |
| J401 Pins | 1,45 aus der Displayseite, ungekürzt | LCD-Modul bei 1,7 mm | 0,25; 0,7 auf 1 mm gekürzt |
| J101 USB-C | 3,25 | Seitenwand der Kappe | 0,63 |
| C120 47 uF, 6,3 mm | 7,7 | Dock-Platte; Seitenwand der Kappe | 6,2; 13,9 |
| C725 100 uF, 6,3 mm (LED-Versorgung) | 5,4 nominal; die Höhentoleranz des Herstellers nicht geprüft | Dock-Platte | etwa 8 |
| D106, D107, F102, U105, U106, U107, Q101, Q102, U204 | höchstens 2,4 | keines innerhalb von 3 mm | mehr als 3 |

- Die Vertiefungen sind ringsum 1 mm breiter als jedes Bauteil; die Platte bleibt dort 2,2 mm dick und druckt ohne
  Stützen. Das untere Paar der Wandschrauben (Abstand einer Unterputzdose) sitzt 8,5 mm unter den Federn.
- Die Öffnungen stehen 47 mm von der Achse des Näherungssensors entfernt (sein Licht endet 8 mm von ihr;
  `geometry.DOCK_OPENINGS`, von einem Test geprüft) und 56 mm von der Achse des Magneten.
- C120 hält Abstand zum Flexkabel des Displays: Sein Modell (x 13,9 bis 21,7, y 60,7 bis 67,3) endet 10,8 mm links vom
  Streifen des Flexkabels in J601.
- `collect_models.py` schiebt jedes konvertierte Modell auf seine Pads und Löcher (`model_fit.py`); ein Test schlägt
  fehl, wenn die Pins eines Modells danebenliegen.

## Stromversorgung

| Schiene | Quelle | Lasten |
|---|---|---|
| +5V | USB-C über das eFuse U105; DC-Wandler über die ideale Diode U107/Q102; PoE-Modul über die ideale Diode U106/Q101 | beide 3,3-V-Wandler, Hintergrundbeleuchtung, LEDs, Summer, PN532 |
| +5V_DC | AP63205-Abwärtswandler U104, 2 A, aus den DC-Anschlüssen | speist +5V |
| +3V3 | TLV62569-Abwärtswandler U103, 2 A, aus +5V | P4, PHY, Sensoren, Panel-Logik, Kernwandler U202 |
| +3V3_WIFI | TLV62569-Abwärtswandler U302, 2 A, aus +5V, immer an | allein das WLAN-Modul U301, mit seinem EN-RC und seinen Pull-ups |
| VDD_HP 1,1 V | TLV62569 U202 aus +3V3, vom P4 eingeschaltet | P4-Kern |
| Interne LDOs des P4 | VDDO_FLASH 3,3 V, VDDO_PSRAM 1,9 V | Flash, PSRAM im Gehäuse des Chips |

Sind zwei oder mehr Quellen angeschlossen, speist die höchste die Platine; keine speist eine andere, und ein nicht
angesteckter Anschluss bleibt auf 0 V. Die 5 V des DC-Wandlers und des PoE-Moduls erreichen den IO-Expander über Teiler
(`DC_PRESENT`, `POE_PRESENT`), sodass die Firmware weiß, welche Quellen vorhanden sind.

### Leistungsbilanz

„Auslegung“ ist das, was der Hersteller von der Versorgung verlangt; „Maximum“ ist der höchste vom Hersteller angegebene
Verbrauch.

3,3-V-Schiene (U103, 2 A; Strombegrenzung mindestens 3 A):

| Last | Auslegung (A) | Maximum (A) | Quelle |
|---|---|---|---|
| ESP32-P4, I/O, Flash, PSRAM | 0,380 | 0,200 | HDG v2.0 1.3.2: „minimum operating supply current ... 380 mA (including flash and PSRAM)“; Datenblatt v0.7 Tabelle 5-7: 150 mA bei 400 MHz Dual-Core, plus 50 mA für Flash-/PSRAM-Zugriffe (W25Q128JV höchstens 25 mA) |
| ESP32-P4-Kern über U202 | 0,196 | (oben) | Datenblatt Tabelle 5-2: 0,5 A bei 1,1 V; bei 85 % |
| IP101GRI-PHY | 0,045 | 0,045 | Datenblatt R05: unter 0,15 W bei 100BASE-TX Vollduplex |
| VCNL4040-Emitter | 0,200 | 0,005 Mittelwert | 200-mA-Impulse bei 1/40 Tastverhältnis oder weniger |
| Panel-Logik und Touch des Displays | 0,060 | 0,060 | Zuschlag, keine Angabe im Datenblatt; bei der Inbetriebnahme gemessen |
| Buchsen-LEDs, Beschleunigungssensor, Hall-Schalter, IO-Expander, Pull-ups, Supervisor | 0,010 | 0,010 | LIS2DH12 185 uA, DRV5032 2,7 mA Spitze, TCA9554 0,6 mA |
| **Summe** | **0,89** | **0,32** | Reserve bis 2 A: **55 %** / 84 % |

Schiene des WLAN-Moduls (U302, dieselbe Schaltung):

| Last | Auslegung (A) | Maximum (A) | Quelle |
|---|---|---|---|
| ESP32-C5-MINI-1 | 0,600 | 0,426 | HDG 1.3.2 „no less than 600 mA“; Datenblatt v1.4 Tabelle 6-2 IVDD 0,6 A; Tabelle 6-5: 802.11a 16,5 dBm 100 % Einschaltdauer 426 mA (338 mA bei 2,4 GHz, Tabelle 6-4) |
| EN, IO28 und fünf SDIO-Pull-ups | 0,001 | 0,001 | |
| **Summe** | **0,60** | **0,43** | Reserve bis 2 A: **70 %** / 79 % |

5-V-Schiene (3,3-V-Wandler bei 88 %, Schiene bei 4,75 V):

| Last | Auslegung (A) | Maximum (A) | Quelle |
|---|---|---|---|
| U103 | 0,70 | 0,25 | oben |
| U302 | 0,47 | 0,34 | oben |
| Hintergrundbeleuchtung (4S2P, 39 mA, AP3032) | 0,13 | 0,13 | 13 V bei 39 mA, 85 % |
| 16 SK6812MINI-E | 0,31 (Grenze des Schalters) | 0,20 (Firmware-Grenze) | 12 mA je Farbe, 0,58 A bei vollem Weiß; der Schalter U705 hält den Ring unter 232 bis 306 mA, die Firmware alle Kanäle zusammen bei 192 mA oder darunter |
| PN532 | 0,12 | 0,12 | Sender 100 mA (die Anpassung hält ihn unter 60 mA) plus 20 mA |
| Summer | 0,10 | 0, solange das NFC-Feld an ist | MLT-8530 95 mA bei 5 Vo-p; die Firmware piept, nachdem das Feld aus ist |
| Pegelwandler, LED-Schalter, Entladewiderstände | 0,003 | 0,003 | |
| **Summe** | **1,83** | **1,04** | |

| Quelle | Nennwert | Reserve beim Maximum | Reserve bei Auslegung |
|---|---|---|---|
| USB-C (eFuse-Grenze) | mindestens 1,8 A (R110 1,65 k) | 42 % | -2 % |
| DC-Wandler AP63205 | 2 A | 48 % | 8 % |
| PoE-Modul DP9900M-5V | 1,8 A bis 70 °C (9 W), 1,2 A bei 85 °C (6 W) | 42 % (13 % bei 85 °C) | -2 % |

Vor dem LED-Schalter, mit den LEDs bei 0,10 A (Firmware) und 0,58 A (Auslegung): Summen 0,94 und 2,10 A, Reserve
beim Maximum 48 % (USB), 53 % (DC), 48 % (PoE; 22 % bei 85 °C), bei Auslegung -17 %, -5 % und -17 %.

- Jede 5-V-Quelle behält bei den Maximalwerten der Hersteller mit den Firmware-Grenzen mindestens 30 % (LEDs bei
  192 mA oder darunter; Summer und NFC-Feld nicht gleichzeitig), außer dem PoE-Modul über 70 °C: 13 %, eine akzeptierte
  Abweichung ([Bekannte Einschränkungen](hardware/touch-p4/limitations.md#reserve-des-poe-moduls-bei-hitze-review-punkt-24)).
  Unter diesen Grenzen beträgt die Summe der Auslegungswerte 1,62 A, 10 % unter den Nennwerten von eFuse und
  PoE-Modul.
- Die LED-Grenze der Firmware liegt bei 192 mA, weil das eine Farbe auf allen 16 LEDs mit vollem Umfang ist: Jede LED
  treibt fest 12 mA je Farbe und dimmt nur per PWM, eine niedrigere Grenze würde also den Umfang einzelner Farben
  kürzen. Mischfarben und Weiß werden auf dieselbe Summe herunterskaliert
  ([Firmware-Regel 20](hardware/touch-p4/firmware-port.md)).
- Die Auslegung zählt den Ring mit der höchsten Stromgrenze des Schalters, 0,31 A: Was die Firmware auch sendet, mehr
  kann der Ring nicht ziehen (vor dem Schalter waren es 0,58 A bei vollem Weiß). Bei den vollen 1,83 A laufen eFuse und
  PoE-Modul an ihrem Nennwert, und ihre eigenen Strombegrenzungen decken das ab, der DC-Wandler behält 8 %. Nichts wird
  beschädigt. Die Summe stapelt außerdem Werte, die nicht zusammenfallen (die 380 mA des P4 neben den 0,5 A seines
  Kerns, Emitterimpulse, die Auslegung des C5 von 0,6 A gegenüber seinen 426 mA).
- Die Sicherung des DC-Eingangs (1,1 A Haltestrom bei 25 °C, 0,7 A bei 60 °C) ist mit allem eingeschaltet das knappste
  Bauteil: Der DC-Eingang zieht bei 12 V 0,75 A, wenn die 5-V-Schiene 1,5 A trägt; im typischen Betrieb bei 40 °C hält
  sie 0,65 A gegenüber 0,28 A gezogenem Strom.
- Ohne Firmware (MCU im Reset) halten Widerstände LEDs, Hintergrundbeleuchtung und Summer aus. Das eFuse begrenzt USB
  auf 1,8 bis 2,2 A und öffnet unter 3,9 bis 4,0 V; DC-Wandler und PoE-Modul begrenzen sich selbst.

USB als einzige Quelle. Ein USB-2.0-Port liefert 500 mA, eine Type-C-Quelle bei Default USB Power 500 oder 900 mA, mehr
nur, wenn ihr Rp 1,5 oder 3 A angibt. Fehlen DC und PoE, nimmt die Firmware immer 500 mA: LEDs und Summer aus,
Hintergrundbeleuchtung bei 30 % oder weniger (geschätzt 0,45 A, mit den 3,3-V-Schienen bei typischen 0,37 A und
empfangendem Funkmodul). Der CC-Pegel wird nicht gelesen (siehe [Bekannte
Einschränkungen](hardware/touch-p4/limitations.md)). Die USB-only-Regel, die LED-Grenze und Summer-oder-NFC sind harte
Anforderungen an die Firmware ([Pinbelegung und Firmware-Portierung](hardware/touch-p4/firmware-port.md)), mit je einem
Test bei der Inbetriebnahme.

### Die Obergrenze der 5-V-Schiene

Die idealen Dioden und das eFuse verlieren Millivolt, daher folgt die 5-V-Schiene ihrer Quelle.

| Quelle | Höchste Ausgangsspannung | Referenz |
|---|---|---|
| USB-C, konform | 5,5 V | vSafe5V, USB PD R3.3 Tabelle 4.9; USB 2.0 VBUS Max Limit ECN |
| USB-C, fehlerhaft | 5,53 bis 5,74 V, dann öffnet das eFuse | OVLO unten |
| DC-Wandler AP63205 | 5,05 V (CCM), etwa 5,2 V im PFM bei geringer Last | DS41326 Rev. 3-2, Abbildungen 6 und 7 |
| PoE-Modul DP9900M-5V | 5,25 V, etwa 5,5 V kurzzeitig bei einem Lastsprung | Datenblatt; +276 mV bei einem Lastsprung 50-100-50 % |

| Last | Empfohlenes Maximum | Absolutes Maximum |
|---|---|---|
| TLV62569 VIN (U103, U302) | 5,5 V | 6,0 V (SLVSDG1C 6.1, 6.3) |
| PN532 VBAT | 5,5 V | 6,0 V (PN532/C1 Rev. 3.6, Tabellen 290, 291) |
| SK6812MINI-E VDD | 5,5 V | 5,5 V (Spezifikation Rev. B, 7 und 9) |
| SN74LV1T125 VCC | 5,5 V | 7,0 V (SCLS745D) |
| AP3032 VIN | 9 V | 20 V |
| Summer MLT-8530 | 4,5 Vo-p | nicht angegeben; R705 10 ohm in Reihe hält die Spule (16 ohm +- 3) bei 5,74 V auf 3,8 Vo-p |
| LM74700 CATHODE, TPS25947 OUT | 60 V, 23 V | 75 V, 28 V |

Teiler des eFuse R107 330 k, R108 29,4 k, R109 97,6 k, alle 0,1 %; Schwellen des TPS259470A 1,183 bis 1,223 V steigend,
1,076 bis 1,116 V fallend (SLVSFC9C 6.5):

| | Nominal | Bereich |
|---|---|---|
| UVLO, steigend | 4,32 V | 4,25 bis 4,41 V |
| OVLO, steigend | 5,62 V | 5,53 bis 5,74 V |
| OVLO, fallend (wieder an) | 5,14 V | 5,03 bis 5,23 V |

Jede konforme USB-Quelle kommt durch; eine fehlerhafte wird innerhalb von 1,2 us abgeschaltet, bevor TLV62569 und PN532
6,0 V erreichen. 1-%-Widerstände ergäben 5,45 bis 5,82 V und könnten eine konforme Quelle abschalten. Bei 23 V an VBUS
legt der Teiler 6,39 V an EN/UVLO und 4,91 V an OVLO, unter den 6,5 V der Pins. Zwei Fälle kommen nahe heran: Die LEDs
erreichen ihre 5,5 V nur mit einer USB-Quelle am oberen Ende von vSafe5V und ohne Last am Kabel (die Platine lässt in
Kabel, Sicherung und Ferrit mindestens 40 mV abfallen); die Sprungantwort des PoE-Moduls kann die Schiene für einige
hundert Mikrosekunden auf etwa 5,5 V anheben.

### Quellen auf der 5-V-Schiene

- **USB: eFuse U105, TPS259470ARPWR.** Anstiegsrate 0,91 V/ms (C118 2,2 nF), Strombegrenzung 1,8 bis 2,2 A (R110 1,65
  k), Sperrschwellen oben. Sperrt Rückstrom im aus- und im eingeschalteten Zustand: Sobald OUT 29 mV über IN liegt,
  öffnet es innerhalb von 1 us und schließt wieder, wenn IN 104 mV über OUT liegt (50 us später). Die Pins 3 (AUXOFF), 4
  (FLT) und 10 (ITIMER) sind offen, wie TIs Tabelle 5-1 erlaubt; `test_new_ics_follow_their_makers_pin_tables` prüft
  das.
- **DC und PoE: LM74700-Q1 mit je einem IRLML0030.** 20 mV über dem MOSFET, bei Rückstrom innerhalb von 0,45 us aus.
  Gate 10,8 bis 13,9 V über der Source (SNOSD17G 6.5), unter der Grenze von 15 V GATE-ANODE und den 20 V des MOSFET.
  Heiß etwa 45 mOhm: 0,18 W bei 2 A (18 °C Anstieg bei 100 °C/W), 0,04 W bei den 0,90 A der Schiene.
- **Entladewiderstände R104 (USB) und R105 (Ausgang des DC-Wandlers), 4,7 k.** Gegen den Rückleckstrom des eFuse von
  4,86 uA und die 2 uA der idealen Diode (beide typisch): 23 und 9 mV, wo ein USB-C-Host 0,8 V akzeptiert. Faktor 30 für
  VBUS. Jeder kostet 1 mA, solange seine Quelle an ist.
- **Simuliert** (`sim/powerup.cir`, `sim/switchover.cir`): beide 3,3-V-Schienen stehen 5,0 ms nach dem Einstecken von
  USB; 3,8 A für Mikrosekunden in C101 (10 uF, was USB 2.0 7.2.4.1 erlaubt), dann 47 mA, während das eFuse hochfährt.
  Beim Wechsel der Versorgung mit 0,9 A auf +5V bleibt +5V bei 4,06 V oder darüber, +3V3 bei 3,30 V (Supervisor 2,99 V),
  +3V3_WIFI bei 3,29 V (Modul 3,0 V). Der Eingang einer abgesteckten Quelle bleibt bei 0 bis 1 mV. Details unter
  [Simulationen](hardware/touch-p4/simulations.md).

### 3,3-V-Wandler

TLV62569 (SLVSDG1C) U103 mit 2,2 uH (Sunlord WPN4020H2R2MT, 4,3 A Sättigung), R111 100 k / R112 22,1 k: 3,315 V.

- **Ausgangskapazität.** TIs Tabelle 4 belegt 2,2 uH mit bis zu 2 x 22 uF (+20 / -50 %); TIs E2E-Thread 980956 nimmt den
  größten belegten Wert plus 20 % als Grenze: 52,8 uF effektiv. Jeder Kondensator an der Schiene zählt, auch der des PHY
  hinter seinem Ferrit. Mit Samsungs DC-Bias-Daten bei 3,3 V (22 uF 0805: 13,69 uF; 10 uF 0603: 4,46 uF) hat die Schiene
  44,5 uF, Teile ohne Daten mit vollem Wert gezählt: 10 uF am Wandler (C109), 4,7 uF am Emitter des Näherungssensors
  (C715). Geprüft von `test_3v3_converter_output_capacitance_is_in_tis_table`.
- **Feed-forward** C108 12 pF über R111: eine Nullstelle bei 133 kHz (TIs 6,8 pF mit 200 k: 117 kHz). Die
  Durchtrittsfrequenz der Regelschleife ist nicht veröffentlicht; die Inbetriebnahme misst einen Lastsprung von 0,1 auf
  1 A mit und ohne C108.
- **Strom** 0,89 A bei Auslegung, 55 % unter 2 A.
- **Layout (TI 10.2).** VIN und FB zeigen nach links, SW zur Spule. C107 100 nF direkt über VIN, C106 10 uF daneben;
  ihre Masse-Vias und eines unter dem Wandler schließen die Eingangsschleife über In1, 0,2 mm darunter. SW erreicht die
  Spule nach 1,1 mm Leiterbahn mit 0,6 mm. Der Teiler sitzt unter FB, von SW abgewandt, und misst die 3,3-V-Fläche über
  ein eigenes Via.
- **Supervisor** U204 (TLV803S, 2,93 V) hält den P4 im Reset, bis die Schiene 120 bis 280 ms über der Schwelle gelegen
  hat.

### Der Wandler des WLAN-Moduls

U302: die Schaltung von U103 (TLV62569, WPN4020H2R2MT, R311 100 k / R312 22,1 k, 3,315 V, C306 12 pF) allein für das
ESP32-C5-MINI-1.

- **Warum ein eigener.** Das Modul verlangt 0,6 A (HDG 1.3.2) und trägt 33,4 uF an seinem 3V3-Pin (Datenblatt v1.4 Abb.
  8-1: drei 10 uF, drei 1 uF, vier 100 nF, ein 10 nF). An U103 ergäbe das 1,49 A bei Auslegung (25,6 % Reserve) und etwa
  82 uF Ausgangskapazität, über TIs 52,8 uF.
- **Ausgangskapazität.** C301 22 uF (13,69 uF bei 3,3 V) und C302 100 nF am Pin des Moduls (Espressifs Abb. 9-1) plus
  die 33,4 uF des Moduls mit vollem Wert: 47,2 uF, innerhalb von 52,8 uF; ohne die Kondensatoren des Moduls 13,8 uF,
  über TIs kleinstem belegten Wert (`test_wifi_converter_output_capacitance_is_in_tis_table`).
- **Immer an.** EN über R310 100 k aus +5V, kein Schalter (ein Modul, dessen Versorgung ein IO-Expander schaltete,
  startete nicht, esp-hosted Issue 127). Der EN-RC (R301 10 k, C303 1 uF), der IO28-Pull-up R303 und die SDIO-Pull-ups
  R305 bis R309 hängen an dieser Schiene (`test_wifi_module_supply_is_always_on_and_carries_its_pull_ups`).
- **Reihenfolge beim Einschalten.** Beide Wandler starten gemeinsam aus +5V (bei 2,45 V, gleicher Soft-Start). EN des
  Moduls steigt 13,4 ms nach seiner Schiene; der Supervisor hält den P4 120 bis 280 ms nach +3V3 im Reset, sodass kein
  P4-Pin das Modul treibt, bevor seine Straps gelesen sind. Fällt +5V, fallen beide Schienen gemeinsam.
- **Layout (TI 10.2), Spalte links vom Modul.** Um 90 Grad gedreht: SW, GND und EN zeigen nach oben zu L301, VIN und FB
  nach unten. C305 100 nF direkt unter VIN, C304 10 uF daneben; ihre Masse-Vias und eines zwischen den Pad-Reihen
  schließen die Eingangsschleife über In1. Das Plus-Pad von C301 liegt dem 3V3-Pin 3 des Moduls gegenüber, sein Massepad
  den Massepins 1 und 2 des Moduls. Der Teiler misst die Schiene an C302 (`routes_wifi.wifi_buck_routes`).
- **Gemessen auf der verlegten Platine** (`scripts/layout_report.py`): Plus-Pad von C301 1,8 mm vom 3V3-Pin des Moduls
  und 3,2 mm vom Ausgang von L301; sein Massepad 1,8 mm von den Massepins des Moduls mit einem Via 0,75 mm entfernt, und
  7,2 mm vom GND von U302 über In1. C301 sitzt näher am Modul, weil die Ausgangsschleife den dreieckigen Ripple der
  Spule führt, nicht den zerhackten Eingangsstrom, den TI als kritisch benennt.

### Kernwandler

TLV62569DBVR U202, 3,3 V auf 1,1 V, vom P4 eingeschaltet. Es muss diese Teilenummer sein: Espressif führt die Wandler
auf, die funktionieren, und solche mit Ausgangsentladung hindern den P4 am Aufwachen.

- Teiler R204, R205 499 k 1 % und 22 pF Feed-forward: Die Checkliste in Espressifs HDG v2.0 (Chip-Revision v3.0 und
  später) sagt, diese „must be populated“.
- 2,2 uH (sättigt bei 2,3 A, weit über dem Verbrauch des Kerns), zwei 22 uF am Ausgang, was TIs Tabelle für Ausgänge
  unter 1,2 V nennt.
- Die 100 k von EN nach Masse (nicht in Espressifs Schaltung) zählen nur, solange der P4 EN nicht treibt.
- Die Kupferfläche der Kernschiene auf der Rückseite reicht von unter dem MCU bis zum zweiten Ausgangskondensator C235,
  mit drei 0,3-mm-Vias neben seinem Pad; die Leiterbahnen von der Spule zu den Kondensatoren sind 0,6 mm breit. Der
  vierte Kernpin (54, hinter der 0-ohm-Brücke R203) wird von einer 11 mm langen Leiterbahn mit 0,2 bis 0,3 mm auf der
  Rückseite gespeist.

### DC-Eingang

Für 12-V- oder 24-V-Netzteile; 28 V sind das Höchste, was er dauerhaft aushält. Die Buchse ist für 24 V ausgelegt. Der
AP63205 arbeitet bis 32 V, hält 35 V dauerhaft aus und 40 V für 0,4 s.

Kette von den Anschlüssen aus: PTC-Sicherung F102 (1,1 A Haltestrom), TVS D107 (SMBJ28CA, bidirektional),
Verpolschutzdiode D105 (SS310, 100 V), C117 2,2 uF, Elektrolytkondensator C120 47 uF, Filterspule L103, TVS D106
(SMBJ28A), Eingang des Wandlers C112/C113. Beide TVS sperren bis 28 V und leiten ab 31,1 bis 34,4 V. Eine verpolte
Versorgung bleibt unter der Sperrspannung von D107, und D105 sperrt sie.

- **Einstecken unter Spannung** (`sim/dc_hotplug.cir`): Die Induktivität des Kabels schwingt mit den
  Eingangskondensatoren; der ESR von C120 dämpft das. Bei 24 V sieht der Wandler höchstens 31,0 V (1,5 m dünnes Kabel),
  27,6 bis 29,1 V mit dickeren und längeren Kabeln; bei 26,4 V 34,7 V; bei 28 V 32,6 V, ohne Strom in der TVS. Ohne
  C120: 38 V.
- **Welche Surge-Prüfung gilt.** EN 301 489-1 V2.2.3 verlangt an einem DC-Versorgungsanschluss keinen Surge; EN
  50130-4:2011 Abschnitt 13 (was Kunden aus der Zutrittskontrolle erwarten) wendet den langsamen Surge von Leitung gegen
  Erde über 42 ohm an; der PoE-/Ethernet-Anschluss bekommt 0,5 kV Leitung gegen Erde bei Kabeln über 30 m in Innenräumen
  (EN 301 489-1 9.8.2.2). Begründung und Quellen in der [CE- und Marktcheckliste](hardware/touch-p4/compliance.md).
- **Surge, simuliert** (`sim/dc_surge.cir`, 1,2/50 us +-1 kV hinter 42 ohm, als ungünstigster Fall über den Eingang
  angelegt, TVS am oberen Ende ihres Bereichs, C120 -20 %, L103 gesättigt und ungesättigt): Der Wandler bleibt bei
  höchstens 39,6 V (40 V für 0,4 s), D105 sieht höchstens 75 V in Sperrrichtung (100 V), die Eingangs-TVS nimmt bis zu
  22 A eines 8/20-us-Impulses auf (ST: 68 A). Nach dem Surge bricht der Eingang des Wandlers ein (auf 4 V bei 12 V),
  weil die 1,5 mH des Prüfnetzwerks mit C120 schwingen; die Platine kann neu starten. Leitung gegen Leitung 0,5 kV
  hinter 2 ohm (die Prüfung der IEC 61000-4-5 für Leistungsanschlüsse, an diesem Anschluss nicht verlangt) bräuchte
  einen 60-V-Wandler und eine größere TVS.
- **Eingangsfilter.** C117, L103 und C112/C113 bilden ein Pi-Filter: 40 bis 50 dB bei den 1,1 MHz des Wandlers
  (berechnet). Keine Gleichtaktdrossel: Findet das Labor Aussendungen vom Kabel über 30 MHz, ist ein Klappferrit das
  erste Mittel. Die Keramikkondensatoren sind 2,2 uF / 100 V X7R: 2,0 uF bleiben bei 12 V, 1,5 uF bei 24 V (ein Bauteil
  mit 10 uF / 50 V behält 1,35 uF bei 24 V und lässt den Eingang höher schwingen).
- Der Wandler sitzt in der linken Spalte hinter dem Display, über den DC-Anschlüssen, weit weg von der NFC-Schleife.

### PoE-Eingang

- Nichts außer der TVS darf über dem PoE-Eingang liegen: Zusätzliche Kapazität zerstört die Erkennungssignatur.
- Das Modul braucht eine Mindestlast (100 mA beim DP9900M-5V, 200 mA beim Ag9905M); bei eingeschalteter
  Hintergrundbeleuchtung zieht die Platine mehr. Ein Deep-Sleep-Modus bräuchte eine Dummy-Last. Ein angeschlossenes
  Modul ohne Last (eine andere Quelle liegt höher) kann pfeifen, und der Switch kann den Port aus- und wieder
  einschalten. Nichts wird beschädigt.

## PoE-Potenzialtrennung

Die 48-V-Seite: Buchsenpins 9 und 10, FB102, FB103, D103 und die Modulpins 5 bis 8, im rechten Streifen der Platine
(`geometry.POE_PRIMARY`). Dort ist auf keiner Lage eine Masse- oder Versorgungskupferfläche gegossen.

- **Abstand.** Eine eigene DRC-Regel hält 3 mm zwischen Kupfer der PoE-Klasse und jedem anderen Netz (`board_setup.py`,
  `.kicad_dru`), außer zwischen Pins der Buchse selbst (2,3 mm zwischen ihren PoE- und Signalpins, HanRuns Entwurf). Die
  Regel betrachtet eine Lage; Sperrflächen auf jeder Lage halten die Kupferflächen anderer Lagen davon ab, unter oder
  über 48-V-Kupfer zu reichen. `sim/isolation.py` misst bei jedem verlegten Build den kürzesten Weg entlang und durch
  die Platine ([Simulationen](hardware/touch-p4/simulations.md)). Silvertel verlangt 3 mm zwischen den beiden Seiten.
- **Unter dem Modul.** Seine Barriere liegt unter dem Körper, 2,3 mm von den Ausgangspins an einem Ende und 5,3 mm am
  anderen (Silvertel Ag9900 Abb. 23; SDAPO zeigt keine). Von dieser Linie bis zu den 48-V-Pins gibt es auf keiner Lage
  Kupfer, auch nicht in Silvertels 3-mm-Band, das zwischen den Ausgangspins 2 und 3 einbuchtet (`POE_UNDER_MODULE`,
  `POE_BARRIER_DIP`).
- **Am Gehäuse der Buchse** (Sekundärseite, Schirm): kein 48-V-Kupfer und kein 48-V-Bauteil auf der Bestückungsseite
  innerhalb von 1 mm von seiner Rückwand; die 48-V-Netze laufen auf In2 darunter durch.
- **Am Display.** Pin 9 steht 0,5 mm vom Rand des LCD-Moduls, Pin 10 1,8 mm. Luft hält 1500 V über 0,5 mm nicht: Das
  umgewickelte Polyimidband ist die Isolierung. Auf der Rückseite (zum Display hin) verläuft keine 48-V-Leiterbahn; die
  Leitungen von der Buchse und die 19 mm lange gefilterte Minusleitung neben dem Modul laufen auf In2.
- **Barrierekondensatoren.** C102 überbrückt die Barriere für die EMV: Murata GA352QR7GF102KW01L, 1 nF, zertifiziert
  X1/Y2, 250 V AC, stückgeprüft mit 2000 V AC für 60 s (2,8 kV Spitze), Bauform 2211, Land Pattern mit 4,5 mm zwischen
  den Pads (Murata-Testplatine). C410 (1 nF, 3 kV, Fenghua 1808B102K302NT) und R413 verbinden den Schirm der Buchse auf
  der Sekundärseite mit Masse. IEEE 802.3 §33.4.1 lässt das Powered Device eines davon bestehen: 1500 V RMS 60 s, 2250 V
  DC 60 s oder zehn Impulse von 1500 V mit 10/700 us (TI SLUA818; IEEE interp-3-0704); die Y2-Stückprüfung deckt alle
  drei ab. Kein 1-nF-Bauteil mit 3 kV oder mehr ist in 1206 auf Lager.

Die Isolation an einem bestückten Gerät prüfen, bevor das Labor es tut, und das Labor fragen, ob es sie überhaupt prüft
(für die Sicherheitsnorm sind beide Seiten berührungssicher).

## NFC

- **Schleife:** 4 Windungen, 35 x 37 mm, 0,5 mm Leiterbahn, 0,9 mm Raster, Displayseite. Simuliert aus dem Kupfer der
  Platine (`sim/nfc_loop.py`) bei 13,56 MHz: 1,27 uH / 1,20 ohm in freier Luft, 1,25 uH / 1,23 ohm auf der Platine an
  Holz oder Stein, 1,20 uH / 1,24 ohm mit einer Metallwand 18 mm dahinter. Eigenkapazität etwa 2,4 pF (wirkt wie 2,5 %
  mehr Induktivität). Nicht modelliert: die DC-Klemme 6 mm entfernt, der Elektrolytkondensator C725 der LED-Versorgung
  (ein Aluminiumbecher 6 mm über der Oberkante der Schleife, auf der Bauteilseite) und, bei der LAN-Version,
  Ethernet-Stecker und Kabel 8 mm neben der Schleife. Sie, und eine Karte oder ein Telefon, senken die Induktivität ein
  wenig.
- **Kupfer um die Schleife** ist an einer Stelle offen: eine Lücke von 2,5 mm in allen Lagen zum Ethernet-Ausschnitt
  hin, auf Höhe der Schleifenmitte zwischen den LEDs 5 und 6 des Rings, damit es keine Kurzschlusswindung ist (Metall
  über der Lücke: 1,25 auf 1,08 uH). Die 5-V-Schiene des LED-Rings (`+5V_LED`) ist dort ebenfalls offen: Ihre 100-nF-Kondensatoren
  verbinden sie bei 13,56 MHz mit Masse, eine geschlossene Schiene schlösse die Windung also auch. Nur die
  LED-Datenleitung kreuzt die Lücke; sie endet im Eingang einer LED, keiner niedrigen Impedanz. In der Lücke steht
  keine Schraube mehr. `simulate` prüft jedes Netz, und Masse, beide 5-V-Netze und 3,3 V zusammen, auf um die Schleife
  geschlossenes Kupfer. Mit der Lücke nehmen die Kupferflächen 2 %; die Metallrückseite des Displays nimmt nichts, was
  zählt.
- **Dämpfung:** 1,5 ohm je Zweig, Güte etwa 25. Je 20 bis 35 mW, höchstens 75 mW bei beliebiger Streuung der Bauteile
  für Schleifen bis 1,25 uH (ausgelegt für 0,1 W).
- **EMV-Filter:** 560 nH und 220 pF je Seite, Eckfrequenz 14,3 MHz.
- **Anpassung:** in Reihe 39 pF, parallel 180 pF + 10 pF. So gewählt, dass Senderstrom und Empfängereingang für die
  Schleife an beiden Wandarten innerhalb der Grenzen des PN532 bleiben (100 mA im Betrieb, 150 mA Grenzwert; 4 Vpp am
  Empfängereingang), mit Spielraum für das, was eine Karte wegnimmt. Modell `sim/nfc_match.py` (Treiber 4 ohm, 2 bis 5
  ohm; Versorgung 3,0 V, 2,7 bis 3,4 V; Filterspule 1 ohm); `sim/nfc_tx.cir` stimmt im Zeitbereich damit überein.

  | Schleife | Last TX1-TX2 | Senderstrom | Empfängereingang |
  |---|---|---|---|
  | 1,00 uH | 5 + 15j ohm | etwa 79 mA | 3,1 Vpp |
  | 1,10 uH | 12 + 24j ohm | etwa 49 mA | 1,8 Vpp |
  | 1,20 uH | 59 + 13j ohm | etwa 35 mA | 1,2 Vpp |
  | 1,25 uH | 36 - 26j ohm | etwa 41 mA | 1,9 Vpp |
  | 1,30 uH | 15 - 22j ohm | etwa 56 mA | 2,9 Vpp |

  Mit 5-%-Teilen (Eckfrequenz des Filters nahe am Träger) bleibt der Sender unter 100 mA für Schleifen von 0,93 bis 1,39
  uH bei exakten Werten, 1,08 bis 1,27 uH bei 99 von 100 Platinen und 1,12 bis 1,25 uH mit jedem Bauteil am
  ungünstigsten Ende. Der Empfänger bleibt bei 99 von 100 für 1,06 bis 1,26 uH unter 4 Vpp. Außerhalb wird es schnell
  schlechter (1,0 uH: eine Platine von fünf über 100 mA; 1,3 uH: eine von zwanzig, bis zu 210 mA).
- **Empfangspfad:** 3,9 k, 1 nF, 1 k nach VMID (NXPs Referenz hat 2,7 k, was bei 1,25 uH 3,8 Vpp ergab). 1,2 bis 1,9 Vpp
  für Schleifen von 1,2 bis 1,25 uH, deutlich über den nötigen 0,5 Vpp.
- **Feld** (simuliert): 4,2 A/m an einer Karte auf dem Gehäuse, 3,4 A/m an einer Metallwand (ISO/IEC 14443: 1,5 bis 7,5
  A/m). Es fällt 19 mm vor dem Gehäuse auf 1,5 A/m (15 mm an Metall). Der Sender läuft mit 41 mA von 100 mA, die
  Anpassung hat also Spielraum für mehr Reichweite.
- **PN532:** I2C gewählt mit I0 high, I1 low (NXPs Application Note; die Tabelle des Datenblatts allein lässt sich so
  und so lesen). Der eigene Regler des Chips speist Analog- und Senderversorgung; Reset-Schwelle 0,9 x die
  3,3-V-Versorgung, obwohl der Chip aus 5 V läuft. Die 100 nF der Analogversorgung des PN532 sitzen 4,1 mm von ihrem
  Pin; die Vias des Senders nehmen den Platz daneben ein.
- **Lage.** Die Schleife sitzt auf der Mittellinie des Gehäuses (x 43), konzentrisch mit LED-Ring und Tap-Kachel. Der
  PN532-Block (Chip, EMV-Filter, Anpassung, Dämpfung, Empfangspfad, Quarz, Versorgungen) stand zwischen DC-Ausschnitt
  und Schleife, bis die linke Seite des Rings diese Spalte brauchte; er sitzt jetzt unter dem Display links vom
  Flexkabel, so gedreht, dass die Senderpins nach unten zeigen, mit denselben Bauteilen an denselben Stellen relativ
  zum Chip. Die Antennenzuleitungen laufen von den Dämpfungswiderständen auf der Rückseite zwischen den Ausschnitten
  der oberen linken Ecke des Rings hindurch, dann auf der Vorderseite zu den Enden der Schleife: etwa 25 mm
  Zuleitungspaar statt 12. Das fügt geschätzt 10 nH (unter 1 % der Schleife) in Reihe hinzu, die `sim/nfc_loop.py`
  nicht abbildet (es nimmt die Schleife aus dem Footprint); die Abstimmung am aufgebauten Gerät erfasst sie.

Das sind Startwerte. Zuerst die Schleife messen, dann C513/C517, C514/C515/C518/C519, R504/R505 und R506 mit einem
Netzwerkanalysator an einem aufgebauten Gerät mit montiertem Display abstimmen. Die LAN-Version für sich abstimmen, mit
eingestecktem Kabel ([Inbetriebnahmeplan](hardware/touch-p4/bring-up.md)).

## LED-Ring

16 SK6812MINI-E, umgekehrt bestückt: Jede leuchtet durch ein Fenster in der Platine in den weißen Körper der
Tap-Kachel, einen Lichtleiter, der flach auf der Displayseite um die Schleife liegt. Das Gehäuse legt den weißen
Rand der Kachel, 2 mm breit (20,4 bis 22,4 mm von der Mitte), genau über den Ring.

- **Ring.** Ein Quadrat, auf jeder Seite 21,4 mm von der Mitte der Kachel (43; 117) entfernt. Enger lässt die
  Schleife es nicht zu: Die Fenster halten die 1,03 mm vom Kupfer der Schleife (oben und unten 18,75 mm von der Mitte),
  die die alte obere Reihe hatte; links und rechts ist die Schleife schmaler, 1,88 mm. Die lange Seite jeder LED liegt
  entlang des Rings.
- **Anzahl und Abstand.** Der Ring ist 171 mm lang; 16 LEDs stehen 10,7 mm auseinander, vier je Seite, einen halben
  Abstand von jeder Ecke, sodass der Abstand auch um die Ecken gleich bleibt (zwei LEDs 5,35 mm beiderseits jeder
  Ecke). Durch weißes ABS verschwimmt ein Lichtpunkt mit seinen Nachbarn, wenn die LEDs nicht weiter als etwa die
  doppelte Dicke auseinander stehen. Der Abstand wurde für eine massive Kachel gewählt, etwa 5 mm weiß: 10,7 mm liegt an
  dieser Grenze, 12 LEDs (14,3 mm) zeigten Flecken, 20 (8,6 mm) brächten vier Bauteile mehr für wenig. Die Kachel hat
  jetzt einen Kanal von 2,3 x 2,5 mm über den LEDs und 2,8 mm Weiß bis zum Rand; die Wände des Kanals tragen das Licht
  seitlich zwischen die LEDs ([Gehäuse](hardware/touch-p4/case.md)). Ein erster Druck mit der Platine zeigt, ob der Rand gleichmäßig leuchtet; was bleibt, kann
  die Firmware durch Dimmen ausgleichen. Auf den Ecken sitzt nichts: Eine LED dort stieße an die DC-Klemme und ließe
  keinen Platz für die Antennenzuleitungen.
- **Datenleitung.** In der Reihenfolge der Kette ist LED 0 die obere linke, von der Bauteilseite gesehen; die Kette
  läuft in dieser Ansicht im Uhrzeigersinn, für den Benutzer vorn also gegen den Uhrzeigersinn, oben rechts
  beginnend. LED k ist D701 + k für k bis 7 und D702 + k ab 8 (D710 bis D717 kamen nach den Bauteilen der
  Manipulationserkennung ins Blatt), ihr Kondensator C703 + k bzw. C708 + k. Die Datenleitung kreuzt die Lücke im
  Kupfer um die Schleife zwischen den LEDs 5 und 6.
- **5 V.** Der Ring hat eine eigene Versorgung, `+5V_LED`, hinter dem Schalter U705 (unten). Eine 0,6-mm-Schiene auf
  In2 außerhalb des Rings, ein Via und ein 100-nF-Kondensator in der Lücke nach jeder LED. Die Schiene ist dort offen,
  wo das Kupfer um die Schleife offen ist (zwischen den LEDs 5 und 6), sonst wäre sie eine Kurzschlusswindung (siehe
  [NFC](#nfc)). Der Kondensator der LED 5 sitzt außerhalb des Rings, nicht in der Lücke. Der Ausgang des Schalters
  erreicht die Schiene an der Oberseite des Rings zwischen den LEDs 1 und 2, über C725; der Pegelwandler nimmt seine
  Versorgung an derselben Stelle.
- **Strom.** Jede LED treibt fest 12 mA je Farbkanal und dimmt nur per PWM: Eine Farbe auf allen 16 zieht 192 mA,
  volles Weiß 0,58 A. Die Firmware hält alle Kanäle aller LEDs zusammen bei 192 mA oder darunter (Regel 20 in
  [Pinbelegung und Firmware-Portierung](hardware/touch-p4/firmware-port.md)), sodass einzelne Farben ihren vollen
  8-Bit-Umfang behalten und Mischfarben und Weiß herunterskaliert werden. Unter der alten Grenze von 100 mA hatten sie
  52 % davon.
- **Versorgungsschalter.** TPS2553DBVR (U705, TI, SLVS841G), ein strombegrenzter Schalter, hält den Ring unter dem, was
  die 5-V-Quellen erübrigen können, falls die Firmware versagt. R708 (100 k, 1 %) setzt die Grenze. TI gibt Minimum,
  typischen Wert und Maximum über Fertigung und Temperatur an (Gleichungen 1 bis 3, -40 bis 125 °C Sperrschicht): mit
  dem 1 % des Widerstands sind das **232 / 266 / 306 mA**. Das Minimum bleibt 21 % über den 192 mA, die die Firmware
  zulässt; 110 k (211 / 243 / 280 mA) senkte die Obergrenze um 26 mA, brächte aber eine Stücklistenzeile für nur 10 %
  Abstand.
  - *Warum dieses Bauteil.* Sein Datenblatt gibt Minimum und Maximum der Grenze über die Temperatur als Gleichungen bis
    hinab zu 75 mA an. Andere Schalter mit Einstellwiderstand (Silergy SY6280, Diodes AP2255x und AP2265x) wurden
    nicht auf die Toleranz ihrer Grenze bei 0,2 bis 0,3 A geprüft; bei 0,11 bis 0,20 USD (LCSC C55266, ein Extended
    Part bei JLCPCB) kostet der TPS2553 höchstens Cent mehr.
  - *Verhalten bei Überlast.* Konstantstrom, nicht die Version -1, die abschaltet und gesperrt bleibt: Über der Grenze
    hält er den Strom, und die Versorgung des Rings bricht ein, sodass der Ring dunkler wird und die Farbe verschiebt
    (Blau und Grün zuerst), statt bis zum nächsten Einschalten dunkel zu bleiben. Hält die Überlast an, erwärmt sich der
    Schalter (bis 1,5 W bei Kurzschluss, 182 °C/W) und schaltet bei 135 °C ab, 10 K kühler wieder ein, bis die Last
    sinkt. Nichts wird beschädigt; die LEDs sehen höchstens die Spannung der Schiene.
  - *PWM-Spitzen.* Die PWM-Perioden der LEDs (1,2 kHz) laufen in und aus dem Takt. Im Takt ziehen Mischfarben für einen
    Teil jeder Periode bis zum Dreifachen ihres Mittelwerts, bis 0,58 A für 0,28 ms an der Grenze der Firmware mit
    Weiß. C725 (100-uF-Elektrolytkondensator, das Bauteil, das schon am Ausgang des PoE-Moduls sitzt) trägt den Teil
    über der Grenze des Schalters: Die Versorgung des Rings sinkt um etwa 0,9 V. Mit allen ungünstigsten Fällen
    zugleich (Schiene bei 4,75 V, Schalter an seiner niedrigsten Grenze, Kondensator 20 % zu klein, alle 16 LEDs im
    Takt) erreicht sie für einen Bruchteil einer Millisekunde etwa 3,5 V, unter dem Minimum der LED von 3,7 V: Blau und
    Grün werden für diesen Moment dunkler. Ohne C725 (2 uF am Ring) bräche die Versorgung jedes Mal zusammen, wenn die
    LEDs in den Takt kommen.
  - *Einschaltstrom.* Etwa 102 uF am Ring (C725, C701 und die 100 nF der 16 LEDs). Der Sanftanlauf des Schalters
    (1,1 ms) verlangte 0,46 A; stattdessen lädt er sie an seiner Grenze, in etwa 2 ms, mit 0,23 bis 0,31 A aus der
    5-V-Schiene.
  - *Enable.* Der Enable-Pin liegt am Eingang des Schalters: Der Ring ist eingeschaltet, sobald die Platine es ist. Die
    beiden freien Pins der MCU (GPIO27, GPIO48) haben keinen Weg aus ihrem Fan-out: GPIO48 ist eingeschlossen zwischen
    der LED-Datenleitung, dem VDD_HP_3-Kondensator C222 in seiner früheren Lücke und der Leiterbahn der Kernversorgung;
    GPIO27 zwischen den RMII-Ausgängen und dem Via der Hintergrundbeleuchtung unter dem Gehäuse. Der IO-Expander hat
    keinen freien Pin. Ein geschalteter Ring hätte den Ruhestrom der LEDs gespart, je 1 mA (Datenblatt IDD), zusammen
    16 mA oder 80 mW. Ohne Firmware bleiben die LEDs wie bisher dunkel: R705 hält die Datenleitung auf Low.
  - *Rückspeisung.* Der Pegelwandler U701 läuft ebenfalls an `+5V_LED`; schaltet der Schalter ab (Übertemperatur, oder
    eine spätere Revision, die ihn schaltet), verliert der Pegelwandler seine Versorgung mit den LEDs und kann den
    Dateneingang der LED 0 nicht aus einer lebenden Versorgung treiben. Sein Eingang hat keine Klemmdiode zur eigenen
    Versorgung (SCLS745D 8.3.1), daher speist auch ein High an GPIO47 den Ring nicht über ihn.
- **Kosten.** Acht LEDs und Kondensatoren mehr mit denselben Teilenummern: keine neue Stücklistenzeile, 0,4 bis 0,8 USD
  je Platine. Der Schalter bringt eine Stücklistenzeile und 0,2 bis 0,9 USD je Platine
  ([Teile und Beschaffung](hardware/touch-p4/parts.md#kosten)).

## Ethernet

- Die Beschaltung folgt dem Espressif ESP32-P4-Function-EV-Board: IP101GRI mit einem 25-MHz-Quarz, der PHY liefert den
  50-MHz-RMII-Takt (Taktausgang mit dem Takteingang verbunden), PHY-Adresse 1. Mittelanzapfungen des Übertragers über
  100 nF an Masse (Spannungsmodus-PHY, keine Abschlusswiderstände). Anoden der Buchsen-LEDs an den Pins 11 und 13.
- **Polarität.** Das Datenblatt der Buchse druckt kein „+“ oder „-“; aus ihren Wicklungspunkten und den
  Standardkontakten (1 TX+, 2 TX-, 3 RX+, 6 RX-): Pin 1 RD+, 2 RD-, 5 TD+, 6 TD-. Am PHY führt der positive Pin jedes
  Paares zur äußeren Leiterbahn, an der Buchse ist es der innere Pin. Jedes Paar läuft nebeneinander auf der
  Bestückungsseite, wechselt knapp über der Buchse über je ein Via auf die Rückseite und tauscht dort die Seiten. (Ein
  vertauschtes Paar würde trotzdem verbinden.)
- Die Paare führen auf der Rückseite unter der Rückwand des Buchsengehäuses hindurch, die 48-V-Netze auf In2; kein
  Bauteil innerhalb von 1 mm von dieser Wand. Nur die Leiterbahnen der Mittelanzapfung und, links am Gehäuse, die LED-
  und Schirm-Leiterbahnen laufen auf der Bestückungsseite unter dem Gehäuse (eine Berührung schadet nicht).
- **PHY-Reset.** Keine Reset-Schaltung: Der Pin hängt an einem Pin des IO-Expanders (nach dem Einschalten ein Eingang
  mit schwachem Pull-up), sodass der PHY mit der Versorgung startet, ohne die 10 ms Reset, die sein Datenblatt verlangt.
  Die Firmware pulst ihn vor der Benutzung auf Low ([Pinbelegung und
  Firmware-Portierung](hardware/touch-p4/firmware-port.md)), wie auf Espressifs Platine.
- **RMII.** Leitungen 40 bis 48 mm, Takt 59 mm, je zwei bis vier Vias. Die Sendeleitungen haben keine Serienwiderstände
  (kein Platz am MCU): Die Firmware lässt diese Pins auf Standard-Treiberstärke oder darunter; simuliert schwingen sie
  bei Standard 0,13 V über, bei der stärksten Einstellung 0,6 bis 0,8 V. Leitungen mit Serienwiderständen (RMII-Takt und
  Empfang) zeigen keine Reflexionen. Paare vom PHY zur Buchse: 11 bis 18 mm.
- **RMII_TXD1 ist GPIO35**, der Boot-Modus-Strap. Der BOOT-Taster und sein Testpunkt, etwa 70 mm entfernt, hängen hinter
  R217 1 k, der an der Leitung neben dem Strap-Widerstand sitzt, sodass die 50-MHz-Leitung keinen langen offenen Zweig
  hat; bei gedrücktem Taster sieht der Pin 0,3 V. Die Eingänge des PHY an GPIO34/35 haben keine Pulls, die gegen die
  Straps arbeiten könnten.
- **ESR des Quarzes.** Der 25-MHz-Quarz ist für bis zu 50 ohm angegeben, über den 40 ohm des PHY-Datenblatts. Typische
  Teile liegen weit unter beiden Werten. Wenn eine Platine den Ethernet-Takt in der Kälte nicht hochbekommt, zuerst hier
  suchen.

## WLAN

### Modul

ESP32-C5-MINI-1-N4-V1.2 (LCSC C54951860), 15,4 x 21,3 x 2,4 mm, Platinenantenne für 2,4 und 5 GHz.
EU-Baumusterprüfbescheinigung 44024-05-2026-260268 (Eurofins, benannte Stelle 0980), FCC ID 2AC7Z-ESPC5MINI1; die Normen
stehen in der [CE- und Marktcheckliste](hardware/touch-p4/compliance.md). Zulässig -40 bis 85 °C Umgebung, „the
environment immediately outside the Espressif module“ (Datenblatt v1.4, Tabelle 1-1 Anmerkung 3, Tabelle 6-2).

- **4 MB Flash, kein PSRAM.** Die Partitionstabelle von esp-hosted für einen Co-Prozessor mit 4 MB enthält zwei Images
  zu je 1,75 MB für Updates über SDIO (`partitions_eh_cp_ota_4m.csv`, esp-hosted-mcu 3.1.0); der Co-Prozessor braucht
  kein PSRAM.
- **Chip** ESP32-C5HF4, Revision v1.0 oder v1.2 (Chip-Datenblatt v1.5 Tabelle 1-1). Der SDIO-Slave funktioniert ab v1.0
  (Moduldatenblatt v1.4, 5.2.1.13).
- **Wiederherstellung.** SDIO D2/D3 sind USB D+/D- des C5 (GPIO14, GPIO13), sein USB Serial/JTAG ist also nicht nutzbar.
  UART0 (TX0 Pin 39 = GPIO11 mit 499 ohm im Modul, RX0 Pin 40 = GPIO12), GPIO28, EN und Masse auf beschrifteten
  Testpunkten (Gruppe C5, TP832 `GND`, TP831 `3V3_WIFI`) sind der einzige kabelgebundene Weg, es zu flashen und
  wiederherzustellen.

### esp-hosted über SDIO

Der C5 betreibt esp-hosted und ist der WLAN-Adapter und Bluetooth-Controller des P4. esp-hosted-mcu 3.1.0 (ESP-IDF 5.5
oder neuer) führt den C5 als SDIO-Co-Prozessor des P4 auf ([Erste
Schritte](https://github.com/espressif/esp-hosted-mcu/blob/v3.1.0/docs/getting-started-mcu.md#1-sdio)).

| Verlangt | Hier |
|---|---|
| Die festen SDIO-Pins des C5 CLK 9, CMD 10, D0 8, D1 7, D2 14, D3 13 (Modulpins 21, 22, 20, 19, 24, 23), Chip-Revision v1.0 oder neuer | wie verlangt, alle am unteren Rand des Moduls, zum MCU hin |
| Am P4 die Pins von Slot 0, direkt mit der SDIO-Einheit verdrahtet | Slot 0 (GPIO39 bis 44: Befehl 44, Takt 43, Daten 39 bis 42). Die meisten P4-Platinen nutzen Slot 1, weil Slot 0 ihre SD-Karte trägt |
| 51-k-Pull-ups an CMD und D0 bis D3 | R305 bis R309, an die eigene Schiene des Moduls |
| Eine Reset-Leitung vom Host zu EN | GPIO45 über R302 1 k an EN (R301 10 k, C303 1 uF). Der 10-ms-Puls zieht EN auf 0,3 V und hält ihn 8,4 ms unter der Schwelle. Die Reset-Polarität ist eine Firmware-Einstellung |
| HDG 1.4.9: Leitungen innerhalb von 1,27 mm vom Takt, höchstens 50,8 mm, 50 ohm +-10 %, kein Lagenwechsel, ununterbrochene Bezugsfläche, Masse um den Takt | Bus gelegt von `routes_sdio.py`: sechs Leitungen auf der Rückseite über In4, 0,15 mm (49 ohm), jede 40,3 mm von Pad zu Pad, durch Serpentinen auf 0,01 mm gleich; Takt (22 ohm R304 am P4) am westlichen Rand, 1,2 mm von seinem Nachbarn, Massefüllung auf beiden Seiten, alle 2,5 mm vernäht. Jede Leitung wechselt an jedem Ende einmal die Lage, Masse-Via innerhalb von 0,7 bis 1,7 mm (siehe [Bekannte Einschränkungen](hardware/touch-p4/limitations.md)) |
| Eine Versorgung, die nicht einbricht, mindestens 0,6 A | U302 mit 22 uF und 100 nF am Pin ([Der Wandler des WLAN-Moduls](#der-wandler-des-wlan-moduls)) |

Timing auf der verlegten Platine (`sim/si.py`): Takt und Daten kommen innerhalb von 0,18 ns voneinander an (die 22 ohm
des Takts und der Eingang des Moduls verlangsamen ihn, nicht seine Länge); Takt hin und Daten zurück dauern 1,01 ns, was
dem P4 5,0 ns bei 50 MHz und 10,0 ns bei 40 MHz lässt, nach einem Modul, das innerhalb der 14 ns des SD-Standards
antwortet. Nur der Takt hat einen Serienwiderstand; Espressifs Leitfaden verlangt, in jeder Leitung einen vorzusehen,
seine eigene Platine hat keinen. Die Versorgungsgruppe der SDIO-Pins (GPIO39 bis 48) trägt auch den Reset des Moduls,
den Summer und die LED-Datenleitung: langsame Signale in hohe Impedanzen, keine Leistungsstufe.

Bekannte esp-hosted-Probleme auf anderen P4-Platinen, nach Ursache, und wo diese Platine steht:

| Symptom (Bericht) | Ursache | Hier |
|---|---|---|
| Keine Verbindung, verworfene Pakete, Neustartschleifen (ESPHome 10956, esp-hosted 151) | Host und Co-Prozessor auf verschiedenen esp-hosted-Versionen | Modul kommt leer; über seine Testpunkte geflasht, beide Seiten auf einer Version gehalten |
| `send_op_cond returned 0x107` beim Start (esp-hosted 127, Arduino 11404) | falsche Reset-Polarität, unversorgter Co-Prozessor (Versorgung von einem IO-Expander geschaltet) oder keine Firmware | Versorgung nicht geschaltet; Polarität in der Firmware |
| `Unrecoverable host sdio state` nach Minuten oder Stunden (esp-hosted 167, 121) | eine Display-Bibliothek, die während SDIO ROM-Cache-Funktionen aufruft; ein Fehler in esp-hosted 3.0.9, behoben in 3.1.0; eine eigene Platine ungeklärt | Firmware für die ersten beiden |
| CRC-Fehler unter Last auf einer eigenen Platine (esp-hosted 167) | nicht geklärt; Espressif liest es als Timing-Reserve, der Berichtende vermutet die SDIO-Einheit des C6 | Anteil der Platine 1,01 ns; Standardflanken beibehalten; Durchsatz und Fehlerzahl bei der Inbetriebnahme gemessen |
| Co-Prozessor lässt sich nicht über SDIO aktualisieren (esp-hosted 143) | Co-Prozessor-Firmware 2.1 bis 2.8 zuerst geflasht | das erste Image ist ein neueres; Testpunkte als Weg zurück |
| Verbinden als Bluetooth-Central wird nie abgeschlossen (esp-hosted 204) | Fehler auf der Host-Seite, Patch im Bericht, im November 2026 noch offen | Firmware; wichtig für den Bluetooth-Proxy des Lesers |

Weitere Berichte (hängende Downloads, ein Double Free im Empfangs-Task) sind Firmware- oder Access-Point-Themen. Keine
gefundene Ursache liegt in der Schaltung oder im Layout dieser Platine; die meisten sind Firmware-Versionen und
-Einstellungen ([Pinbelegung und Firmware-Portierung](hardware/touch-p4/firmware-port.md)). Die zwei ungeklärten
Berichte von eigenen Platinen lassen sich für eine ungebaute Platine nicht ausschließen, daher lässt die Inbetriebnahme
zuerst den rohen Durchsatztest von esp-hosted laufen.

### Strapping-Pins

Moduldatenblatt v1.4 Kapitel 4; HDG 1.3.9. Die Straps werden in den 3 ms gelesen, nachdem EN ansteigt; der P4 treibt
dann keinen dieser Pins (er ist 120 bis 280 ms im Reset, und später setzt esp-hosted das Modul zurück, bevor es den
SDIO-Host startet, dessen Datenleitungen außerhalb einer Übertragung Eingänge sind).

| Pin | Strap | Standard | Hier |
|---|---|---|---|
| GPIO28 (Pin 4) | Boot-Modus: 1 = Flash; 0 mit GPIO27 = 1 = Download über UART0 | interner Pull-up | R303 10-k-Pull-up, wie das HDG empfiehlt, kein Kondensator. Boot-Testpunkt: beim ersten Flashen beim Reset auf Masse gehalten |
| GPIO27 (Pin 35) | Boot-Modus, ROM-Meldungen | interner Pull-up | offen; nichts darf ihn nach unten ziehen |
| GPIO26 (Pin 34) | Boot-Modus (nur bei 27 und 28 low) | schwebend | offen |
| GPIO25 (Pin 33), MTDI = GPIO3 (Pin 7) | SDIO-Abtast- und Treiberflanken | schwebend | offen. Der Slave-Treiber setzt die Flanken (`sdio_slave_config_t.timing`); `EH_TRANSPORT_CP_SDIO_TIMING` von esp-hosted steht standardmäßig auf steigender Flanke. Beim Standard bleiben |
| GPIO7 (Pin 19) = SDIO D1 | JTAG-Quelle, sobald das eFuse JTAG_SEL_ENABLE gebrannt ist | kein Pull | vom 51-k-SDIO-Pull-up auf high gehalten. JTAG_SEL_ENABLE nie brennen |
| MTMS = GPIO2 (Pin 6) | als Strapping-Pin aufgeführt, schwebend | schwebend | offen |

### Antenne

Die Dualband-Platinenantenne des Moduls, gespeist über einen Diplexer, belegt die 5,85 mm am oberen Ende des Moduls
(Datenblatt v1.4 Abb. 11-1). Aus `scripts/bootstrap/geometry.py`:

| | |
|---|---|
| Antennenbereich | x 20,1 bis 35,5, y 0,3 bis 6,15 (untere Grenze = Massekante des Moduls) |
| Ausschnitt im oberen Rand | x 8,6 bis 37,5, 6,0 tief: keine Platine unter oder neben der Antenne. Boden 0,15 mm über der unteren Grenze der Antenne; 2 mm über das Modul hinaus nach rechts (Massepunkt), 11,5 mm nach links (offenes Ende) |
| Kupfer-Sperrfläche | x 0 bis 50,5, y 0 bis 6,3, alle sechs Lagen: der Antennenbereich und 15 mm daneben, bis 0,2 mm über der obersten Pad-Reihe des Moduls |
| Masse am Rand | zwölf 0,45-mm-Vias in den Lücken zwischen den neun Massepads des Moduls, wie Espressifs Land Pattern sie zeigt; gefüllt und überdeckelt, sodass keines Lot zieht. Kein Via in den Pads des Moduls. Massefüllung auf allen Lagen unterhalb der Sperrfläche, alle 2,5 mm entlang der Oberkante und um das Modul vernäht |
| Im Gehäuse | 1,8 mm zur oberen Wand, 4,7 mm zur Vorderwand, 13,1 mm zur Dock-Platte, 15,6 mm zu einer Metallwand. Die Metallrückseite des Displays liegt 6,7 mm unter dem Antennenbereich, 3,9 mm hinter seiner Ebene, an vier Pads geerdet |

Espressifs HDG 1.4.7 (Abbildungen 22, 23) empfiehlt die Antenne jenseits des Platinenrands mit ihrem Massepunkt an einer
rechten Ecke und 15 mm Freiraum im Gehäuse; diese Platine nutzt oben links den Ausschnitt, den der Leitfaden als
Ausweichlösung nennt. Warum, und was es kostet, steht unter [Bekannte
Einschränkungen](hardware/touch-p4/limitations.md).

Vollwellenmodell (`sim/wifi_antenna.py`, openEMS, Target `simulate-antenna`). Espressif veröffentlicht die Form der
Antenne nicht. Ein Ersatzmodell derselben Größe und Art (invertierte F-Antenne, langer Arm für 2,4 GHz, kurzer Zweig für
5 GHz, Massepunkt rechts) wurde auf einer Evaluationsplatine von 40 x 55 mm auf 2,429 GHz (-10 dB) und 5,435 GHz (-8 dB)
abgestimmt, dann unverändert auf diese Platine gesetzt und zum Vergleich an Espressifs Position 3 (obere rechte Ecke,
über den Rand hinausragend, Gehäuse vergrößert, um dieselben Wandabstände zu halten). Abgestrahlt von der eingespeisten
Leistung (Fehlanpassung eingerechnet), in Klammern: von der aufgenommenen Leistung, in dB:

| Fall | 2,4 GHz Res. | Kanal 1 / 7 / 13 | 5 GHz Res. | 5,18 / 5,50 / 5,70 GHz |
|---|---|---|---|---|
| Diese Platine, oben links | 2,375 | -2,7 / -2,9 / -3,4 (-1,7 / -1,6 / -1,4) | 5,435 | -3,9 / -2,8 / -4,0 (-1,8 / -2,0 / -1,7) |
| **im Gehäuse, mit dem Display** | 2,325 | **-3,0 / -3,5 / -4,1** (-1,5 / -1,4 / -1,3) | 5,430 | **-3,8 / -2,5 / -4,0** (-1,9 / -1,7 / -1,9) |
| im Gehäuse, Metallwand 16,4 mm dahinter | 2,308 | -4,7 / -4,9 / -5,2 (-2,6 / -2,4 / -2,3) | 5,430 | -4,3 / -3,0 / -4,6 (-2,6 / -2,4 / -2,7) |
| im Gehäuse, Aluminium-Frontplatte | 2,321 | -4,5 / -5,2 / -6,0 (-1,9 / -1,8 / -1,7) | 5,425 | -4,5 / -3,2 / -5,2 (-2,2 / -2,0 / -2,5) |
| Aluminium-Frontplatte mit Fenster | 2,325 | -2,8 / -3,5 / -4,2 (-1,6 / -1,5 / -1,4) | 5,430 | -3,7 / -2,4 / -4,0 (-1,8 / -1,7 / -1,9) |
| **Position 3, im Gehäuse, mit dem Display** | 2,427 | **-1,1 / -1,1 / -1,2** (-1,1 / -1,1 / -1,0) | 5,800 | **-9,3 / -5,0 / -3,2** (-3,9 / -2,9 / -2,5) |

- Im Gehäuse strahlt der Platz oben links bei 2,4 GHz 1,9 / 2,4 / 2,9 dB weniger ab als Position 3 und bei 5 GHz 5,5 dB
  mehr bis 0,8 dB weniger: in jedem Kanal innerhalb von 3 dB. Bei 2,4 GHz liegt der Unterschied größtenteils in der
  Anpassung (von der aufgenommenen Leistung nur 0,3 bis 0,4 dB weniger). Ausschnitt und Sperrfläche ziehen die Resonanz
  um 54 MHz nach unten, das Gehäuse um weitere 50 MHz, sodass Kanal 13 am oberen Rand der Anpassung liegt.
- Die absoluten Zahlen sind die des Ersatzmodells. Espressifs eigene Antenne strahlt auf ihrer Testplatine bei 2,4 GHz
  77 bis 83 % (-0,8 bis -1,1 dB) und bei 5 GHz 51 bis 68 % (-1,6 bis -2,9 dB) ab (Antennenbericht zur FCC ID
  2AC7Z-ESPC5MINI1, Sporton, 1. Dezember 2025).
- Die Metallrückseite des Displays ändert fast nichts. Eine Metallwand kostet bei 2,4 GHz 1,1 bis 1,7 dB und bei 5 GHz
  0,5 bis 0,6 dB und schickt den größten Teil des Rests nach vorn (76 % und 88 % in Richtung Raum, gegenüber 47 %).
- **Frontmaterialien.** Gedruckte (ABS, PETG), hölzerne und andere nichtmetallische Fronten funktionieren überall. Eine
  geschlossene Aluminium-Frontplatte kostet bei 2,4 GHz 1,5 bis 1,9 dB und bei 5 GHz 0,7 bis 1,2 dB; mit einem Fenster
  über x 0 bis 50,5 kostet sie nichts.

### Wärme

Die 85-°C-Angabe des Moduls gilt für die Luft direkt außerhalb. `sim/thermal.py` hat keinen Luftknoten und gibt daher
zwei Grenzen: unten die Luft im Hohlraum zwischen Platine und Dock-Platte (Mittel aus Platine und Innenfläche der
Platte); oben die Platine neben dem Modul. Verluste des C5: 0,40 W typisch (verbunden, Empfang auf 5 GHz, 110 mA), 0,88
W bei halber Sendezeit auf 5 GHz, 1,36 W bei ständigem Senden; dazwischen im Verhältnis. Luft außerhalb des Moduls in
einem Raum mit 40 °C:

| Rest der Platine | Modul sendet | USB | DC 12 V | PoE |
|---|---|---|---|---|
| typischer Betrieb | selten (0,40 W) | 57 bis 67 °C | 59 bis 70 °C | 63 bis 77 °C |
| typischer Betrieb | 40 % (0,78 W) | 59 bis 76 °C | 62 bis 79 °C | 65 bis 84 °C |
| typischer Betrieb | 50 % (0,88 W) | 60 bis 78 °C | 62 bis 81 °C | 66 bis 86 °C |
| typischer Betrieb | ständig (1,36 W) | 63 bis 89 °C | 65 bis 92 °C | 69 bis 97 °C |
| alles lange eingeschaltet | selten | 66 bis 79 °C | 72 bis 85 °C | 76 bis 91 °C |
| alles lange eingeschaltet | 40 % | 69 bis 87 °C | 74 bis 93 °C | 78 bis 100 °C |

Daher begrenzt die Firmware den Sendeanteil des Moduls auf 40 %, gemittelt über eine Minute ([Pinbelegung und
Firmware-Portierung](hardware/touch-p4/firmware-port.md)). Der eigene Datenverkehr des Lesers bleibt weit darunter; die
Regel greift nur bei langen Uploads. „Alles lange eingeschaltet“ liegt ohnehin jenseits dessen, was das Gehäuse abführen
kann, und wird durch die Temperaturregel der Firmware beendet (Hintergrundbeleuchtung und LEDs dimmen, dann das
Funkmodul zurückhalten). Im Inneren des Moduls zum Vergleich: 81 °C im typischen Betrieb an PoE. Schätzung +-40 %; bei
der Inbetriebnahme gemessen. Wärme der ganzen Platine: [Wärme im geschlossenen
Gehäuse](#wärme-im-geschlossenen-gehäuse).

## Manipulationserkennung

Drei Sensoren melden der Firmware, dass sich jemand am Leser zu schaffen macht. Alle sind bei beiden Versionen bestückt;
die Firmware liest sie noch nicht.

| Sensor | Bauteil | Erkennt | Wie er gelesen wird |
|---|---|---|---|
| Beschleunigungssensor U702 | LIS2DH12TR | Schläge und Bohren, Aufschwenken oder Abreißen (Neigung gegenüber der Richtung beim Einbau), Fallen | I2C0, 0x19. Die Ereignisregister halten den Zustand, Abfragen reicht. INT1 auf TP814 (`INT`) |
| Näherungssensor U704 | VCNL4040M3OE | am oder vom Dock: 940-nm-Pulse in den geschlossenen Raum hinter der Platine, reflektiert von der Dock-Platte 13,9 mm entfernt; außerdem sichtbares Licht in diesem Raum | I2C0, 0x60. Nähe und Umgebungslicht mit 16 Bit; setzt ein Flag, wenn der Näherungswert ein Band zwischen unterer und oberer Schwelle verlässt. INT (Open Drain, 10-k-Pull-up) auf TP815 (`INT`) |
| Hall-Schalter U703 | DRV5032FA | am oder vom Dock: Ein Magnet im Dock liegt ihm gegenüber | `DOCK_N` an P6 des IO-Expanders: Low am Dock. Tastet 20-mal pro Sekunde ab |

- **Magnet:** Neodym-Scheibe 10 x 3 mm, N35 oder stärker, axial magnetisiert, beliebiger Pol oben, in einem Ring auf der
  Dock-Platte am Platinenpunkt (12,5; 38,2), 10,3 mm vom Schalter: etwa 22 mT, im ungünstigsten Fall 16 mT
  (`sim/dock.py`). Der Schalter schaltet innerhalb von 19 mm sicher ein (4,8 mT) und lässt jenseits von 45 mm sicher los
  (0,5 mT), typisch bei 29 mm. Er meldet die Entfernung, sobald der Leser abgehoben ist; das untere Ende 20 mm
  herauszuschwenken bewegt ihn nur 5 mm, neigt den Leser aber um 7 Grad, was der Beschleunigungssensor sieht. Ein ans
  Gehäuse gehaltener Magnet kann ihn täuschen; den Lichtweg des Näherungssensors im geschlossenen Gehäuse kann man ohne
  ein Loch im Gehäuse nicht täuschen.
- **Näherungssensor** bei (21,6; 52,4), Sender am oberen Ende, keine Abdeckung davor. Sein Licht macht einen Fleck von
  7,4 mm Radius auf der Platte, die 9 mm rundherum eben ist. Der Messwert am Dock hängt von der Farbe der Platte ab
  (Vishays Application Note, 18 % Grau bei 12,8 mm: etwa 50 / 75 / 120 Zählwerte bei 50 / 100 / 200 mA mit 1T-Pulsen,
  400 bis 1100 mit 8T; ein Fünftel weniger je 2 mm Abheben); die Firmware speichert den Messwert im montierten Zustand
  und meldet, wenn er ein Band darum verlässt. Vom Dock genommen misst er nahe null. Sichtbares Licht hinter der Platine
  ist ein weiteres Zeichen für ein offenes Gehäuse.
- Bewährt sich der Näherungssensor, können U703, C713 und der Magnet entfallen; nichts anderes ändert sich.
- Nicht erkannt: ein durchtrenntes Kabel oder verlorene Versorgung (der Server sieht den Leser offline gehen) und dass
  die Platine aus der Kappe genommen wird.
- Beschleunigungssensor und Hall-Schalter sitzen links vom MCU, 15 mm vom Summer und 22 mm von der nächsten Spule
  entfernt; den Magneten vom PoE-Modul, den Spulen und dem NFC-Anpassnetzwerk fernhalten. Der Summer rüttelt die Platine
  mit 2,7 kHz: Den Beschleunigungssensor ignorieren, solange er piept.
- Die freien Pins des MCU (GPIO27, 48, 53, 54) sind nicht nutzbar (Kondensatoren vor dreien, Ethernet um den vierten),
  daher läuft alles über I2C und den IO-Expander.

## ESD je Anschluss

Ziel: EN 301 489-1 V2.2.3 Abschnitt 9.3.2, von den Teilen 3 (NFC) und 17 (WLAN) auf das Gehäuse angewendet: ±4 kV
Kontakt, ±8 kV Luft, an allen zugänglichen Oberflächen außer dort, wo die Nutzerdokumentation Schutzmaßnahmen angibt.
Kriterium B (EN 301 489-17 6.4): Der Leser darf zurücksetzen, muss sich aber selbst erholen. Kabelanschlüsse bekommen
Transienten und Surges, keine ESD (EN 301 489-1 Tabelle 2). IEC 61000-4-2 8.3.2 lässt Punkte aus, die nur im Service
erreicht werden, wenn das Handbuch ESD-Maßnahmen nennt, und Kontakte im Inneren eines Metallsteckergehäuses.

| Anschluss | Was berührt werden kann | Ziel | Schutz, Nennwert | Reserve |
|---|---|---|---|---|
| USB-C | nichts im Betrieb; nur erreichbar, wenn der Leser vom Dock ist (Service) | als Service ausgelassen; sonst 4 kV Kontakt am Gehäuse | Gehäuse an Masse; D+/D- U101 USBLC6-2SC6, 15 kV Luft / 8 kV Kontakt (ST); VBUS D101 SMAJ5.0A, 30 kV | 2x und mehr |
| DC-Buchse und Klemme | im Gehäuse; Luft an der Kabelkerbe | 8 kV Luft | D107 SMBJ28CA am Anschluss, 30 kV (Littelfuse), dann 2,2 uF + 47 uF | 3,75x |
| Ethernet und PoE | im Gehäuse; Stecker eingeschlossen | nur Koppelfläche | Magnetics der Buchse 1500 V RMS (HanRun), PHY 12 kV Kontakt (IP101G); D103 SMAJ58A und das isolierte Modul; Schirm über C410 1 nF / 3 kV | isoliert |
| Displayglas, Vorderseite | 0,55 mm Glas | 8 kV Luft | der Lichtbogen endet am Glas | kein Spalt |
| Displaykanten, Flexkabel dahinter | 0,25-mm-Fuge rund um das Glas; Flexkabel am unteren Rand | 8 kV Luft | Touch-Leitungen (TP_INT, TP_RST, I2C0 SDA/SCL): U603, U604 USBLC6-2SC6 am Anschluss; Metallrückseite auf den vier Pads geerdet; Klebeband über dem Flexkabel ([Installationsanleitung](hardware/touch-p4/installation-manual.md)) | 15 kV Luft |
| NFC-Bereich | massive 2,4 mm starke Vorderwand | 8 kV Luft | keine Öffnung; Schleife durch ihre Anpassung an Masse nebengeschlossen | kein Spalt |
| LED-Fenster, Summerlöcher, Haltschrauben, Fugen | Diffusoren, Löcher nahe dem Summer, zwei schwebende M3-Schrauben | 8 kV Luft; 4 kV Kontakt an den Schrauben | keiner auf der Platine (SK6812MINI-E 2 kV HBM, Summer und FET ohne Angabe) | nicht belegt: [Bekannte Einschränkungen](hardware/touch-p4/limitations.md) |
| WLAN-Antenne | im Gehäuse hinter der oberen Wand | 8 kV Luft an der Fuge | kein ESD-Bauteil auf der HF-Leitung (das Modul lässt D2 unbestückt, Datenblatt Abb. 8-1); 1,8 mm hinter der oberen Wand, 4,7 mm hinter der Front, kein leitender Pfad nach außen | nicht belegt; Vortest bei der Inbetriebnahme |
| Taster und Testpunkte | nur im Service | als Service ausgelassen | CHIP_PU 10 k + 1 uF + Supervisor; BOOT hinter 1 k | Service |

Quellen: ETSI EN 301 489-1 V2.2.3 Abschnitte 6.2, 7.2, 9.3; EN 301 489-17 V3.3.1 6.4; IEC 61000-4-2 Ed. 2.0 8.3.2; EN
55035:2017 gemeinsame Änderung 1; ST USBLC6-2SC6 Rev. 5; R+O SMAJ Rev. 2.2; Littelfuse SMBJ (07/04/25); HanRun HY931147C
REV.A/1; IC Plus IP101G R01 7.1; OPSCO SK6812MINI-E Spezifikation B/2; ESP32-C5-MINI-1 Datenblatt v1.4 Abb. 8-1.

## MCU

ESP32-P4NRW32X (das X-Bauteil verwenden, Silizium v3.x; das Bauteil ohne X ist abgekündigt). Geprüft gegen das HDG v2.0,
das Datenblatt v0.7 und den Schaltplan 1.52 des ESP32-P4-Function-EV-Board.

- **Versorgungskondensatoren**, wie das HDG verlangt: 10 uF + 100 nF an den Versorgungen von Regler, Wandlersteuerung,
  Low-Power-Teil und Batterie; 100 nF an jeder IO-Versorgung, an der Analogversorgung und an jedem Kernpin, 10 uF am
  ersten Kernpin; 1 uF an jedem Reglerausgang; 10 nF, 100 nF und 4,7 uF am USB-PHY. Wo sie sitzen: [Abblockung am
  MCU](#abblockung-am-mcu).
- **Reset:** 10 k und 1 uF (Werte des HDG), plus Supervisor U204.
- **Straps:** GPIO35 über 10 k high und über den BOOT-Taster low; GPIO36 über 1,5 k high, bei beiden Versionen bestückt
  (der Download-Modus braucht ihn high); GPIO34 über 10 k high (kein interner Pull); GPIO37, 38 frei.
- **Pinbelegung:** kein GPIO doppelt genutzt; die USB-Pads beachtet (GPIO26, die Hintergrundbeleuchtung, ist eines, wie
  auf Espressifs Platine); Ethernet auf Pins, die der MAC ohne die GPIO-Matrix erreicht. Vollständige Belegung unter
  [Pinbelegung und Firmware-Portierung](hardware/touch-p4/firmware-port.md).
- **Testpunkte:** Jede Schiene hat einen, außer der PSRAM-Versorgung und den 1,1 V des PHY; der Inbetriebnahmeplan nennt
  für diese ein Bauteil zum Messen.
- Die 100 nF am Versorgungspin des Flash sitzen 5,3 mm entfernt: Data-out und Chip-Select laufen unter dem Pin, der
  Körper des Flash liegt daneben.

## Wärme im geschlossenen Gehäuse

`sim/thermal.py`, Lehrbuchwerte für ruhende Luft, ±40 %, Anstieg über den Raum:

| Versorgung | Typischer Betrieb | Platine | Wärmste Stelle | Display | WLAN-Modul: Platine darunter, Hohlraum | Alles lange eingeschaltet: Platine, LED-Ring, Platine am WLAN-Modul, Hohlraum |
|---|---|---|---|---|---|---|
| USB | 2,5 W | +23 K | +30 K | +18 K | +29 K, +17 K | +41 K, +55 K, +51 K, +30 K |
| DC 12 V | 2,9 W | +26 K | +35 K | +21 K | +32 K, +19 K | +48 K, +62 K, +57 K, +35 K |
| PoE | 3,5 W | +31 K | +39 K | +24 K | +37 K, +23 K | +54 K, +68 K, +63 K, +40 K |

Bei 25 °C ist der typische Betrieb weit von jeder Grenze entfernt. Bei 40 °C an PoE: Display 64 °C (Grenze 70), Luft um
das PoE-Modul 71 °C (85), Luft außerhalb des WLAN-Moduls 63 bis 77 °C (85); Display und PoE-Modul mit weniger Reserve,
als die Schätzung genau ist. Alles lange eingeschaltet liegt jenseits dessen, was das Gehäuse abführen kann (der
LED-Ring, auf schmalem Kupfer zwischen den Ausschnitten, 55 bis 68 K über dem Raum mit dem Ring an seiner Grenze von 0,2 A; die zwei Achterreihen erreichten 70
bis 80 K); die Firmware begrenzt die LEDs
und überwacht die Chiptemperatur. Nachrechnung von Hand: 3,4 W über die 0,0107 m² der Platine mit den
Oberflächenkoeffizienten des Modells ergeben 31 K, innerhalb von 3 % des Modells.

## Layout

### Lagenaufbau

Sechs Lagen, JLCPCB JLC06161H-3313, 1,6 mm: Außenkupfer 1 oz, Prepreg 3313 0,0994 mm (er 4,1) unter beiden äußeren
Lagen, Kerne 0,55 mm, mittleres Prepreg 2116 0,1088 mm.

| Lage | Verwendung |
|---|---|
| F.Cu | Bauteile, Signale, Massefüllung |
| In1 | Massefläche, ein Stück |
| In2 | Signale (1130 mm, 28 % aller Leiterbahnen), Massefüllung dazwischen |
| In3 | 3,3-V-Fläche, ein Stück, mit einem Streifen hinunter zu den NFC-Teilen |
| In4 | Massefläche, ein Stück |
| B.Cu | Signale, Kupferfläche der Kernschiene unter dem MCU, Massefüllung |

Auf In1, In3 oder In4 läuft keine Leiterbahn. Wo die Flächen enden und an Vias haben 7 % der Länge der schnellen Signale
auf In2 und B.Cu keine Fläche daneben.

### Netzklassen

Die Netzklassen und die anderen Layout-Regeln stehen unter [Designstandards und
Review-Kriterien](hardware/touch-p4/review.md).

Nach dem Routing verbreitert `post_route.py` jede Versorgungsleiterbahn so weit, wie das Kupfer daneben es erlaubt (in
Richtung 0,6 mm für den Kern, 0,5 mm für 3,3 V, 0,8 mm für 5 V, 0,4 mm für die übrigen), und die 0,112-mm-Verengungen
des Autorouters auf 0,127 mm. Eine Leiterbahn, die an einem Pad endet, bleibt so schmal wie das Pad. 88 von 527
Segmenten der Klasse Power bleiben unter 0,25 mm, alle an Pins mit feinem Raster; zwei Signalsegmente bleiben 0,112 mm.
Das Minimum der Platine ist auf 0,11 mm gesetzt.

### Routing

- **Von Hand per Skript geroutet und gesperrt:** 48-V-Netze, Ethernet-Paare und Mittelanzapfungen; die DC-Eingangskette,
  die Summerschaltung und der Ausgang des PoE-Moduls; die linken und unteren Pins des PHY; die Antennenzuleitungen und
  der SDIO-Bus; die lokalen Verbindungen von Beschleunigungs- und Näherungssensor; der LED-Ring (Datenleitung von LED
  zu LED, das 5-V-Pad jeder LED zu ihrem Kondensator und einem Via, und die 5-V-Schiene auf In2 um den Ring, offen an
  der Lücke des Kupfers um die Schleife); am MCU fast jeder Signalpin (vollständige Route oder eine feste
  Leiterbahn zu einem Via, von dem aus der Router in jede Richtung weiterkann), mit benachbarten Vias abwechselnd in
  zwei Reihen und auf 0,45 bis 0,5 mm gespreizten Leiterbahnen; der Fan-out der NFC-Host-Signale am PN532; UART0 TX und
  das Backlight-PWM über die Rückseite.
- **Danach** Freerouting und, wo es aufgibt, der Gitterrouter in `scripts/bootstrap/finish_route.py`. Nicht benötigte
  Fan-out-Vias werden am Ende entfernt.
- **Umgebung des MCU.** Die Ausgänge nutzen jede Kante: Displaysignale unten, SDIO, NFC und Quarz links, Flash rechts,
  Ethernet und UART oben. Nur zwei Kondensatoren sitzen neben den Pins der linken Seite; die Reglerkondensatoren über
  dem MCU stehen 2,4 mm von der Pad-Reihe.
- **Vias:** 0,45 mm Pad, mindestens 0,2 mm Bohrung, die meisten mit 0,5-mm-Pads; der Rest behält 0,45 mm, wo kein Platz
  ist. Jeder Versorgungspin des P4 hat ein Via knapp innerhalb der Pad-Reihe hinunter zur 3,3-V-Fläche oder zur
  Kupferfläche der Kernschiene. Die sieben RMII-Vias über dem MCU schneiden einen Schlitz von 4 x 1,6 mm in die Flächen.
- **Masse** hängt nie von der Füllung der äußeren Lagen ab: Jedes Massepad hat ein Via in eine Fläche oder eine
  Leiterbahn zu einem Pad, das eines hat. Die Massepins der QFN-Bauteile laufen in ihre freiliegenden Pads.
- **Masse-Vias** (`post_route.py`): eines neben jedem Via eines schnellen Signals (RMII, SDIO, USB, Ethernet), Stitching
  alle 5 mm und alle 2,5 mm entlang der Oberkante und um das WLAN-Modul. Keine Füllung ist mehr als 5,6 mm von einem
  Masse-Via entfernt. Von 42 Vias schneller Signale haben 25 ein Masse-Via innerhalb von 1,5 mm; 6 keines innerhalb von
  3 mm (höchstens 3,8 mm), an den dicht gepackten Ethernet-Vias über dem MCU und am PHY.
- **Spannungsabfall** (`sim/irdrop.py`): höchstens 0,07 V mit 1,9 A auf 5 V (jede Last mit ihrem Auslegungswert, die 16 LEDs mit
  je 36 mA); keine äußere
  Leiterbahn über dem Strom für 20 K Anstieg. Die 1,5 A des USB-Eingangs laufen 13 mm auf einer 0,62 mm breiten inneren
  Leiterbahn, 0,1 mm von einer Fläche, die ihre 70 mW aufnimmt.
- Teardrops werden nicht hinzugefügt (KiCad erzeugt sie nur interaktiv); die größeren Via-Pads übernehmen einen Teil
  ihrer Aufgabe.

### Impedanz

Zwei Arten von Impedanzleitungen, beide auf den äußeren Lagen über ihrer Massefläche:

- **USB D+/D-:** ein Via an jedem Ende, sonst ein gekoppeltes Paar auf der Rückseite, 0,14 mm / 0,15 mm Spalt, gleiche
  Länge und gleiche Via-Zahl (`routes_signal.py`). USB 2.0 verlangt 90 ohm +-15 %.
- **Ethernet-Paare vom PHY zur Buchse:** 0,155-mm-Leitungen (je 50 ohm) am 1,27-mm-Raster der Buchse, 1,115 mm
  auseinander. Beim Elffachen der Höhe koppeln sie kaum: 100 ohm differenziell (+-15 % für 100BASE-TX).

| Leitung | Breite / Spalt (mm) | JLCPCB-Rechner | 2D-Feldlösung | Geschlossene Formel (TI SNLA187) |
|---|---|---|---|---|
| USB-Paar, differenziell | 0,14 / 0,15 | 90,4 ohm | 90,9 ohm | 91,9 ohm |
| Ethernet-Leitung einzeln | 0,155 | 50,3 ohm | 51,2 ohm | 48,9 ohm |
| Ethernet-Paar, differenziell | 0,155 / 1,115 (0,95 dort, wo das Sendepaar dem PoE-Pin ausweicht) | 100,1 ohm | 100,5 / 99,1 ohm | 97,8 ohm |

Eingaben des Rechners: Prepreg 3313 0,0994 mm er 4,1, 1 oz Außenkupfer, Lötstopplack 1,0 mil auf dem Laminat und 0,6 mil
auf dem Kupfer (er 3,8). Die Feldlösung ist `sim/field2d.py` auf den verlegten Querschnitten; die geschlossene Formel
lässt den Lack aus (der die Impedanz hier um 2 bis 3 ohm senkt). Die Fertigungszeichnung verlangt Impedanzkontrolle mit
+-10 % bei den Werten des Rechners und lässt den Hersteller die Breiten anpassen. 0,15-mm-Signalleiterbahn: 49 ohm
außen, 46 ohm auf In2.

### Reserven zu den Grenzen von JLCPCB

Aus `scripts/fab_margins.py` gegen die veröffentlichten Fähigkeiten von JLCPCB für sechs Lagen
(https://jlcpcb.com/capabilities/pcb-capabilities):

| Merkmal | Diese Platine | JLCPCB | Reserve | Warum |
|---|---|---|---|---|
| Leiterbahnbreite | 0,112 | 0,09 | +0,022 | Verengungen des Autorouters an Pins mit feinem Raster |
| Leiterbahn zu Leiterbahn / Pad | 0,127 | 0,09 | +0,037 | Regel der Platine |
| SMD-Pad zu Pad, zwei Netze | 0,150 | 0,15 | **0** | 0,35-mm-Raster des P4 mit Espressifs 0,20-mm-Pads; U702 LGA. Eckpads beschnitten (0,163 mm) |
| Lötstopplack-Steg | 0,100 | 0,10 (grün, 1 oz) | **0** | dieselben Pins, Lack 0,025 mm je Seite. Grün ist die einzige Farbe mit einem 0,10-Steg |
| Via, Loch / Durchmesser | 0,20 / 0,45 | 0,15 / 0,25; Aufpreis unter 0,45 bei einem 0,20-Loch | **0** bis zur Preisstufe | kleinstes Via ohne Aufpreis |
| Via-Restring | 0,125 | 0,05 (0,15 bevorzugt) | +0,075 | |
| Restring durchkontaktierter Löcher (Bauteile) | 0,155 | 0,15 Minimum, 0,20 empfohlen | +0,005 / -0,045 | die vier Wärme-Vias des PN532, als durchkontaktierte Pads gezeichnet (als Vias: in Ordnung). Steckverbinder: 0,199 (Schirmpins der Buchse) |
| Loch zu Loch, Vias / Bauteillöcher | 0,385 / 0,69 | 0,20 / 0,45 | +0,185 / +0,24 | |
| Via-Loch zu Leiterbahn | 0,254 | 0,20 | +0,054 | Ethernet-Via-Feld über dem MCU |
| Bauteilloch zu Leiterbahn | 0,31 | 0,28 Minimum, 0,35 empfohlen | +0,03 / -0,04 | Wärme-Vias des PN532 zu In2; Steckverbinder 0,383 oder mehr |
| Kupfer zum Platinenrand | 0,31 | 0,20 (gefräst) | +0,11 | Regel 0,3 |
| Bestückungsdruck Linie / Text / zu Pad | 0,15 / 1,0 / 0,15 | 0,15 / 1,0 / 0,15 | **0** | das Kleinste von JLCPCB, damit Beschriftungen und Bezeichner passen |
| Impedanztoleranz | +-10 % | +-10 % | 0 | genug für USB FS und 100BASE-TX |

Jedes Merkmal an der Grenze ist das Land Pattern des MCU, das billigste Via oder der Bestückungsdruck. DRC läuft mit
KiCads Standard-Schweregraden: 0 Fehler, 0 Warnungen, 0 nicht verbunden.

### Schaltwandler: Hot Loops

Gemessen von `scripts/layout_report.py`: Eingangsschleife des Abwärtswandlers vom Eingangskondensator zu VIN und von
seinem Massepad zum GND des ICs; Schleife des Aufwärtswandlers von der Kathode der Diode zum Ausgangskondensator und
zurück zu GND.

| Wandler | Kondensator | Versorgungsseite (Kupfer) | Masseseite (gerade) | Schleifenfläche | Masse-Vias innerhalb 1 mm (IC + Kondensator) | Schaltknoten-Kupfer |
|---|---|---|---|---|---|---|
| U104 AP63205, DC auf 5 V | C113 2,2 uF | 3,8 mm | 2,4 mm | 6,3 mm² | 1 + 1 | 10,1 mm² |
| U103 TLV62569, 5 V auf 3,3 V | C107 100 nF | 1,0 mm | 3,9 mm | 2,6 mm² | 0 + 1 | 7,4 mm² |
| U302 TLV62569, WLAN-Schiene | C305 100 nF | 1,4 mm | 5,1 mm | 1,1 mm² | 0 + 1 | 7,4 mm² |
| U202 TLV62569, 3,3 auf 1,1 V | C232 10 uF | 2,1 mm | 4,6 mm | 1,3 mm² | 1 + 1 | 3,7 mm² |
| U601 AP3032, Backlight-Aufwärtswandler | C606 1 uF | 2,5 mm | 5,2 mm | 0,3 mm² | 0 + 1 | 5,5 mm² |

Jede Schleife schließt sich auf der Bestückungsseite in einem Stück Massefüllung mit In1 direkt darunter. U103, U302 und
U601 haben kein Via an ihrem GND-Pin (SOT-23: Er sitzt zwischen dem Schaltpin und dem Pad der Spule); die Masse erreicht
In1 über das Via des Kondensators und die Füllung (U302 auch über ein Via zwischen seinen Pad-Reihen, 1,3 mm vom Pin).

### Abblockung am MCU

Kupferweg von jedem Versorgungspin des ESP32-P4 zum nächsten Kondensator, entlang von Leiterbahnen, Via-Hülsen und
Flächen (`scripts/layout_report.py`). Ziele in [Designstandards und Review-Kriterien](hardware/touch-p4/review.md).

| Pin | Versorgung | Weg (mm) | Kondensator | Pin | Versorgung | Weg (mm) | Kondensator |
|---|---|---|---|---|---|---|---|
| 9 | VDD_LP | 8,0 | C206 | 73 | VDDO_3 | 3,5 | C230 |
| 21 | VDD_IO_0 | 9,4 | C203 | 74 | VDDO_4 | 4,6 | C231 |
| 26 | VDD_HP_0 | 10,2 | C219 | 75 | VDD_LDO | 5,8 | C208 |
| 30 | VDD_FLASHIO | 9,2 | C224 | 76 | VDD_HP_2 | 9,1 | C221 |
| 51 | VDD_USBPHY | 4,4 | C216 | 77 | VDD_DCDCC | 2,0 | C208 |
| 54 | VDD_HP_1 | 6,9 | C220 | 85 | VDD_IO_5 | 7,0 | C208 |
| 59 | VDD_PSRAM_0 | 13,7 | C226 | 91 | VDD_HP_3 | 1,4 | C222 |
| 62 | VDD_IO_4 | 9,7 | C204 | 96 | VDD_IO_6 | 1,3 | C206 |
| 67 | VDD_PSRAM_1 | 10,9 | C226 | 101 | VDD_ANA | 6,1 | C206 |
| 71 | VDDO_FLASH | 3,6 | C223 | 102 | VDD_BAT | 3,4 | C214 |
| 72 | VDDO_PSRAM | 3,3 | C226 |  |  |  |  |

- Die obere Kante hat sieben Versorgungspins auf 2,1 mm (71 bis 77). Ein 0402 ist 0,64 mm breit und braucht 0,4 mm
  daneben für eine Leiterbahn, also passt ein Kondensator je 1,05 mm Reihe; nur jeder zweite Pin kann ein Via innerhalb
  der Reihe haben (0,35 mm Raster, 0,45-mm-Vias). Die 10 uF von VDD_DCDCC sitzen in der Ecke neben Pin 77 (2 mm,
  Masse-Via in ihrem Pad), was auch 10 uF innerhalb von 6 mm von VDD_LDO bringt.
- Die anderen Pins erreichen ihre Kondensatoren über das Via innerhalb der Pad-Reihe und die Fläche (3,3 V auf In3, Kern
  auf der Rückseite). Simuliert (`sim/pdn.py`) beträgt der Anteil der Platine über 30 MHz 1,1 nH an der Kernschiene (2,4
  nH für einen Pin allein) und 1,2 nH je 3,3-V-Pin, etwa so viel, wie das Gehäuse des Chips selbst beiträgt
  ([Simulationen](hardware/touch-p4/simulations.md)).
- Vier Vias liegen absichtlich in Pads, an der oberen linken Ecke des MCU (Massepads von C208, C223, C226 und das
  Versorgungspad von C223, wo die Flash-Versorgung auf In2 wechselt). JLCPCB füllt und überdeckelt jedes Via auf
  sechslagigen Platinen.

### Quarz

Y201: 40 MHz, 2,0 x 1,6 mm, Hosonic E1SB40E00001AE (LCSC C2689435), zweite Quelle Tai-Saw TZ1269D (C501798, gleiche Pads
und Last). Keine Brücken in den Leitungen.

- **Espressif** (P4 HDG 1.3.5): Die Firmware unterstützt nur 40 MHz; Genauigkeit innerhalb von ±10 ppm. Hosonic ±10 ppm
  bei 25 °C und von -30 bis +85 °C; Tai-Saw ±5 ppm, ±15 ppm über -40 bis +85 °C. Für den 40-MHz-Quarz ist keine
  ESR-Grenze angegeben; beide Bauteile haben höchstens 40 ohm und höchstens 100 uW Treiberleistung.
- **Lastkondensatoren** CL 9 pF, Cstray auf 3 pF geschätzt (Pins, etwa 7 mm Leiterbahn, Pads): C238 = C239 = 2 x (9 - 3)
  = 12 pF C0G. Espressifs eigene Platine setzt etwa 4 pF Streukapazität voraus, was 10 pF verlangen würde; der
  Inbetriebnahmeplan misst die Frequenz und geht auf 10 pF, wenn sie zu niedrig ist.
- **Layout** (HDG 1.4.2): mindestens 4,5 mm von den Takt-Pins, keine Vias in den Leitungen, Lastkondensatoren an den
  fernen Enden, kein Signal unter dem Quarz. Der Quarz ist um 45 Grad gedreht, sodass seine beiden Signal-Pads den Pins
  zugewandt sind und die Leitungen auf beiden Seiten seines Masse-Pads vorbeilaufen; sein Gehäuse steht 4,75 mm vom Rand
  des Chips; Sperrfläche für Leiterbahnen darunter auf jeder Lage; Leitungen auf der Bestückungsseite über In1 mit
  Massefüllung daneben.
- **Leiterbahn:** XTAL_N 6,8 mm, XTAL_P 6,5 mm (etwa 0,3 pF mehr als bei 5 mm, innerhalb der geschätzten 3 pF
  Streukapazität).

### Bestückungsdetails

- **Paste:** freiliegendes Pad des MCU als neun Fenster von 2,1 mm (70 %), 16 Masse-Vias mit 0,3 mm in den Gassen
  dazwischen; das Pad des PHY vier Fenster und fünf Vias; das 4,42-mm-Pad des PN532 acht Fenster von 1,15 mm (54 %) um
  seine vier Vias. Kein anderes Via unter Paste; die Pastenlage der Displayseite ist leer. `test_design.py` prüft die
  Footprint-Bibliothek auf Paste über durchkontaktierten Löchern.
- **Wärmefallen** (0,25 mm breit, 0,2 mm Spalt) an Pads von 0402 und 0603 gegen Tombstoning; größere Bauteile, ICs und
  Vias fest in den Füllungen.
- **LED-Footprint:** KiCads, mit um 0,1 mm kürzeren Pads, sodass sie 0,3 mm Abstand zum gefrästen Fenster von 3,4 x 3,0
  mm mit freigestellten Ecken halten (runde gefräste Ecken, eckiger LED-Körper 3,2 x 2,8 mm, 0,2 mm Umrisstoleranz).
  Kopfüber montiert, sind die Pads das Spiegelbild der Zeichnung. Courtyard 0,1 mm um Pads und Fenster (IPC-7351B,
  geringste Materialdichte) statt KiCads 0,25 mm: Die zwei LEDs an jeder Ecke des Rings stehen rechtwinklig
  zueinander, ihre Courtyards 0,13 mm auseinander.
- **Spulen-Footprints** sind als SMD markiert, damit ein Bestückungsexport nur für SMD sie behält.
- **Bestückungswinkel** von PN532 (Tokmas), Transistor, Widerstandsarrays und Pegelwandler weichen von JLCPCBs
  Bibliothek ab; der Export korrigiert sie. `check-footprints` vergleicht jedes Footprint mit JLCPCBs Bibliothek.
- **Fertigungsdaten** (Fertigungszeichnung, IPC-D-356-Netzliste, Bestückungszeichnung mit jedem Bezeichner, Pin 1 und
  Polarität) liegen in `fab/jlcpcb/`; kleinstes durchkontaktiertes Loch 0,2 mm, nicht durchkontaktiertes 0,6 mm,
  Schlitze 0,8 und 1,0 mm. Bestellen: [Arbeiten an der Platine](hardware/touch-p4/development.md).

### Land Patterns

`check-footprints` vergleicht jedes Footprint mit JLCPCBs Bibliothek. Die kritischen wurden zusätzlich gegen die
Zeichnungen der Hersteller vermessen (Übereinstimmung: innerhalb von 0,05 mm; akzeptabel: Pad bis etwa 0,2 mm länger
oder verschoben, Anschluss bedeckt; Defekt: falsches Raster, falsche Pin-Reihenfolge oder Lochposition).

| Bauteil | Dokument | Land Pattern |
|---|---|---|
| U201 ESP32-P4 (QFN-104, 0,35 mm) | Datenblatt v0.7 Abb. 6-1; Espressifs `ESP32-P4.kicad_mod` (espressif/kicad-libraries, 2025-10-07) | Espressifs Pads 0,20 x 0,65 mm von 4,55 bis 5,20 mm Abstand von der Mitte, auf dem 0,35-mm-Raster (`make_lib.p4_signal_pads`), Lack 0,025 mm. Acht Eckpads enden 0,04 mm früher: 0,163 mm über jede Ecke |
| U105 TPS259470A (RPW, 2 x 2) | TI SLVSFC9C, RPW0010A | TIs Polygone ohne Kontur (`make_lib.custom_pad_strokes`) |
| U301 ESP32-C5-MINI-1 | Datenblatt v1.4 Abb. 11-1, 3-1 | 60 Pads 0,40 x 0,80 mit 0,85 mm Raster, Eckpads, neun Massepads 1,20 mm mit 1,65 mm Raster, Antennengrenze: alles innerhalb von 0,05 mm. Die Pin-1-Markierung ist ein quadratisches Pad, nicht die Fase der Zeichnung |
| J101 USB-C TYPE-C-31-M-12 | HRO-Zeichnung 2020-12-08 | Übereinstimmung; Leistungs-Pads 0,6 x 1,3 mm (`make_lib.usb_c_power_pads`) für 0,20 mm VBUS-GND wie gezeichnet. Pads 0,19 mm weiter hinten und Schirmschlitze 0,2 mm breiter: akzeptabel |
| J103 WAGO 250-202 / 2601-3102 | WAGO-Datenblätter | Übereinstimmung, Pin 1 vorn rechts; die Löcher mit 1,2 mm passen zur 2601 und liegen 0,1 mm über dem Maximum der 250: Lochfüllung an den ersten Platinen prüfen |
| J102 PJ-002A, J401 HY931147C | Same Sky Rev. 1.05; HanRun REV.A/1 | Übereinstimmung (J401 innerhalb von 0,005 mm; LED-Löcher 1,10 gegen 1,02) |
| J601 FH12-40S-0.5SH(55) | Hirose-FH12-Katalog | Übereinstimmung; Kupfer 0,30 mm, Paste 0,25 mm (`make_lib.fpc_signal_pads`) |
| U102 DP9900M / Ag9905M | SDAPO 4.1; Silvertel Ag9900 V3.5 Abb. 3, 19, 23 | 1,25 x 4,0 mm mit 2,54 mm Raster, innerhalb von 0,03 mm bei beiden; Silvertels 3-mm-Sperrband auf jeder Lage kupferfrei. Nur Ag9905-M und -MT passen |
| U501 PN532 (QFN-40) | Tokmas-Datenblatt; NXP SOT618-1 | Pads 0,24 mm über den Körper hinaus (NXP 0,50, IPC 0,30): akzeptabel |
| U401 IP101GRI (QFN-32) | IC Plus R01; IPC-7351B | Ferse 0,10 mm zu kurz, Exposed Pad 2,80 gegen 2,70: akzeptabel |
| L102 CKCSA4020-6.8uH | CENKER-Datenblatt | Anschlüsse bedeckt; Winkel 0/180. Kein JLCPCB-Footprint: in der Bestückungsvorschau prüfen |

### Bestückungsdruck

Für die Person, die den Leser offen vor sich hat (`scripts/bootstrap/silk.py`). Text 1,0 mm hoch, 0,15-mm-Linien; der
Build bricht ab, wenn ein Text auf einem Pad, auf einem anderen Text oder innerhalb von 0,3 mm vom Platinenrand liegt.

- **Bezeichner** überall, wo einer neben sein Bauteil passt (`silk_refdes.py`): jeder IC, Quarz, Transistor,
  Steckverbinder und Taster, jede Spule, Ferritperle, Diode und Sicherung, jedes Array und der Summer (23 mit
  Hinweislinie; ein Test schlägt fehl, wenn einer fehlt). 114 kleine Passive um MCU, PHY und NFC-Chip tragen keinen; die
  Bestückungszeichnung zeigt sie.
- **Testpads** TP816 bis TP832 tragen den Kurznamen des Netzes (`VDC`, `5V_DC`, `5V_USB`, `5V_POE`, `VDD_FLASH`, `TVDD`,
  `AVDD`, `DVDD`, `BL_A`, `SDA`, `SCL`, `NFC_SDA`, `NFC_SCL`, `REF_CLK`, `PHY_3V3`, `3V3_WIFI`, `GND`;
  `silk.test_point_labels`); ältere stehen in beschrifteten Gruppen (C5, P4 UART0, Versorgung).
- **Bestückungsseite:** Testpunktgruppen, wie man in den Download-Modus kommt, Grenzwerte der Steckverbinder, die
  Begrenzung der 48-V-Seite, die LED-Nummern, wie die Firmware sie zählt, und ein weißes Feld von 10 x 2 mm neben `S/N`
  für die Seriennummer, die JLCPCB auf jede Platine einzeln druckt. Hinter der NFC-Schleife: Logo, Name und Revision der
  Platine, eine kurze GPIO-Karte (aus `circuit_core.P4_GPIO`, sodass sie nicht abweichen kann) und wo die Dokumente
  liegen.
- **Displayseite:** die Montagehinweise für das Display (Massepads, zu kürzende Buchsenpins, welche davon 48 V führen),
  LED-Nummern, das Schlüsselloch am Tap-Punkt und ein Hinweis für alle, die das Display abnehmen.
- Das Logo stammt aus `case/logo/`; das Maskottchen wird nicht verwendet (die Markenregeln wollen es in seinen
  natürlichen Farben).
