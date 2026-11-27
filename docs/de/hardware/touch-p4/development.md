# Arbeiten an der Platine
<!-- llms-description: Wie das KiCad-Projekt der Touch P4 erzeugt und geprüft wird, die Nx-Targets, die Bestellung bei JLCPCB und die Freigabe einer Revision. -->

Für Hardware-Entwickler: wo das Design liegt, wie eine Änderung gemacht und geprüft wird und wie eine
Revision zu JLCPCB geht. Warum die Schaltung so ist, wie sie ist: [Designnotizen](hardware/touch-p4/design-notes.md).

## Projektordner

Das Design liegt in [`apps/attractap/hardware/touch-p4/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/)
(Nx-Projekt `attractap-touch-p4-pcb`). Diese Dokumentation und ihre Bilder liegen in `docs/en/hardware/touch-p4/`
und `docs/_media/hardware/touch-p4/`.

```
kicad/                      KiCad 10 project, written by the generator: look, do not edit
  attractap-touch-p4.kicad_pro / .kicad_sch / .kicad_pcb
  attractap-touch-p4-<sheet>.kicad_sch    one sheet per function block
  attractap-touch-p4.ses                  the autorouter's result (committed)
  lib/attractap.kicad_sym, lib/attractap.pretty/, lib/attractap.3dshapes/
  sym-lib-table, fp-lib-table             register the project library
scripts/bootstrap/          the generator, master of the schematic and the board
scripts/export_fab.py       Gerbers, drill, BOM and placement files for JLCPCB, drawings
sim/                        field and circuit simulations of the routed board
case/                       3D-printable case, see the case page
fab/jlcpcb/                 the JLCPCB upload package (in git)
tools/pcb.sh                the commands behind the Nx targets
```

Das Gehäuse und seine Dateien: [Gehäuse](hardware/touch-p4/case.md).

### Aufbau des Schaltplans

Das Stammblatt ist ein Blockdiagramm mit der Revisionshistorie. Jeder Block ist ein Blatt:

| Blatt | Inhalt |
|---|---|
| Power | USB-C-Eingang mit seiner eFuse, DC-Eingang (Buchse und Klemme) mit seinem 5-V-Wandler, PoE-Eingang, ideale Dioden auf die 5-V-Schiene, 3,3-V-Abwärtswandler |
| MCU | GPIO und Systemeinheiten des ESP32-P4, Flash, Quarz, Reset-Supervisor und Taster, Boot, USB |
| MCU_Power | Versorgungseinheit des ESP32-P4, Abblockung, 1,1-V-Kernwandler |
| WiFi | ESP32-C5-Modul, sein 3,3-V-Wandler, SDIO-Pull-ups, Reset und Testpunkte |
| Ethernet | PHY, Quarz, Strap-Beschaltung, Buchse (nur LAN-Version) |
| NFC | PN532, Versorgung, Anpassnetzwerk, Antenne |
| Display | Panel-Anschluss, RGB-Serienwiderstände, Hintergrundbeleuchtung, IO-Expander |
| UI | LEDs, Pegelwandler, LED-Versorgungsschalter, Summer, Manipulationssensoren |
| Mechanical | Befestigungslöcher, Passmarken |

Jedes Blatt hat das kleinste Papierformat, das es fasst (A4 oder A3), mit Datum und Revision in seinem
Schriftfeld. Wie die Blätter gezeichnet werden: [Schaltplanzeichnung](#schaltplanzeichnung).

## Maßgebliche Quelle

Die Schaltungsbeschreibung in `scripts/bootstrap/` (`design.py`, `circuit_core.py`, `circuit_io.py`,
die Skripte für Platzierung und Routing) ist die Vorlage. Die KiCad-Dateien in `kicad/` und das Paket in
`fab/jlcpcb/` werden daraus erzeugt und eingecheckt, damit man sie ohne Ausführung eines Programms öffnen,
prüfen und bestellen kann.

- Machen Sie jede Änderung im Generator und erzeugen Sie neu: `generate-library`, wenn sich ein Symbol oder
  Footprint ändert, `generate-schematic`, dann `place` und `route-finish`, dann `check`.
- Öffnen Sie `kicad/attractap-touch-p4.kicad_pro` in KiCad 10, um es anzusehen oder etwas auszuprobieren,
  aber committen Sie keine in KiCad gemachte Änderung. Der nächste Lauf des Generators überschreibt sie.
- Jeder Generatorschritt hält einen Stempel in `kicad/generated-from.json` fest. `check-source`
  (`scripts/check_source.py`) schlägt fehl, wenn sich eine KiCad-Datei von dem unterscheidet, was der
  Generator schrieb, oder wenn sich der Generator nach dem Schreiben der Dateien geändert hat. Kommentare
  und Docstrings zählen nicht.
- Die übrigen erzeugten Dateien (Bestellpaket, Platinen-Renderings und -PDFs, Druckdateien des Gehäuses,
  Abbildungen und PDFs der Anleitung) stehen mit ihren Quellen in `generated-outputs.json`. Jeder Generator
  hält die Quellen, aus denen er erzeugt hat, in `generated-stamps.json` fest; der Pre-Commit-Hook
  (`scripts/check-generated.mjs --staged`) lehnt einen Commit ab, dessen gestagte Quellen vom Stempel
  abweichen, und nennt den Befehl, der die Dateien neu erzeugt. Die neuen Ausgaben und die Stempeldatei mit
  der Quelländerung stagen.

## Werkzeuge

- KiCad 10: `kicad-cli` und das Python-Modul `pcbnew`, mit numpy und Pillow.
- Java 25 oder neuer und [Freerouting](https://github.com/freerouting/freerouting) 2.5.0, nur für `route`.
  Version 2.2.4 hängt sich auf dieser Platine auf.
- Python 3 mit [easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py), zum Abrufen von Bauteilen.
- ngspice für `simulate`, openEMS für `simulate-antenna`.

Die Targets finden KiCad im PATH, im macOS-App-Bundle oder in nixpkgs (überschreiben mit `KICAD_CLI`
und `KICAD_PYTHON`) und ngspice im PATH oder in nixpkgs (`NGSPICE`). KiCad läuft mit einer eigenen
Konfiguration unter `.tools/kicad`. Berichte landen in `fab/reports/`.

## Nx-Targets

Führen Sie jedes als `pnpm nx run attractap-touch-p4-pcb:<target>` aus.

| Target | Was es tut |
|---|---|
| `setup-toolchain` | Prüft KiCad 10 und sein Python, lädt den Autorouter nach `.tools/kicad`. Einmal ausführen. |
| `check` | Führt `test`, `check-source`, `erc`, `check-netlist`, `drc`, `simulate` und `check-package` aus (`fab/jlcpcb/` passt zur Platine). Vor dem Bestellen ausführen. |
| `test` | Prüfungen der Schaltungsbeschreibung und die I2C-Adressprüfung. Braucht kein KiCad. |
| `check-source` | Die KiCad-Dateien sind das, was der Generator schrieb. Braucht kein KiCad. `python3 scripts/check_source.py --full` erzeugt alles in einer Kopie neu und vergleicht (etwa 45 Minuten, KiCad nötig; vor einer Bestellung). |
| `erc` | Elektrische Regelprüfung des Schaltplans. |
| `check-netlist` | Schaltplan gegen die Schaltungsbeschreibung; Geräte und Adressen an jedem I2C-Bus. |
| `drc` | Entwurfsregelprüfung der Platine, einschließlich Abgleich mit dem Schaltplan. |
| `check-package` | `fab/jlcpcb/` passt zur Platine. |
| `check-footprints` | Jedes Footprint gegen das Bibliotheks-Footprint von JLCPCB für seine Bauteilnummer: Passen der Pads und Bestückungswinkel. Braucht das Internet; nicht Teil von `check`. Ausführen nach einer Änderung einer Bauteilnummer oder eines Footprints. |
| `simulate` | Simuliert die verlegte Platine gegen die Grenzen der Bauteile: NFC-Schleife, Anpassung und Feld, Hot-Plug am DC-Eingang, Hochfahren, Reflexionen und Timing auf schnellen Leitungen, Spannungsabfall, PoE-Isolationsabstände, Wärme im geschlossenen Gehäuse, der Dock-Magnet. Braucht ngspice. Siehe [Simulationen](hardware/touch-p4/simulations.md). |
| `simulate-antenna` | Vollwellenmodell der Platinenantenne des WLAN-Moduls (ein Ersatz gleicher Größe und Art) an ihrem Platz und an Espressifs Position, mit dem Display, im Gehäuse und mit einer Metallwand dahinter. Braucht openEMS; nicht Teil von `check`. |
| `build` | Führt `erc` und `drc` aus, schreibt dann das JLCPCB-Paket nach `fab/jlcpcb/` und den Schaltplan und zwei Platinenplots (PDF) nach `docs/_media/hardware/touch-p4/`. |
| `render` | Die 3D-Renderings `docs/_media/hardware/touch-p4/board-top.png` und `board-bottom.png`. |
| `generate-library` | Baut `kicad/lib/` aus LCSC-Konvertierungen (`-- <dir>`) oder wendet Korrekturen und 3D-Modelle erneut an (`-- --refit`). |
| `generate-schematic` | Schreibt den Schaltplan aus der Schaltungsbeschreibung. |
| `place` | Baut die Platine: Bauteile, Kupferflächen, feste Vias und Routen; meldet überlappende Bauteile. |
| `route` | Führt den Autorouter aus und ersetzt `kicad/attractap-touch-p4.ses`, schließt dann wie `route-finish` ab. |
| `route-finish` | Baut das Routing aus der committeten `.ses` neu auf (nach `place`): schließt offene Verbindungen, verbreitert Versorgungsleiterbahnen, setzt Rückstrom- und Stitching-Vias, füllt die Kupferflächen, führt die DRC aus. Etwa fünf Minuten; wiederholbar. |

Die letzten fünf überschreiben die KiCad-Dateien.

## Der Generator

Die Skripte in [`scripts/bootstrap/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/scripts/bootstrap)
bauen das ganze Projekt aus `design.py`: Bibliothek, Schaltplanblätter, Platzierung, feste Routen, das
committete Ergebnis des Autorouters, einen Raster-Router für die übrigen Verbindungen und die Prüfungen.

| Dateien | Zweck |
|---|---|
| `design.py`, `circuit_core.py`, `circuit_io.py`, `parts_info.py` | Die Schaltungsbeschreibung: jedes Bauteil, Blatt für Blatt, mit Wert, Footprint, LCSC-Nummer, Variante und dem Netz an jedem Pin; Bauteilnummern der Passiven; Hersteller, Lebenszyklus und Alternative jedes anderen Bauteils. |
| `libs.py`, `make_lib.py`, `lib_symbols.py`, `footprint_silk.py` | Die Projektbibliothek: LCSC/EasyEDA-Konvertierungen geprüft und korrigiert, das Footprint der NFC-Antenne, das dreiteilige ESP32-P4-Symbol, Pastenfenster auf den freiliegenden Pads von ESP32-P4, PHY und PN532, die hier gezeichneten Symbole, Footprint-Bestückungsdruck von den Pads zurückgenommen. |
| `collect_models.py`, `model_fit.py`, `lib_models.py` | 3D-Modelle in `kicad/lib/attractap.3dshapes/`, auf ihre Footprints eingepasst. |
| `build_sch.py`, `sch_*.py` | Der Schaltplan: Schriftfelder, Revisionshistorie, ein Layout je Blatt, die Zeichen-Engine, Konnektivitätsprüfung und Überlappungs-Lint. |
| `geometry.py`, `placement.py`, `board.py`, `board_setup.py` | Umriss, Positionen von Display, Schlitz, Antenne, LEDs, Sensoren und Dock, `COPPER_LAYERS`; Bauteilpositionen; Kupferflächen, Sperrflächen, Regeln, Netzklassen. |
| `build_pcb.py` | Baut die Platine (`place`), exportiert und importiert die Dateien des Autorouters (`dsn`, `ses`), füllt die Kupferflächen (`finish`). |
| `routes_mcu.py`, `routes_board.py`, `routes_ring.py`, `routes_signal.py`, `routes_sdio.py`, `routes_wifi.py` | Feste Routen: MCU-Fan-out, Flash, Displaybus; 48 V, Ethernet, DC-Filter, Masse-Vias; Antennenzuleitungen und LED-Ring; das 90-Ohm-USB-Paar; der längenangepasste SDIO-Bus (HDG 1.4.9); der Wandler des WLAN-Moduls. |
| `finish_route.py`, `route_grid.py`, `post_route.py` | Raster-Router für das, was der Autorouter offen lässt; breitere Versorgungsleiterbahnen, Rückstrom- und Stitching-Vias, und `--fix`, um zurückzunehmen, was die DRC meldet. |
| `silk.py`, `silk_refdes.py` | Bestückungsdruck beider Seiten (Logo aus `case/logo/`, GPIO-Übersicht, Hinweise) und die Bezeichner. |
| `check_overlap.py`, `check_netlist.py`, `test_design.py` | Überlappende Körper; Netzliste gegen `design.py` und I2C-Adresskonflikte; das Target `test`. |

### Schritte

```bash
# 1. fetch the LCSC parts once into a scratch folder, then build kicad/lib
easyeda2kicad --lcsc_id C54540373 C5736265 ... --full --output /tmp/lcsc/lcsc
pnpm nx run attractap-touch-p4-pcb:generate-library -- /tmp/lcsc
# 1b. 3D models: fetch once into a cache, store them and write lib_models.py, then attach them
python3 scripts/bootstrap/collect_models.py /tmp/models --fetch
pnpm nx run attractap-touch-p4-pcb:generate-library -- --refit
# 2. schematic, then ERC and the netlist check
pnpm nx run attractap-touch-p4-pcb:generate-schematic
# 3. board: parts, zones, fixed vias and routes
pnpm nx run attractap-touch-p4-pcb:place
# 4a. rebuild the committed routing (repeatable)
pnpm nx run attractap-touch-p4-pcb:route-finish
# 4b. or route anew: autorouter (30 minute limit), then the same finishing steps (15 to 40 minutes in all)
pnpm nx run attractap-touch-p4-pcb:route
```

Um ein Bauteil von LCSC hinzuzufügen, tragen Sie es in die Schaltungsbeschreibung ein, holen Sie die
Konvertierungen aller LCSC-Bauteile der Platine in einen Ordner (Schritt 1, mit der neuen LCSC-Nummer) und
erzeugen Sie von dort neu. Jedes bestückte Bauteil trägt `LCSC`, `Manufacturer`, `MPN`, `BOM description`,
`Alternate` und, für ICs und Module, `Lifecycle`. Passive verwenden die Standard-KiCad-Bibliotheken;
3D-Modelle kommen aus der JLCEDA/EasyEDA-Bibliothek für konvertierte Footprints und aus KiCads packages3D für
Standard-Footprints.

Die Schritte hinter `route` und `route-finish` stehen in `tools/pcb.sh`. Der Autorouter schreibt sein
Ergebnis erst nach seinem letzten Durchlauf, daher das Zeitlimit, und liefert nie zweimal dasselbe Ergebnis:
Committen Sie eine neue `.ses` zusammen mit der Platine, zu der sie geführt hat.

`COPPER_LAYERS` in `geometry.py` ist 6; 4 baut das Vier-Lagen-Layout aus demselben Routing (8 bis 45 USD
günstiger je Bestellung, mit den Schwächen beim Rückstrompfad aus den Designnotizen). Leiterbahnen laufen in
beiden auf F.Cu, In2 und B.Cu; nur die Flächen unterscheiden sich (`board_setup.zones`).

### Schaltplanzeichnung

Jedes Blatt wird von einer Layout-Funktion gezeichnet, Block für Block. Ein Block ist eine Funktion (der
USB-Eingang, der Kernwandler, der NFC-Sendepfad), in einem betitelten Rahmen als Schaltung gezeichnet:
Leitungen von links nach rechts gelesen, Versorgung oben, Masse unten. Labels verbinden Blöcke und führen
Busse (RGB, RMII, SDIO, Flash), nie innerhalb eines Blocks; Netze, die Blätter überqueren, sind hierarchische
Labels und erscheinen als Pins auf dem Stammblatt. `GND`, `+3V3` und `+5V` sind Power-Symbole. Kondensatoren
zeigen Spannung und Dielektrikum, Widerstände ihre Toleranz, wo sie wichtig ist.

`sch_finish.finish()` schließt, was ein Layout offen lässt: Versorgungspins bekommen ein Power-Symbol (Pins
nebeneinander teilen sich eines), andere Pins eine kurze Leitung mit Label, unbenutzte Pins ein
No-Connect-Flag, und ein Netz, das vollständig innerhalb eines Blocks verdrahtet ist, bekommt seinen Namen an
einer Leitung, damit der Schaltplan die Netznamen der Schaltung behält.

`check()` löst einen Fehler aus, wenn eine Leitung, ein Pin oder ein Label zwei Netze verbinden würde, und
zählt dabei alles, was KiCad verbinden könnte (strenger als KiCad). `lint()` meldet überlappenden Text,
Symbole, Leitungen und Blockrahmen; `build_sch.py` schlägt fehl, außer es meldet nichts. Ob die Schaltung
stimmt, entscheidet `check-netlist`, Pin für Pin gegen `design.py`, nicht die Zeichnung.

Symbole in `lib_symbols.py`:

- nach dem verbauten Bauteil umbenannt, aus einem Symbol mit denselben Pins: SN74LV1T125DBVR (74AHCT1G125),
  LIS2DH12TR (LIS2DE12), DRV5032FADBZR (DRV5033), die TVS-Dioden SMBJ28A (SM6T) und SMBJ28CA (SMAJ10CA);
- zum besseren Lesen gezeichnet: USB-C-Buchse und USB-ESD-Bauteil, PoE-Modul (Eingang links), RJ45-Buchse
  (Pinnamen nach Funktion), die Wandler (Eingang links, Schaltknoten rechts), ideale Diode, eFuse,
  Supervisor, PHY, LED, Summer, PN532 (Host links, Funk rechts) und das ESP32-C5-Modul (Pins aus seinem
  Datenblatt v1.4, Tabelle 3-1).

### Änderungen nach dem Lauf des Autorouters

Die committete `.ses` ist älter als das letzte Design-Review, das Bauteile verschoben, hinzugefügt und neu
verdrahtet hat. `route-finish` kommt damit ohne einen neuen Autorouter-Lauf zurecht:

- `build_pcb.py ses` importiert nur die Routen, nicht die Bauteilpositionen, die die Sitzung ebenfalls festhält.
- `STALE_NETS` (in `build_pcb.py`): Ihre Leiterbahnen vom Autorouter werden verworfen; sie haben jetzt feste
  Routen. `STALE_PARTS`: Leiterbahnen des Autorouters nahe ihren Pads oder festen Vias werden entfernt und neu
  geroutet.
- `drop_collisions` entfernt jede andere Leiterbahn und jedes Via des Autorouters, das einem Pad, festen Via
  oder einer festen Leiterbahn eines anderen Netzes zu nahe kommt, sodass sich ein Bauteil verschieben lässt,
  ohne die Listen anzufassen.
- Der Import macht die Vier-Lagen-Vias der Sitzung wieder zu durchgehenden Vias.

Wenn der Autorouter erneut läuft, leeren Sie beide Listen.

### Fallstricke

- Feste Routen müssen auf einem Pad oder Via enden, dürfen nur Segmente mit 0, 45 und 90 Grad verwenden und
  müssen an ihren Endpunkten auf andere Leiterbahnen treffen; sonst gibt der Autorouter bei dem Netz auf.
- Lassen Sie nur einen Autorouter gleichzeitig laufen; zwei Instanzen blockieren sich gegenseitig.
- `finish_route.py` braucht Minuten bis eine Stunde. Wenn sich zwei Netze in seinem Log immer wieder
  gegenseitig auftrennen, hat die Stelle zu wenig Platz: Korrigieren Sie die Platzierung oder fügen Sie eine
  feste Route hinzu. Ein erneuter Lauf hilft nicht.
- Ein Versorgungs-Fan-out-Via vor einer Pad-Reihe kann eine Ausweichleiterbahn kosten. `plane_fanout` läuft
  zuletzt und hat eine kurze Liste von Pads, die anders gespeist werden.
- JLCPCB zählt den Winkel eines Footprints von seinem eigenen Bibliotheks-Footprint aus, nicht von KiCads.
  `check-footprints` vergleicht sie; die Korrekturen stehen in `scripts/export_fab.py`.
- Der angegebene Wert eines Keramikkondensators gilt bei 0 V. Nehmen Sie den Wert bei der Betriebsspannung aus
  der Kurve des Herstellers (10-uF-/50-V-Bauteile hatten bei 24 V 1,35 uF).
- Ein thermisches Via in einem konvertierten Footprint ist ein durchkontaktiertes Pad, für Via-Prüfungen
  unsichtbar; `test_design.py` prüft, dass keines Lotpaste trägt.
- Durchsteckbauteile ragen aus der Displayseite. Halten Sie sie von der Stelle hinter dem Display fern; wo das
  nicht geht (die Ethernet-Buchse), prüft `test_design.py` die Lage der 48-V-Pins und den Displayabstand.

## Bestellen bei JLCPCB

`build` schreibt das Upload-Paket nach `fab/jlcpcb/`. Es liegt in Git, damit die Dateien einer Bestellung
wiedergefunden werden können; `check` schlägt fehl, wenn es nicht zur Platine passt.

| Datei | Verwendung |
|---|---|
| `attractap-touch-p4-gerbers.zip` | Die Platinenbestellung: Gerber- und Bohrdateien. |
| `attractap-touch-p4-fab.pdf` | Fertigungszeichnung: Umriss, Ausschnitte, Lagenaufbau, Bohrtabelle, kleinste Strukturen, Hinweise (Oberfläche, IPC-Klasse, Via-Füllung). An die Bestellung anhängen. |
| `attractap-touch-p4-assembly.pdf` | Bestückungszeichnung: jedes Bauteil mit Umriss, Pads, Bezeichner, Wert, Pin 1 und Polarität; Detailblätter von MCU, PHY, NFC-Chip und Leistungsteil. Für Bestückungsfragen, Prüfung und Reparatur. |
| `attractap-touch-p4.ipc` | IPC-D-356-Netzliste für den elektrischen Test der Fertigung. |
| `bom-lan.csv`, `cpl-lan.csv` | Bestückung der LAN-Version: Stückliste (mit Hersteller, Bauteilnummer, Alternative, Lebenszyklus) und Positionen. |
| `bom-wifi.csv`, `cpl-wifi.csv` | Bestückung der WLAN-Version. |
| `parts-list-lan.csv`, `parts-list-wifi.csv` | Alles, was für einen Leser zu kaufen ist, einschließlich des Displaypanels, das JLCPCB nicht bestückt. |

Bestellformular:

| | |
|---|---|
| Platine | 6 Lagen, 86 x 143,5 mm, 1,6 mm FR-4 |
| Lagenaufbau | JLC06161H-3313: "Specify Stackup" = "Yes" und ihn wählen (kostenlos). Prepreg 0,0994, Kern 0,55, Prepreg 0,1088, Kern 0,55, Prepreg 0,0994 mm |
| Kleinste Leiterbahn und Abstand | 0,11 mm und 0,127 mm (JLCPCBs Grenze mit Innenlagen: 0,09 mm). Zwei Segmente sind 0,112 mm, alle anderen 0,126 mm oder mehr. Pads zweier Netze mindestens 0,15 mm auseinander (MCU-Pins). Spielräume: [Designnotizen](hardware/touch-p4/design-notes.md) |
| Kleinste Via | 0,45 mm Pad, 0,2 mm Bohrung (etwa jede fünfte Via; die meisten haben 0,5-mm-Pads). Kostenlos mit Innenlagen bei 0,45 mm oder breiter: "Min via hole size/diameter" auf "0.3mm/(0.4/0.45mm)" lassen; kleinere Auswahlmöglichkeiten kosten 39 USD und mehr |
| Vias | "Epoxy Filled & Capped", ohne Aufpreis, und nötig: C208, C223 und C226 am MCU haben eine Via im Pad, und die zwölf Masse-Vias zwischen den Masse-Pads des WLAN-Moduls berühren die Pads (Espressifs Land Pattern). Keine andere Via liegt unter Lotpaste. "Tented" wird mit Innenlagen nicht angeboten |
| Lötstopplack | grün: Die 0,1-mm-Stege zwischen den Pins des MCU sind JLCPCBs Grenze für Grün |
| Gefräste Öffnungen | Flexschlitz 10,5 x 21,6 mm, 16 LED-Fenster 3,4 x 3,0 mm mit freigestellten Ecken, ein Ausschnitt 28,9 x 6,0 mm in der Oberkante unter der WLAN-Antenne, zwei abgeschnittene Ecken, durchkontaktierte Langlöcher an der DC-Buchse und an USB-C |
| Umrisstoleranz | die übliche +/-0,2 mm |
| Oberfläche | ENIG (18 USD für 5 Platinen, 48 für 100, 336 für 1000). Nicht das kostenlose OSP: JLCPCB schließt es für Kontaktflächen aus, und die vier Masse-Pads für das Display und die 30 Testpunkte blieben blankes Kupfer |
| Impedanzkontrolle | "Yes", +/-10 % (33 USD pro Bestellung): USB-Paar 90 Ohm differenziell (0,14-mm-Leitungen, 0,15 mm Abstand, Rückseitenlage über In4), Ethernet 50 Ohm (0,155 mm, Bestückungsseite über In1), aus JLCPCBs Rechner für diesen Lagenaufbau; die Fertigung darf die Breiten anpassen |
| Bestückung | Standard PCBA, nur Oberseite: 233 Bauteile in 85 Zeilen (wifi), 270 Bauteile in 96 Zeilen (lan). Randstreifen "Added by JLCPCB": der Nutzen wird 96 x 143,5 mm groß |
| Durchsteckbauteile | DC-Buchse J102, DC-Klemme J103 und bei der LAN-Version die Buchse J401 |
| Nicht bestückt | das Displaypanel (aufgeklebt, Flexkabel in J601 gesteckt) |
| Seriennummer | "Mark on PCB" = "2D barcode (Serial Number)", Druck "Number Only", Position "Specify Position": JLCPCB druckt eine auf jeder Platine andere Nummer in das weiße Feld von 10 x 2 mm neben `S/N` auf der Bestückungsseite. Ohne die Option bleibt das Feld weiß, zum Beschriften |

Der Bestückungsdruck trägt einen Bezeichner, wo immer einer passt (etwa die Hälfte der Bauteile); die
Bestückungszeichnung hat alle. Kosten und Beschaffung: [Bauteile und Beschaffung](hardware/touch-p4/parts.md).

Vor dem Bezahlen prüfen:

- **Lagerbestand.** JLCPCBs Bauteilliste zeigt, was nicht vorrätig ist. Der ESP32-P4 (U201) ist bei JLCPCB
  und LCSC nicht vorrätig und muss vor der Bestückungsbestellung in JLCPCBs Bauteillager gekauft werden.
  Ab einigen hundert Platinen reichen auch PoE-Modul, PN532, ESP32-C5-Modul, LIS2DH12, DC-Buchse und
  L103/L201 nicht ([Bauteile und Beschaffung](hardware/touch-p4/parts.md)). JLCPCBs "Do not place" für ein
  fehlendes Bauteil taugt nur für ein Angebot, nie für eine Bestellung.
- **DC-Klemme J103.** Die WAGO 250-202 hat zwei Pins, das Footprint vier Löcher (es nimmt auch die
  WAGO 2601-3102 auf). Bestellbemerkung: Pins im oberen linken und im unteren rechten Loch, Kabeleinführung
  zum Platinenrand mit den beiden abgeschnittenen Ecken. Die Fertigungszeichnung zeigt den Umriss des Körpers.
- **Rotation.** Die Bestückungsdateien tragen JLCPCBs Winkel, wo er von KiCads abweicht
  (`JLC_ROTATION` in `scripts/export_fab.py`: U501, U701, U702, U204, U703, Q101, Q102, Q701, die
  Widerstandsarrays, D105). `check-footprints` ordnet jedes Footprint über die Padnummern JLCPCBs Bibliothek
  zu, außer L102 (kein Bibliotheks-Footprint; zwei Pads, keine Polarität). Eine Bibliothek, die die Pins
  anders nummeriert, sieht es nicht: JLCPCBs Eintrag für die SS310 (D105) nummeriert die Anode mit 1, KiCad
  die Kathode, daher braucht D105 eine halbe Drehung, die die Pads allein nicht zeigen.
  Geprüft in JLCPCBs Bestückungsvorschau am 26. November 2026 (Polaritätsmarken gegen die Netze): D101,
  D103, D105 (nach der Korrektur), D106, D601, D709, C103, C120, BZ701 und U102 sitzen richtig; die LEDs,
  U107, U204, U302, U601, U703, U704 und Y501 nummerieren ihre Pins wie JLCPCBs Bibliothek. D107 ist
  bidirektional. **Vor jeder Bestellung jedes gepolte Bauteil erneut in der Vorschau prüfen:** eine neue
  Teilenummer oder eine Änderung in JLCPCBs Bibliothek kann ein Bauteil drehen, ohne dass eine Prüfung hier
  es bemerkt.

## Eine Revision freigeben

### Revisionsverlauf

Dieselben Zeilen stehen im Schriftfeld des Stammblatts (`HISTORY` in `scripts/bootstrap/build_sch.py`); ein
Test schlägt fehl, wenn beide voneinander abweichen. Revision A wurde noch nicht bestellt; dies sind die
datierten Stände ihres Designs.

| Revision | Datum | Änderung |
|---|---|---|
| A | 2026-11-15 | First design, generated from the circuit description |
| A | 2026-11-21 | Review: Ethernet jack, silkscreen, tamper sensors (accelerometer, hall switch, proximity) |
| A | 2026-11-22 | Six layers; checked against the datasheets: PN532 paste, DC input capacitors |
| A | 2026-11-24 | Simulated: NFC matching; ESP32-C6-MINI-1U with an antenna connector |
| A | 2026-11-25 | Industry review: core divider 499k, 3 kV barrier capacitors, schematic redrawn, TVS symbols |
| A | 2026-11-25 | Industry review: parts data and alternates, fab drawing, IPC-D-356 netlist, 3D models, land patterns of USB-C, ESP32-C6 and display connector |
| A | 2026-11-25 | Industry review: eFuse and ideal diodes on the 5 V rail, reset supervisor, damped DC input, TLV62569 3.3 V converter, test points, DC and PoE present to the firmware |
| A | 2026-11-25 | Industry review: layout rework (ESP32-P4 land pattern, decoupling, USB pair, impedance), 2.0 x 1.6 mm crystal, designators on the silkscreen, assembly drawing |
| A | 2026-11-25 | Wi-Fi module ESP32-C5-MINI-1 (2.4 and 5 GHz, PCB antenna) instead of the ESP32-C6-MINI-1U, with a 3.3 V converter of its own |
| A | 2026-11-27 | Tap tile: 16 LEDs in a ring round the NFC loop, the loop on the case centre line, the PN532 below the display, the fourth mounting hole left of the tile |
| A | 2026-11-27 | LED ring behind a current-limited switch (TPS2553, 232 to 306 mA) |

### Vor einer Bestellung

1. `check` läuft durch.
2. `check-footprints` läuft durch (braucht das Internet).
3. Jede Zeile der Stückliste der Variante ist bei JLCPCB vorrätig oder über dessen Bauteilbeschaffung bestellt.
4. Eine andere Person als der Autor liest den Schaltplan als PDF, die Fertigungs- und die Bestückungszeichnung,
   prüft die offenen Punkte unter [Bekannte Einschränkungen](hardware/touch-p4/limitations.md) und gibt frei:
   Ihr Name kommt in `CHECKED_BY` in `build_sch.py`, das ihn in jedes Schriftfeld einträgt. Erzeugen Sie den
   Schaltplan neu und committen Sie ihn.
5. Wenn sich seit der letzten Bestellung etwas geändert hat, ein neuer Revisionsbuchstabe: `REV` in
   `build_sch.py` (Schriftfelder), der Text `REV A` in `silk.py` (Bestückungsdruck) und eine Zeile in `HISTORY`.

### Die Bestellung und danach

- Laden Sie die Gerber-Zip sowie BOM und CPL der Variante hoch und füllen Sie das Bestellformular wie oben aus.
- Halten Sie die Bestellnummer von JLCPCB beim Commit fest, der die Bestellung festhält (in seiner Nachricht).
- Der Maintainer versieht diesen Commit mit dem Tag `touch-p4-rev-<letter>` (zum Beispiel `touch-p4-rev-A`);
  Werkzeuge und der Generator legen keine Tags an.
- Was die ersten Platinen zeigen, kommt in die Designnotizen, und was geändert werden muss, in die nächste Revision.
