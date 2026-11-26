# Simulationen der Touch-P4-Platine
<!-- llms-description: Die Feld- und Schaltungssimulationen auf der gerouteten Touch-P4-Platine, was sie modellieren und wo ihre Grenzen liegen. -->

Feld- und Schaltungssimulationen der gerouteten Platine, in [`sim/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/sim) im Projektordner der Platine. Sie lesen das Kupfer aus
der Platinendatei und die Bauteilwerte aus der Schaltungsbeschreibung
(`scripts/bootstrap/`), folgen also dem Design: Ändern Sie einen Wert oder das
Layout und führen Sie sie erneut aus.

```bash
pnpm nx run attractap-touch-p4-pcb:simulate     # part of the check target
```

Der Bericht geht an das Terminal und nach `fab/reports/simulation.txt`. Jede mit `ok`
oder `FAIL` markierte Zeile vergleicht ein Ergebnis mit einer Grenze aus einem Datenblatt; das
Ziel schlägt fehl, wenn eine verfehlt wird. Welche Ergebnisse Revision A hatte und was
sie verändert haben, steht in den [Designnotizen](hardware/touch-p4/design-notes.md#simulation).

Benötigt KiCad 10 mit seinem Python (numpy ist das einzige verwendete Paket) und
[ngspice](https://ngspice.sourceforge.io/). `tools/pcb.sh` nimmt ngspice aus
`NGSPICE`, dem PATH oder nixpkgs.

## Was simuliert wird

| Teil des Berichts | Dateien | Modell | Geprüfte Grenzen |
|---|---|---|---|
| Feldlöser | `test_solvers.py` | Beide Löser gegen Ergebnisse, die in geschlossener Form bekannt sind: eine Leiterbahnschleife, dieselbe in einem kurzgeschlossenen Ring und über einer Kupferplatte, eine Streifenleitung. | innerhalb von 2 bis 4 % |
| NFC-Schleife | `nfc_loop.py`, `peec.py` | Induktivität und Widerstand der Schleife bei 13,56 MHz aus dem Antennen-Footprint, mit den Wirbelströmen in den Kupferflächen um sie herum (alle Lagen, als eine Fläche vermascht). Auch mit einer Metallwand hinter dem Leser und mit Metall quer über der Lücke im Kupfer um die Schleife. | kein Kupfer auf den Außenlagen unter der Schraube, die in dieser Lücke steht |
| NFC-Feld | `nfc_loop.py`, `peec.py` | Feldstärke vor dem Leser, aus dem Strom der Schleife und den Wirbelströmen, die sie erzeugt, gemittelt über die 72 x 42 mm einer parallel zum Leser gehaltenen Karte: für eine Karte, die auf dem Gehäuse liegt, und von dort nach außen, an einer Wand aus Holz oder Stein und an einer aus Metall. | höchstens 7,5 A/m an einer Karte auf dem Gehäuse; 1,5 A/m (was eine Karte nach ISO/IEC 14443 braucht) mindestens 10 mm vor dem Gehäuse |
| NFC-Anpassung | `nfc_match.py`, `nfc_tx.cir` | Last zwischen TX1 und TX2, Versorgungsstrom des Senders, Spannung am Empfängereingang und Schleifenstrom, für die Schleife an einer Wand aus Holz oder Stein und an einer aus Metall. 20 000 Platinen mit Kondensatoren und Filterinduktivitäten, gleichmäßig über 5 % gestreut, Treiberwiderstand 2 bis 5 Ohm, Senderversorgung 2,7 bis 3,4 V. Ein Lauf im Zeitbereich mit der Rechteckwelle der Brücke. | Sender 100 mA (150 mA Grenzwert), Empfängereingang 4 Vss, Dämpfungswiderstände 0,1 W |
| DC-Eingang | `dc_hotplug.cir` | Ein Netzteil unter Spannung, über vier Kabel eingesteckt: Kabelinduktivität, Sicherung, die drei Keramikkondensatoren mit ihrem Kapazitätsverlust über der Spannung, Filterinduktivität, TVS am oberen Ende ihres Durchbruchbereichs. | Wandlereingang 40 V bei 24 V Versorgung |
| DC-Stoß | `dc_surge.cir` | Ein 1,2/50-us-Stoß von +-1 kV hinter 42 Ohm (EN 50130-4, Leitung gegen Erde), angelegt über den DC-Eingang, während die Platine mit 12 bis 28 V läuft: beide TVS am oberen Ende ihres Durchbruchbereichs, C120 mit niedrigem und hohem ESR, L103 ungesättigt und gesättigt. | Wandlereingang 40 V; D105 80 V Sperrspannung |
| Einschalten | `powerup.cir` | USB eingesteckt: Kabel, Sicherung, Ferrit, Diode, die Kondensatoren der 5-V-Schiene, der 3,3-V-Wandler mit Unterspannungssperre und Softstart, das Reset-Netzwerk. Verhaltensmodell des Wandlers. | Reset low, bis die Schiene 50 us lang oben war; 5-V-Schiene im Betrieb über 3,8 V |
| Schnelle Leitungen | `field2d.py`, `si.py` | Impedanz und Laufzeit einer Leiterbahn auf jeder Signallage aus einer 2D-Feldlösung des Lagenaufbaus. Dann jede schnelle Leitung als Übertragungsleitung mit ihren gerouteten Längen und ihrem Serienwiderstand, getrieben von einer 1-ns-Flanke hinter 33 Ohm (die Standard-Treiberstärke des MCU) und 17 Ohm (die stärkste), in eine Kapazität. | Überschwingen 0,5 V und kein Zurückschwingen unter 80 % bei der Standardstärke |
| WLAN-Strecke | `si.py` | Was die Platine zum Timing der SDIO-Strecke zwischen MCU und WLAN-Modul beiträgt: Laufzeit des Takts und jeder Datenleitung, der Unterschied zwischen ihnen, die Umlaufzeit. Die Pull-ups, die Espressif verlangt, und der Reset-Impuls über R302 in C303. | Takt und Daten innerhalb 0,5 ns, Umlaufzeit 2 ns, ein Pull-up von 10 bis 90 k an CMD und D0 bis D3, Reset low für 50 us |
| Versorgungsleiterbahnen | `irdrop.py` | Jedes als Leiterbahnen geroutete Versorgungsnetz als Netzwerk aus Leiterbahn- und Via-Widerständen, bei gleichzeitig eingeschalteten Lasten. | 0,2 V Verlust; Außenbahnen unter dem Strom für 20 K Erwärmung (IPC-2221) |
| Versorgungsimpedanz | `pdn.py` | Konzentriertes Modell der Kern- und 3,3-V-Schienen des MCU: jeder Kondensator mit seiner eigenen Induktivität und der seines Wegs zu den Pins, aus den Abständen auf der Platine. | keine: nur Bericht |
| PoE-Isolation | `isolation.py` | Das Kupfer jeder Lage um die 48-V-Seite in ein Raster von 0,05 mm gezeichnet. Kürzester Weg von 48-V-Kupfer zu jedem anderen Kupfer entlang jeder Lage und durch die Platine von jeder Lage zu jeder anderen. Die Pads der drei Bauteile, die die Barriere konstruktionsbedingt überbrücken (Modul, Kondensator, Buchse), bleiben ausgenommen. | Luftstrecke für den Spitzenwert der 1500-V-Effektivwert-Prüfung, mit einem Fünftel Reserve (IEC 60664-1); kein Weg durch die Platine kürzer als entlang einer Lage |
| Wärme | `thermal.py` | Die Platine als Platte aus 1-mm-Zellen, die Wärme durch ihr Kupfer verteilt (Bedeckung jeder Lage aus den gefüllten Kupferflächen) und sie über beide Flächen abgibt, nach Lehrbuchwerten für ruhige Luft: zum Display und nach vorn hinaus, zur Dock-Platte und zur Wand. Die Verlustleistung jedes Bauteils dort, wo das Bauteil sitzt; die des PoE-Moduls und des Displays in die Luft im Inneren. Typischer Betrieb und alles eingeschaltet, für jede der drei Versorgungen. Eine Abschätzung innerhalb von 40 %. | typischer Betrieb in einem Raum mit 40 °C: jedes Bauteil innerhalb seiner Grenze, Display unter 70 °C, die DC-Sicherung hält das 1,5-Fache ihres Stroms, die Platine unter dem WLAN-Modul (die obere Grenze der Luft um es herum) unter den 85 °C des Moduls |
| Dock-Magnet | `dock.py` | Feld des Dock-Magneten am Hall-Schalter: auf dem Dock, außerhalb seiner Achse, mit dem schwächsten Magneten und warm, und während der Leser abgehoben wird. | das Doppelte der höchsten Schwelle des Schalters auf dem Dock |

Die WLAN-Antenne hat eine eigene Simulation, die nicht Teil von `simulate` ist: siehe unten.

`dump_board.py` schreibt die Platine als JSON (es ist das einzige Skript, das
KiCad braucht), `board.py` liest sie, `spice.py` führt ngspice aus, `run.py` führt alles aus.

## Die WLAN-Antenne

```bash
pnpm nx run attractap-touch-p4-pcb:simulate-antenna      # about three quarters of an hour
```

`wifi_antenna.py` ist ein Vollwellenmodell (FDTD, [openEMS](https://www.openems.de/)) der Platinenantenne des
WLAN-Moduls (ESP32-C5-MINI-1) auf dieser Platine, bei 2,4 und 5 GHz, jedes Band mit einem eigenen Puls. Die
Antenne des Moduls ist eine Dual-Band-Antenne in gedruckter Form, gespeist über einen Diplexer, und ihre genaue Form ist nicht
veröffentlicht. Das Modell verwendet daher einen Ersatz gleicher Größe und Art, eine invertierte F-Antenne mit einem langen Arm für
2,4 GHz und einem kurzen Zweig für 5 GHz, Massepunkt rechts, wie Espressif sie zeichnet; stimmt ihn auf einer kleinen
Evaluierungsplatine auf etwa 2,44 und 5,5 GHz ab; und setzt ihn dann unverändert auf diese Platine:

| Fall | Was im Modell ist |
|---|---|
| `reference` | das Modul am Rand einer Evaluierungsplatine von 40 x 55 mm, seine Antenne über den Rand hinaus |
| `board` | diese Platine am Platz des Moduls (`geometry.WIFI_MODULE`): ihre Masse, der Ausschnitt unter der Antenne, die Kupfer-Sperrfläche daneben |
| `display` | dasselbe mit der Metallrückseite des Displays 1,5 mm von der Platine, auf seinen vier Massepads |
| `in_case` | `display` im gedruckten Gehäuse: Front-, Ober- und Seitenwände, Dock-Platte |
| `metal_wall` | `in_case` mit einer Metallwand 16,4 mm hinter der Bestückungsseite |
| `faceplate` | `in_case` mit einer 0,8 mm dicken Aluminium-Frontplatte über der Vorderseite (ein Fenster für das Display) |
| `faceplate_window` | dasselbe mit dem Streifen über dem Display, der über der Antenne und ihrer Sperrfläche offen bleibt |
| `p3_board`, `p3_in_case`, `p3_metal_wall` | das Modul an Espressifs empfohlenem Platz, der oberen rechten Ecke der Platine mit der Antenne über den Rand hinaus (HDG 1.4.7, Abb. 22 Position 3, Abb. 23), das Gehäuse so vergrößert, dass die Antenne dieselben Abstände zu seinen Wänden behält |

Es gibt je Fall und Band die Resonanz, die Anpassung und die Bandbreite aus, und für drei Kanäle, wie viel
der eingespeisten Leistung abgestrahlt wird (und, in Klammern, der Leistung, die die Antenne aufnimmt) und wie viel davon
zur Seite des Displays geht, wo der Raum ist. Was sich von Fall zu Fall ändert, ist das Ergebnis; die absoluten
Werte gehören zum Ersatz. Das Ziel ist nicht Teil von `simulate` oder `check`: Es braucht ein Python mit
openEMS (`OPENEMS_PYTHON`; Debian und Ubuntu haben es als `python3-openems`) und hängt nicht vom
gerouteten Kupfer ab, nur von `geometry.py` und den Maßen am Anfang des Skripts.

## Was die Modelle auslassen

- **Die Chips sind einfach.** Kein Hersteller veröffentlicht ein IBIS- oder SPICE-Modell für
  den ESP32-P4, den PN532 oder die Wandler. Treiber sind eine Rampe hinter einem
  Widerstand, Empfänger eine Kapazität, Wandler folgen der Unterspannungssperre und dem
  Softstart ihres Datenblatts. Die Werte sind die typischen der Datenblätter.
- **Die Eigenkapazität der NFC-Schleife** (2,4 pF) ist eine Abschätzung, und jedes
  Pikofarad zählt wie 1 % Induktivität. Die DC-Buchse, der Ethernet-Stecker
  und das Kabel, eine Karte oder ein Telefon im Feld sind nicht im Modell; alle
  senken die Induktivität.
- **Wärme** ist eine Abschätzung: Die Oberflächenwerte sind Lehrbuchwerte für ruhige
  Luft, die Verlustleistungen der Bauteile sind ebenfalls Abschätzungen, und ein Leser in der Sonne oder
  über einer Heizung ist kein Raum mit 40 °C.
- **NFC-Reichweite** ist die Reichweite des Felds, das eine Karte versorgt. Ob der
  Leser die Antwort der Karte dort draußen hört, ist nicht im Modell.
- **Störaussendung** und Störfestigkeit: Nichts hier ersetzt eine EMV-Prüfung.
- Nichts hier prüft eine Pinnummer, einen Footprint oder die Firmware.

Eine Simulation ersetzt den Inbetriebnahmeplan nicht. Sie sagt, wo die erste Platine
landen sollte, damit eine Messung, die woanders landet, auffällt.

## Teile von Hand ausführen

```bash
. tools/kicad-env.sh
cd sim
kicad_python dump_board.py ../kicad/attractap-touch-p4.kicad_pcb /tmp/board.json
python3 run.py /tmp/board.json          # any Python with numpy
python3 test_solvers.py
```

`spice.run('dc_hotplug.cir', vsup=26.4)` führt ein Deck mit anderen Werten für
seine `.param`-Zeilen aus; die Decks laufen auch unverändert mit `ngspice -b`.
