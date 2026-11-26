# Bekannte Einschränkungen
<!-- llms-description: Wo die Touch-P4-Platine ihre Designziele bewusst nicht ganz erreicht, warum, was die Lücke abdeckt und welche Punkte erst eine aufgebaute Platine klären kann. -->

Die Ziele, die die Platine nicht vollständig erfüllt, und die Fragen, die keine Zeichnung und kein Modell
beantworten kann, für Hardware-Entwickler, die die Inbetriebnahme oder Revision B planen. Die Ziele selbst
stehen unter [Designstandards und Review-Kriterien](hardware/touch-p4/review.md); das Design steht unter
[Design](hardware/touch-p4/design-notes.md).

Grundsatz: Ein Ziel, das nicht machbar ist oder mehr kostet, als es wert ist, wird zu einer dokumentierten
Abweichung; ohne neuen Grund wird es nicht wieder aufgerollt.

## Akzeptierte Abweichungen

### Abblockung am MCU (Review-Punkt 5.3)

- **Ziel.** Ein Kondensator innerhalb von 3 mm Kupfer an jedem Versorgungspin von Core, Speicher, Regler,
  Analogteil, USB-PHY und Batterie, innerhalb von 5 mm für die 3,3-V-IO-Pins; 10 uF nahe VDD_LDO und
  VDD_DCDCC.
- **Erreicht.** 4 der 21 Pins: VDD_DCDCC 2,0 mm (mit seinen 10 uF), VDD_HP_3 1,4 mm, VDD_IO_6 1,3 mm,
  VDDO_3 3,5 mm. Die anderen 3,3 bis 13,7 mm; VDD_LDO hat seine 10 uF bei 5,8 mm
  ([Tabelle](hardware/touch-p4/design-notes.md)).
- **Warum.** 21 Versorgungspins mit 0,35 mm Raster. Nur jeder zweite Pin kann ein Via innerhalb der
  Pad-Reihe haben, pro 1,05 mm Reihe passt ein Kondensator, und die Signale brauchen diesen Platz, um
  herauszukommen. 0201-Bauteile auf der Bestückungsseite ändern nichts (die Reihe ist die Grenze, und 0201
  ist bei JLCPCB ein Extended Part). 0201-Bauteile auf der Rückseite bräuchten eine zweite Bestückungsseite
  (etwa 34 USD mehr pro Bestellung) und lägen 1,5 mm vor der Metallrückseite des Displays; die Platine
  bleibt einseitig.
- **Abhilfe.** Jeder Pin hat ein Via innerhalb der Pad-Reihe in die 3,3-V-Fläche oder die Kupferfläche der
  Core-Schiene. Simuliert fügt die Platine 1,1 bis 2,4 nH hinzu, etwa so viel, wie das Gehäuse des Chips
  selbst beiträgt. Die Inbetriebnahme führt eine Stunde lang einen CPU- und PSRAM-Stresstest mit vollem
  Takt aus, kalt und warm im Gehäuse, mit den Versorgungen am Oszilloskop.
- **Revision B.** 0201-Kondensatoren auf der Rückseite, jeder auf dem Via seines Pins (etwa 2,3 mm pro
  Pin), mit Polyimidfolie zum Display hin; oder der P4 in einem Modul.

### Länge der Quarzleiterbahn (Review-Punkt 5.5)

- **Ziel.** Höchstens etwa 5 mm Leiterbahn von jedem Quarzpin zum Quarz.
- **Erreicht.** XTAL_N 6,8 mm, XTAL_P 6,5 mm, mit einem 2,0 x 1,6 mm großen Quarz und ohne Brücken in den
  Leitungen.
- **Warum.** Espressif verlangt mindestens 4,5 mm zwischen Quarz und Takt-Pins, was den größten Teil der
  5 mm nimmt. Der Platz ist festgelegt zwischen den Vias der NFC-Leitungen darüber und den
  VDD_BAT-Bauteilen darunter, und die Signal-Pads des Quarzes liegen auf einer Diagonale, sodass jede
  Leitung am Masse-Pad vorbeiläuft.
- **Abhilfe.** Keine Vias, Massefüllung auf beiden Seiten, ungeteilte Masse darunter, keine Leiterbahn
  unter dem Quarz auf irgendeiner Lage. Die zusätzliche Länge fügt etwa 0,3 pF hinzu, innerhalb der 3 pF
  Streukapazität, die die Lastkondensatoren annehmen. Die Inbetriebnahme misst die Frequenz; weicht sie
  ab, werden die Lastkondensatoren geändert.
- **Revision B.** Die NFC-Vias nach links und den Quarz bis auf 5 mm nach oben verschieben, mit neuer
  Verlegung dieser Ecke.

### Strom aus einer reinen USB-Versorgung (Review-Punkt 2.4)

- **Ziel.** Den Strom lesen, den die USB-C-Quelle anbietet (CC-Pegel), und die Platine darauf begrenzen.
- **Erreicht.** Eine feste Grenze: Fehlen DC und PoE, hält die Firmware die Platine innerhalb von 500 mA,
  dem Kleinsten, das irgendeine Quelle anbietet (geschätzt 0,45 A: LEDs und Summer aus,
  Hintergrundbeleuchtung bei höchstens 30 %).
- **Warum.** Die freien ADC-Pins liegen auf der anderen Seite des MCU; es blieb kein Weg zum
  USB-C-Steckverbinder, ohne das USB-Paar, die Hintergrundbeleuchtungsleitung oder den RMII-Bus neu zu
  verlegen.
- **Abhilfe.** Eine harte Firmware-Anforderung mit einem Inbetriebnahmetest
  ([Pinbelegung und Firmware-Portierung](hardware/touch-p4/firmware-port.md)). Ohne Firmware begrenzt die
  eFuse den Strom auf 1,8 bis 2,2 A, und eine Quelle, die ihn nicht liefern kann, schützt sich selbst.
- **Revision B.** CC1/CC2 an zwei ADC-Pins, sodass eine Quelle mit 1,5 A oder 3 A die Platine mit voller
  Helligkeit betreibt.

### Merkmale an den Grenzen von JLCPCB (Review-Punkt 6.2)

- **Ziel.** Nichts an der Grenze der Fertigung, es sei denn, der Raster eines Bauteils erzwingt es.
- **Erreicht.** Fünf Merkmale an der Grenze, keines darunter: Pad-Lücke und Lötstoppsteg am MCU mit
  0,35 mm Raster und am LGA des Beschleunigungssensors; Linienbreite, Texthöhe und Abstand zu Pads beim
  Bestückungsdruck.
- **Warum.** Espressifs Land Pattern für den P4 legt Pad-Lücke und Steg fest; der Bestückungsdruck liegt an
  JLCPCBs Minimum, damit die Bezeichner überhaupt passen.
- **Abhilfe.** Grüner Lötstopplack (die einzige Farbe mit einem Steg von 0,10 mm); AOI und Röntgen der
  Bestückung suchen am MCU nach Brücken; die ersten Platinen werden geprüft.
- **Revision B.** Nichts, es sei denn, die ersten Platinen zeigen Brücken.

### Platzierung der WLAN-Antenne (Review-Punkt 9.3)

- **Ziel.** Espressifs Platzierung für eine Leiterplattenantenne (ESP32-C5 HDG 1.4.7, Abbildungen 22 und
  23): Antenne über den Platinenrand hinaus oder über einem Ausschnitt auf beiden Seiten und darunter, mit
  mindestens 15 mm auf der Seite des offenen Endes; Massepunkt innerhalb von 1 mm von einer Platinenkante
  an einer rechten Ecke; 15 mm freier Raum rund um die Antenne im Gehäuse.
- **Erreicht.** Modul an der oberen Kante, oben links; Antenne über einem 6,0 mm tiefen Ausschnitt von
  x 8,6 bis 37,5 (11,5 mm hinter dem offenen Ende, 2 mm hinter dem Massepunkt), kein Kupfer auf irgendeiner
  Lage innerhalb von 15 mm daneben. Massepunkt 51 mm vom rechten Rand. 1,8 mm zur oberen Wand des
  Gehäuses, 4,7 mm zu seiner Vorderwand. Vollwellenmodell im Gehäuse mit dem Display: -3,0 / -3,5 /
  -4,1 dB der eingespeisten Leistung bei 2,4 GHz (Kanäle 1, 7, 13) und -3,8 / -2,5 / -4,0 dB bei 5,18 /
  5,50 / 5,70 GHz, gegenüber -1,1 / -1,1 / -1,2 und -9,3 / -5,0 / -3,2 dB an Espressifs Position 3:
  innerhalb von 3 dB in jedem Kanal.
- **Warum.** Position 3 ist die obere rechte Ecke, wo USB-C, sein eFuse-Pfad, sein ESD-Bauteil und ein
  Montageloch sitzen und das impedanzkontrollierte USB-Paar beginnt; sie zu verschieben, verlegt das Paar
  neu und verschiebt den Schraubdom des Gehäuses. Über den Rand hinaus bräuchte die Antenne ein um 7 mm
  höheres Gehäuse. 15 mm Abstand passen nicht bei 1,5 mm zu den Wänden. Das obere linke Montageloch stoppt
  den Ausschnitt bei 11,5 mm.
- **Abhilfe.** Der Ausschnitt, die Sperrfläche auf allen Lagen, Masse-Vias unter dem Modul, eine
  nichtmetallische Front über der Antenne (eine Frontplatte aus Aluminium nur mit einem Fenster über x 0
  bis 50,5; ohne dieses 1,5 bis 1,9 dB weniger bei 2,4 GHz). Das Zertifikat des Moduls deckt seine Antenne
  ab; die Strahlungstests des Lesers werden in seinem Gehäuse gemacht
  ([CE- und Marktcheckliste](hardware/touch-p4/compliance.md)). Die Inbetriebnahme misst die Reichweite auf
  beiden Bändern gegenüber einem Leser im Einsatz.
- **Revision B.** Modul in der oberen rechten Ecke, mit USB-C nach unten an der rechten Kante oder an der
  oberen Kante links vom Modul, oder ein Gehäuse mit Platz für die Antenne über den Rand hinaus.

### SDIO-Leiterbahnen zum WLAN-Modul (Review-Punkt 5.2)

- **Ziel.** Espressifs SDIO-Layout-Regeln (C5 HDG 1.4.9): Befehl und Daten innerhalb von 1,27 mm der Länge
  des Takts, höchstens 50,8 mm, 50 Ohm +-10 %, „Ensure that SDIO traces do not cross layers“, ungeteilte
  Bezugsfläche, Masse rund um den Takt.
- **Erreicht.** Alle bis auf die Lagenregel: sechs Leitungen je 40,3 mm, gleich auf 0,01 mm genau, 0,15 mm
  auf der Rückseitenlage über In4 (49 Ohm), Takt mit Massefüllung auf beiden Seiten. Jede Leitung wechselt
  zweimal die Lage (neben dem MCU und unter dem Modul), bei allen sechs gleich, mit einem Masse-Via
  innerhalb von 0,7 bis 1,7 mm von jedem Signal-Via.
- **Warum.** Die Pads beider Chips liegen auf der Vorderlage, und die Vorderlage zwischen ihnen ist vom
  Core-Wandler (U202, L201 und Kondensatoren) und von den 5-V- und Core-Versorgungsleiterbahnen belegt, die
  sie kreuzen. Den Wandler zu verschieben, würde die Abblockwege des MCU-Core verlängern (Punkt 5.3).
- **Abhilfe.** Beide Lagenwechsel liegen zwischen zwei Masseflächen (In1, In4) mit einem Masse-Via in der
  Nähe; gleiche Via-Zahlen halten die Laufzeiten gleich. Simuliert: Takt und Daten innerhalb von 0,18 ns;
  Takt hinaus und Daten zurück 1,01 ns, was dem P4 bei 50 MHz 5,0 ns lässt und bei 40 MHz 10,0 ns. Die
  Inbetriebnahme führt den Raw-Durchsatztest von esp-hosted bei 40 und 50 MHz aus und zählt CRC-Fehler und
  Zeitüberschreitungen, bevor irgendetwas anderes die Verbindung nutzt.
- **Revision B.** Modul neben den Slot-0-Pins des P4, mit dem Core-Wandler auf der anderen Seite des P4,
  für einen Bus auf der Vorderlage.

### ESD an den LED-Fenstern, am Summer und an den Verschlussschrauben (Review-Punkt 9.1)

- **Ziel.** Jeder Anschluss und jede Fläche erreicht den Prüfpegel (4 kV Kontakt, 8 kV Luft, Kriterium B),
  gezeigt durch die Bemessung des schützenden Bauteils.
- **Erreicht.** Jeder Kabelanschluss, die Kanten und das Flexkabel des Displays, der NFC-Bereich und das
  Glas. Nicht gezeigt: die LED-Fenster (die SK6812MINI-E ist mit 2 kV HBM bemessen, ein Handhabungswert),
  die Summerlöcher (keine Bemessung für Summer oder FET) und die zwei schwebenden Verschlussschrauben.
- **Warum.** Eine Diode an jeder der acht LEDs, am Summer und an den Schrauben ist nicht praktikabel; was
  hier entscheidet, ist der Luft- und Kriechweg durch das Gehäuse, den kein Datenblatt angibt.
- **Abhilfe.** ESD-Vortest an den ersten Lesern vor dem Labor: 8 kV Luft an jedem LED-Fenster, den
  Summerlöchern, den Fugen und den Glaskanten, 4 kV Kontakt an den Verschlussschrauben.
- **Revision B**, falls der Vortest fehlschlägt: Diffusoren mit einem Flansch, der die Fuge schließt,
  gegenüber dem Anschluss versetzte Summerlöcher, Verschlussschrauben aus Nylon.

### Bezeichner der kleinen Passivbauteile (Review-Punkt 7.6)

- **Ziel.** Jeder Bezeichner auf dem Bestückungsdruck; wo einige nicht passen, deckt die
  Bestückungszeichnung sie ab.
- **Erreicht.** Jeder IC, Quarz, jede Induktivität, Perle, Diode, jeder Transistor, Steckverbinder,
  Schalter, jede Sicherung, jedes Array und der Summer hat einen (ein Test schlägt fehl, wenn einer fehlt).
  114 0402/0603-Passivbauteile um den MCU, den PHY und den NFC-Chip haben keinen.
- **Warum.** Bei 1,0 mm Text, JLCPCBs Minimum, ist kein Platz, ohne Pads zu überdecken.
- **Abhilfe.** `fab/jlcpcb/attractap-touch-p4-assembly.pdf` zeigt jeden Bezeichner, mit vergrößerten
  Seiten dieser Bereiche.
- **Revision B.** Keine geplant.

## Offene Punkte

Was nur eine aufgebaute Platine klären kann. Jeder Punkt ist ein Schritt im
[Inbetriebnahmeplan](hardware/touch-p4/bring-up.md).

| Offener Punkt | Was bekannt ist | Wie die Inbetriebnahme ihn klärt |
|---|---|---|
| Display-Flexkabel gegen die Pins der Buchse | Das Flexkabel erlaubt höchstens 2,0 mm von der Platine zum LCD (Zeichnung, +-0,4 mm); die Pins brauchen Platz (mindestens 1,45 mm lang). Bei 1,5 mm mit gekürzten Pins hat jede Seite 0,5 mm. Eine zweite Zeichnung zeigt ein um 0,8 mm kürzeres Flexkabel; andere Hersteller können abweichen. Ein zu kurzes Flexkabel lässt sich nicht reparieren | Vor dem Bestellen: das Panel, das Sie kaufen werden, mit einem 1,5-mm-Abstandshalter auf einen 1:1-Ausdruck legen und die Pins einer echten Buchse messen. Ausweg, wenn es nicht reicht: die Buchse unterhalb des Displays (Commit 74add084d) mit einem um 19 mm längeren Gehäuse |
| Stabilität des MCU mit der Abblockung, wie verlegt | Siehe die Abweichung oben; erster Verdächtiger, wenn der MCU bei vollem Takt instabil läuft | CPU- und PSRAM-Stresstest, eine Stunde, kalt und warm, Versorgungen am Oszilloskop |
| Quarzfrequenz | Lastkondensatoren 12 pF für geschätzte 3 pF Streukapazität; Espressifs Platine legt 4 pF nahe (10-pF-Kondensatoren) | Die Frequenz messen; auf 10 pF wechseln, wenn sie zu niedrig ist |
| NFC-Schleife, Abstimmung und Reichweite | Schleife simuliert, nicht gemessen: 1,25 uH auf der Platine, 1,20 uH auf Metall. Jede Platine bleibt innerhalb der Grenze des Senders für 1,12 bis 1,25 uH, 99 von 100 für 1,08 bis 1,27 uH. Das Feld versorgt eine Karte bis 19 mm vor dem Gehäuse (15 mm auf Metall); ob der Leser die Karte hört, ist nicht modelliert. Stecker und Kabel der Version lan liegen 8 mm von der Schleife | Die Schleife messen, bevor das Feld eingeschaltet wird, dann den Senderstrom; mit einem Netzwerkanalysator bei montiertem Display abstimmen; die Version lan mit eingestecktem Kabel abstimmen; die Lesereichweite mit den verwendeten Karten prüfen |
| PN532 aus zweiter Quelle | Das Datenblatt des Tokmas PN5321A3HN sagt nichts über seine Firmware; mit unserer nicht erprobt. Das NXP-Original passt auf dieselben Pads | Die ersten Platinen betreiben den NFC-Stack damit |
| WLAN-Reichweite | Das Antennenmodell ist ein Platzhalter gleicher Größe und Art, nicht Espressifs Antenne | Reichweite auf beiden Bändern gegenüber einem Leser im Einsatz, im Gehäuse an der Wand |
| esp-hosted-Verbindung | Zwei ungeklärte Berichte von eigenen Platinen (Zeitüberschreitungen, CRC-Fehler, auf zu knappes Timing zurückgeführt); unbekannt, ob sich die SDIO-Einheit des C5 wie die des C6 verhält | Raw-Durchsatz und Fehlerzahl bei 40 und 50 MHz, bevor irgendetwas anderes die Verbindung nutzt |
| PoE-Isolation | Das Kupfer hält die 3-mm-Regel ein; was in den Bauteilen und in der Baugruppe liegt, ist ungeprüft: das Modul, C102 und das Klebeband zwischen Pin 9 der Buchse und dem Display | Isolationsprüfung an einer bestückten Einheit vor dem Labor; das Labor fragen, ob es sie prüft |
| Wärme | Schätzung ±40 %; im typischen Betrieb innerhalb der Grenzen, wenig Reserve an PoE bei 40 °C (Display 63 °C von 70, Luft am WLAN-Modul bis 75 °C von 85) | Geschlossenes Gehäuse an der Wand, nach einer Stunde, einschließlich der Luft neben dem WLAN-Modul. Ist es wärmer, nimmt die Firmware LEDs und Hintergrundbeleuchtung zurück |
| Manipulationssensoren | Der Wert des Näherungssensors hängt von der Farbe des Docks ab; Infrarot durch den weißen Kunststoff; Hall-Schalter auf dem Dock an, aus nach 9 bis 33 mm Anheben (simuliert) | Werte auf dem Dock und abseits davon mit den verwendeten Dockfarben, mit Licht auf dem Gehäuse; Schaltabstände des Hall-Schalters; ob der Magnet den Klang des Summers verändert; Schwellen des Beschleunigungssensors, die ein Klopfen von einer schließenden Tür unterscheiden |
| Hot-Plug eines 24-V-Netzteils | Simuliert: Eingang des Wandlers höchstens 31 V bei 24 V (34,7 V bei 26,4 V), Grenze 40 V | An der ersten Platine messen, mit einigen Metern dickem Draht zu einem steifen Netzteil |
| Surge-Pegel | Die Surge-Pegel der EN 50130-4:2011 für DC-Leitungen noch nicht in der gekauften Norm gelesen | Vor dem Labor lesen ([CE- und Marktcheckliste](hardware/touch-p4/compliance.md)) |
| USB-Port an einem warmen Leser, der aus einer anderen Quelle läuft | R104 hält VBUS des nicht angesteckten Ports nahe 0 V gegen den typischen Leckstrom der eFuse | Am warmen Leser prüfen, dass ein USB-C-Host seine Versorgung weiterhin einschaltet |
| Stabilität der 3,3-V-Wandler | Die Schiene von U103 mit 44,5 uF und die von U302 mit 47,2 uF effektiv, gegen TIs 52,8 uF; Durchtrittsfrequenz der Regelschleife nicht veröffentlicht | Laststoß 0,1 bis 1 A mit und ohne C108 |
| Annahmen des Leistungsbudgets | 60 mA für die 3,3-V-Versorgung des Panels angenommen; LEDs zusammen unter 100 mA und Summer nur bei ausgeschaltetem NFC-Feld sind Firmware-Regeln | Den Strom des Panels messen; beide Firmware-Grenzen und den reinen USB-Modus prüfen |
| Löcher der DC-Klemme | 1,2-mm-Löcher liegen 0,1 mm über dem Maximum der WAGO 250 | Die Lochfüllung an den ersten Platinen prüfen |
| Ethernet-Quarz in der Kälte | 25-MHz-Quarz bis 50 Ohm ESR bemessen, der PHY verlangt 40 Ohm; typische Teile liegen weit darunter | Nur wenn der Ethernet-Takt kalt nicht anläuft: zuerst hier nachsehen |
