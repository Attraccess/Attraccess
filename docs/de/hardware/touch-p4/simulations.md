# Simulationen
<!-- llms-description: Die Feld- und Schaltungssimulationen auf der gerouteten Touch-P4-Platine, ihre wichtigsten Ergebnisse, was sie modellieren und wo ihre Grenzen liegen. -->

Die Feld- und Schaltungssimulationen der gerouteten Platine: was jede modelliert, welche Grenze sie prüft,
die wichtigsten Ergebnisse und was die Modelle auslassen. Für Hardware-Entwickler, die das Layout oder
Bauteilwerte ändern.

Die Skripte liegen in [`sim/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/sim).
Sie lesen das Kupfer aus der Platinendatei und die Bauteilwerte aus der Schaltungsbeschreibung
(`scripts/bootstrap/`), folgen also dem Design: Ändern Sie einen Wert oder das Layout und führen Sie sie
erneut aus. Für sie wurden zwei Feldlöser geschrieben (Induktivität und Feld von Leiterbahnen und
Kupferflächen; Impedanz einer Leiterbahn im Lagenaufbau); Schaltungen laufen in ngspice. Nichts hier wurde
gemessen.

## Ausführen

```bash
pnpm nx run attractap-touch-p4-pcb:simulate     # part of the check target
```

Der Bericht geht an das Terminal und nach `fab/reports/simulation.txt`. Jede mit `ok` oder `FAIL`
markierte Zeile vergleicht ein Ergebnis mit einer Grenze aus einem Datenblatt oder einer Norm; das Ziel
schlägt fehl, wenn eine verfehlt wird. Benötigt KiCad 10 mit seinem Python (numpy ist das einzige
verwendete Paket) und [ngspice](https://ngspice.sourceforge.io/); `tools/pcb.sh` nimmt ngspice aus
`NGSPICE`, dem PATH oder nixpkgs.

Von Hand:

```bash
. tools/kicad-env.sh
cd sim
kicad_python dump_board.py ../kicad/attractap-touch-p4.kicad_pcb /tmp/board.json
python3 run.py /tmp/board.json          # any Python with numpy
python3 test_solvers.py
```

`dump_board.py` schreibt die Platine als JSON (das einzige Skript, das KiCad braucht), `board.py` liest
sie, `spice.py` führt ngspice aus, `run.py` führt alles aus. `spice.run('dc_hotplug.cir', vsup=26.4)` führt
ein Deck mit anderen Werten für seine `.param`-Zeilen aus; die Decks laufen auch unverändert mit
`ngspice -b`.

## Was simuliert wird

| Teil des Berichts | Dateien | Modell | Geprüfte Grenzen |
|---|---|---|---|
| Feldlöser | `test_solvers.py` | Beide Löser gegen Ergebnisse in geschlossener Form: eine Leiterbahnschleife, dieselbe in einem kurzgeschlossenen Ring und über einer Kupferplatte, eine Streifenleitung | innerhalb von 2 bis 4 % |
| NFC-Schleife | `nfc_loop.py`, `peec.py` | Induktivität und Widerstand bei 13,56 MHz aus dem Antennen-Footprint, mit Wirbelströmen in den Kupferflächen um sie herum (alle Lagen, eine Fläche); auch an einer Metallwand und mit Metall quer über der Lücke im Kupfer um die Schleife | kein Kupfer auf den Außenlagen unter der Schraube in dieser Lücke |
| NFC-Feld | `nfc_loop.py`, `peec.py` | Feld vor dem Leser aus der Schleife und ihren Wirbelströmen, gemittelt über eine parallel gehaltene Karte von 72 x 42 mm, vom Gehäuse nach außen; an Holz oder Stein und an Metall | höchstens 7,5 A/m an einer Karte auf dem Gehäuse; 1,5 A/m (Minimum nach ISO/IEC 14443) mindestens 10 mm davor |
| NFC-Anpassung | `nfc_match.py`, `nfc_tx.cir` | Last zwischen TX1 und TX2, Senderstrom, Spannung am Empfängereingang und Schleifenstrom, an Holz oder Stein und an Metall. 20 000 Platinen mit Kondensatoren und Filterinduktivitäten über 5 % gestreut, Treiberwiderstand 2 bis 5 Ohm, Versorgung 2,7 bis 3,4 V; ein Lauf im Zeitbereich mit der Rechteckwelle der Brücke | Sender 100 mA (150 mA Grenzwert), Empfängereingang 4 Vss, Dämpfungswiderstände 0,1 W |
| DC-Eingang | `dc_hotplug.cir` | Ein Netzteil unter Spannung, über vier Kabel eingesteckt: Kabelinduktivität, Sicherung, Keramikkondensatoren mit ihrem Kapazitätsverlust über der Spannung, Filterinduktivität, TVS am oberen Ende ihres Durchbruchbereichs | Wandlereingang 40 V bei 24 V Versorgung |
| DC-Stoß | `dc_surge.cir` | 1,2/50-us-Stoß von +-1 kV hinter 42 Ohm (EN 50130-4, Leitung gegen Erde) über den DC-Eingang bei 12 bis 28 V: beide TVS am oberen Ende ihres Bereichs, C120 mit niedrigem und hohem ESR, L103 ungesättigt und gesättigt | Wandlereingang 40 V; D105 80 V Sperrspannung |
| Einschalten | `powerup.cir` | USB eingesteckt: Kabel, Sicherung, eFuse U105 mit seinem Softstart, 5-V-Schiene, beide 3,3-V-Wandler (Verhaltensmodell), Spannungswächter und Reset, EN des WLAN-Moduls | Reset low, bis die Schiene 50 us lang oben war; 5-V-Schiene über 3,8 V; beide 3,3-V-Schienen über 3,2 V; das Modul startet nach seiner Schiene |
| Wechselnde Versorgungen | `switchover.cir` | USB (eFuse), DC und PoE (ideale Dioden) eingesteckt und abgezogen, während die Platine mit 0,9 A an +5V und 0,6 A bei 3,3 V läuft; Rückstrom in eine abgezogene Quelle | +3V3 über den 2,99 V des Spannungswächters, +3V3_WIFI über 3,0 V; VBUS unter 0,8 V und Ausgang des DC-Wandlers unter 0,5 V, wenn abgezogen |
| Schnelle Leitungen | `field2d.py`, `si.py` | Impedanz und Laufzeit je Signallage aus einer 2D-Feldlösung; jede schnelle Leitung als Übertragungsleitungen mit ihren gerouteten Längen und ihrem Serienwiderstand, getrieben von einer 1-ns-Flanke hinter 33 Ohm (Standard-Treiberstärke) und 17 Ohm (die stärkste), in eine Kapazität | Überschwingen 0,5 V, kein Zurückschwingen unter 80 % bei der Standardstärke |
| Kontrollierte Impedanz | `field2d.py` | USB-Paar und Ethernet-Paare wie geroutet | innerhalb von 10 % von 90 Ohm (USB) und 100 Ohm (Ethernet) |
| WLAN-Strecke | `si.py` | Was die Platine zum SDIO-Timing beiträgt: Laufzeit von Takt und Daten, Versatz, Umlaufzeit; die Pull-ups; der Reset-Impuls über R302 in C303 | Takt und Daten innerhalb 0,5 ns, Umlaufzeit 2 ns, Pull-ups von 10 bis 90 k an CMD und D0 bis D3, Reset low für 50 us |
| Versorgungsleiterbahnen | `irdrop.py` | Jedes als Leiterbahnen geroutete Versorgungsnetz als Netzwerk aus Leiterbahn- und Via-Widerständen, alles gleichzeitig eingeschaltet | 0,2 V Verlust; Außenbahnen unter dem Strom für 20 K Erwärmung (IPC-2221) |
| Versorgungsimpedanz | `pdn.py` | Konzentriertes Modell der Kern- und 3,3-V-Schienen des MCU: jeder Kondensator mit seiner eigenen Induktivität und der seines Wegs zu den Pins | keine: nur Bericht |
| PoE-Isolation | `isolation.py` | Kupfer jeder Lage um die 48-V-Seite in einem Raster von 0,05 mm; kürzester Weg von 48-V-Kupfer zu anderem Kupfer entlang jeder Lage und durch die Platine. Modul, Kondensator und Buchse, die die Barriere konstruktionsbedingt überbrücken, bleiben ausgenommen | Luftstrecke für den Spitzenwert der 1500-V-Effektivwert-Prüfung mit einem Fünftel Reserve (IEC 60664-1); kein Weg durch die Platine kürzer als entlang einer Lage |
| Wärme | `thermal.py` | Die Platine als Platte aus 1-mm-Zellen, die Wärme durch ihr Kupfer verteilt und sie über beide Flächen abgibt (Lehrbuchwerte für ruhige Luft), zum Display und nach vorn, zur Dock-Platte und zur Wand; typischer Betrieb und alles eingeschaltet, für jede Versorgung. Abschätzung innerhalb von 40 % | typischer Betrieb in einem Raum mit 40 °C: jedes Bauteil innerhalb seiner Grenze, Display unter 70 °C, die DC-Sicherung hält das 1,5-Fache ihres Stroms, Platine unter dem WLAN-Modul unter 85 °C |
| Dock-Magnet | `dock.py` | Feld des Dock-Magneten am Hall-Schalter: auf dem Dock, außerhalb der Achse, schwächster Magnet und warm, und abgehoben | das Doppelte der höchsten Schwelle des Schalters auf dem Dock |

## Wichtigste Ergebnisse

Gegenproben mit unabhängigen Referenzen:

| Was | Modell | Referenz | Übereinstimmung |
|---|---|---|---|
| NFC-Schleife in freier Luft | 1,269 uH | Modifizierte Wheeler-Formel 1,239 uH und Stromflächen-Formel 1,313 uH (Mohan et al., IEEE JSSC 34(10), 1999, Gl. 1 und 2; typischer Fehler 2 bis 3 %), Schleife als Quadrat angenommen | +2,4 % und -3,4 % |
| Einzelne Schleife, Schleife in einem kurzgeschlossenen Ring, Schleife über einer Platte | derselbe Löser | Neumanns Doppelintegral und geschlossene Formen | innerhalb von 1,5 % |
| Impedanz von USB und Ethernet | `field2d.py` | Impedanzrechner von JLCPCB, TI SNLA187 | innerhalb von 1 Ohm |
| Streifenleitung zwischen zwei Ebenen | `field2d.py` | Geschlossene Form nach Cohn mit Dickenkorrektur | 53,8 gegenüber 54,3 Ohm |
| Wärme, PoE, typischer Betrieb | +30 K Mittel der Platine | Von Hand: 3,4 W über 0,11 W/K | innerhalb von 3 % |

Ergebnisse auf der gerouteten Platine:

- **NFC**: 1,25 uH auf der Platine, 1,20 uH an einer Metallwand; die offenen Kupferflächen um die Schleife
  nehmen 2 %. Metall quer über der Lücke (die Schraube) brächte sie auf 1,03 uH. Mit der bestückten
  Anpassung: 41 mA und 1,9 Vss bei 1,25 uH, 35 mA und 1,2 Vss bei 1,20 uH, keine Platine von hundert
  außerhalb einer der Grenzen. Feld: 4,1 A/m an einer Karte auf dem Gehäuse, 3,3 A/m an einer Metallwand;
  es fällt 19 mm davor auf 1,5 A/m (15 mm an Metall). Der Sender nutzt 41 seiner 100 mA, die Anpassung hat
  also Spielraum für mehr Reichweite.
- **DC-Eingang**: 35 bis 38 V am Wandler beim Einstecken eines 24-V-Netzteils unter Spannung (38,1 V und
  8,6 A in der TVS mit 5 m von 1,5 mm2), 39,9 V aus 26,4 V. C117 sieht bis zu 43 V; es ist ein
  100-V-Bauteil.
- **Einschalten über USB**: beide 3,3-V-Schienen 5,0 ms nach dem Einstecken oben; die 5-V-Schiene läuft mit
  4,82 V (guter Port) und 4,18 V (4,5 V hinter 0,5 Ohm). Beim Einstecken fließen für Mikrosekunden 3,8 A
  in C101 (10 uF, USB 2.0 7.2.4.1), dann 47 mA, während das eFuse die Schiene mit 0,91 V/ms hochfährt. Der
  Reset endet 4,7 ms nachdem die Schienen oben sind, mit der Verzögerung des Spannungswächters im Modell
  auf 2 ms verkürzt; das Bauteil hält 120 bis 280 ms.
- **Wechselnde Versorgungen**: +5V bleibt bei 4,06 V oder darüber, +3V3 bei 3,30 V, +3V3_WIFI bei 3,29 V.
  Abgezogen bleibt VBUS bei 0 mV, der Ausgang des DC-Wandlers bei 1 mV. Das Maximum der Platine (1,82 A)
  an USB allein bei 4,75 V schaltet die Platine an der Unterspannungsgrenze des eFuse ab; die USB-Grenze
  der Firmware verhindert das.
- **Schnelle Leitungen**: Leiterbahnen von 0,15 mm haben 49 Ohm auf den Außenlagen, 46 Ohm auf In2 (5,7
  und 7,0 ps/mm). Leitungen mit Serienwiderstand zeigen keine Reflexionen. Leitungen ohne (RMII-Senden,
  SDIO-Daten und -Befehl, 40 bis 48 mm) überschwingen um 0,13 V bei der Standardstärke, um 0,6 bis 0,8 V
  bei der stärksten; daher die Regel zur Treiberstärke unter
  [Firmware-Portierung](hardware/touch-p4/firmware-port.md).
- **SDIO-Strecke**: alle sechs Leitungen 40,3 mm. Der Takt kommt nach 0,59 ns an, die Daten nach 0,41 bis
  0,42 ns (innerhalb 0,18 ns); Umlaufzeit 1,01 ns. Mit einem Modul, das innerhalb der 14 ns des
  SD-Standards antwortet, behält der MCU 10,0 ns bei 40 MHz und 5,0 ns bei 50 MHz: Die Platine begrenzt
  diese Strecke nicht.
- **Versorgungsleiterbahnen**: höchstens 0,13 V Verlust (ferne LED-Reihe, 1,5 A an der 5-V-Schiene). Die
  1,5 A des USB-Eingangs laufen durch 13 mm Innenbahn von 0,62 mm, mehr als die Regel für eine freie
  Innenbahn erlaubt; sie liegt 0,1 mm neben einer Ebene, die ihre 70 mW aufnimmt.
- **Versorgungsimpedanz**: Über 30 MHz sieht die Kernschiene wie 1,1 nH aus (2,4 nH für einen Pin), ein
  3,3-V-Pin wie 1,2 nH, etwa das, was das Gehäuse je Pin hinzufügt.
- **PoE-Isolation**: 2,01 mm entlang einer Lage und 2,02 mm durch die Platine, an Pin 10 der Buchse; 2,0 mm
  Luft halten 3,0 kV Spitze (IEC 60664-1), die Prüfung erreicht 2,1 kV. Innerhalb von Bauteilen und nicht
  in dieser Zahl: 4,5 mm zwischen den Pads von C102, die eigene Barriere des PoE-Moduls und 0,5 mm von
  Pin 9 der Buchse zur Metallrückseite des Displays, die das Polyimidband hält.
- **Wärme** (Anstieg über den Raum, Abschätzung innerhalb von 40 %):

  | Versorgung | Typischer Betrieb | Platine | Wärmste Stelle | Display | WLAN-Modul: Platine darunter, Hohlraum | Alles an: Platine, LED-Reihen, unter dem WLAN-Modul, Hohlraum |
  |---|---|---|---|---|---|---|
  | USB | 2,5 W | +22 K | +33 K | +16 K | +27 K, +16 K | +39 K, +70 K, +48 K, +29 K |
  | DC, 12 V | 2,9 W | +26 K | +37 K | +19 K | +30 K, +19 K | +46 K, +75 K, +54 K, +34 K |
  | PoE | 3,5 W | +31 K | +40 K | +23 K | +35 K, +23 K | +52 K, +82 K, +60 K, +38 K |

  In einem Raum mit 40 °C am PoE: Display 63 °C (Grenze 70 °C), Luft am PoE-Modul 71 °C (85 °C), Luft
  außerhalb des WLAN-Moduls 63 bis 75 °C (85 °C), die DC-Sicherung hält 0,66 A gegenüber 0,28 A
  Stromaufnahme. Lange alles eingeschaltet liegt jenseits dessen, was das Gehäuse abgeben kann; die
  Firmware begrenzt die LEDs und überwacht den Chip.
- **Dock-Magnet**: 22 mT am Schalter (10,3 mm), noch 16 mT mit dem schwächsten Magneten, 4 mm außerhalb der
  Achse und 40 K wärmer; der Schalter braucht 4,8 mT. Abgehoben kann er nach 9 mm schalten und hat bei
  33 mm geschaltet.

## Die WLAN-Antenne

```bash
pnpm nx run attractap-touch-p4-pcb:simulate-antenna      # about three quarters of an hour
```

`wifi_antenna.py` ist ein Vollwellenmodell (FDTD, [openEMS](https://www.openems.de/)) der
Leiterplattenantenne des ESP32-C5-MINI-1 auf dieser Platine, bei 2,4 und 5 GHz, mit einem Puls je Band.
Die Dual-Band-Antenne des Moduls (gespeist über einen Diplexer) ist nicht veröffentlicht, daher verwendet
das Modell einen Ersatz gleicher Größe und Art: eine invertierte F-Antenne mit einem langen Arm für
2,4 GHz und einem kurzen Zweig für 5 GHz, Massepunkt rechts. Er ist auf einer kleinen Evaluierungsplatine
auf etwa 2,43 und 5,44 GHz abgestimmt und wird dann unverändert auf diese Platine gesetzt.

| Fall | Was im Modell ist |
|---|---|
| `reference` | das Modul am Rand einer Evaluierungsplatine von 40 x 55 mm, Antenne über den Rand hinaus |
| `board` | diese Platine am Platz des Moduls (`geometry.WIFI_MODULE`): ihre Masse, der Ausschnitt unter der Antenne, die Kupfer-Sperrfläche |
| `display` | dasselbe mit der Metallrückseite des Displays 1,5 mm von der Platine, auf seinen vier Massepads |
| `in_case` | `display` im gedruckten Gehäuse: Front-, Ober- und Seitenwände, Dock-Platte |
| `metal_wall` | `in_case` mit einer Metallwand 16,4 mm hinter der Bestückungsseite |
| `faceplate` | `in_case` mit einer 0,8 mm dicken Aluminium-Frontplatte über der Vorderseite (ein Fenster für das Display) |
| `faceplate_window` | dasselbe mit dem Streifen über dem Display, der über der Antenne und ihrer Sperrfläche offen ist |
| `p3_board`, `p3_in_case`, `p3_metal_wall` | das Modul an Espressifs empfohlenem Platz, oben rechts mit der Antenne über den Rand hinaus (HDG 1.4.7, Abb. 22 Position 3, Abb. 23), das Gehäuse so vergrößert, dass dieselben Wandabstände bleiben |

Es gibt je Fall und Band die Resonanz, die Anpassung und die Bandbreite aus, und für drei Kanäle den
Anteil der eingespeisten Leistung, der abgestrahlt wird (in Klammern: der aufgenommenen Leistung), und wie
viel davon zur Seite des Raums geht. Die Unterschiede zwischen den Fällen sind das Ergebnis; die absoluten
Werte gehören zum Ersatz.

Wichtigstes Ergebnis: Im Gehäuse mit dem Display strahlt der Ersatz bei 2,4 GHz -3,0 bis -4,1 dB der
eingespeisten Leistung ab und bei 5 GHz -2,5 bis -4,0 dB, in jedem Kanal innerhalb von 3 dB von Position 3.
Eine geschlossene Aluminium-Frontplatte kostet bei 2,4 GHz bis zu 1,9 dB mehr; mit einem Fenster über der
Antenne kostet sie nichts. Die vollständige Tabelle und ihre Folgen stehen in den
[Designnotizen](hardware/touch-p4/design-notes.md#antenne).

Das Ziel ist nicht Teil von `simulate` oder `check`. Es braucht ein Python mit openEMS (`OPENEMS_PYTHON`;
Debian und Ubuntu haben es als `python3-openems`) und kein KiCad. Es hängt nicht vom gerouteten Kupfer ab,
nur von `geometry.py` und den Maßen am Anfang des Skripts.

## Was die Modelle auslassen

- **Die Chips sind einfach.** Kein Hersteller veröffentlicht IBIS- oder SPICE-Modelle für den ESP32-P4,
  den PN532 oder die Wandler. Treiber sind eine Rampe hinter einem Widerstand, Empfänger eine Kapazität,
  Wandler folgen der Unterspannungssperre und dem Softstart ihres Datenblatts. Die Werte sind die
  typischen der Datenblätter.
- **Die Eigenkapazität der NFC-Schleife** (2,4 pF) ist eine Abschätzung; jedes Pikofarad zählt wie 1 %
  Induktivität. Die DC-Klemme, der Ethernet-Stecker und das Kabel, eine Karte oder ein Telefon im Feld
  sind nicht modelliert; alle senken die Induktivität.
- **Wärme** ist eine Abschätzung: Die Oberflächenwerte sind Lehrbuchwerte für ruhige Luft, die
  Verlustleistungen der Bauteile sind Abschätzungen, und ein Leser in der Sonne oder über einer Heizung
  ist kein Raum mit 40 °C.
- **NFC-Reichweite** ist die Reichweite des Felds, das eine Karte versorgt, nicht, ob der Leser ihre
  Antwort hört.
- **Störaussendung und Störfestigkeit**: Nichts hier ersetzt eine EMV-Prüfung.
- Nichts hier prüft Pinnummern, Footprints, die Reichweite des Display-Flexkabels, das Verhalten des
  PN532 aus zweiter Quelle oder die Firmware.

Eine Simulation ersetzt den [Inbetriebnahmeplan](hardware/touch-p4/bring-up.md) nicht. Sie sagt, wo die
erste Platine landen sollte, damit eine Messung, die woanders landet, auffällt.
