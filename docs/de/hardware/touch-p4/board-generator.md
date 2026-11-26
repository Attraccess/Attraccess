# Platinengenerator
<!-- llms-description: Der Python-Generator, der Bibliothek, Schaltplan und Platine der Touch P4 aus einer einzigen Schaltungsbeschreibung schreibt, und wie man seine Schritte ausführt. -->

Die Skripte in [`scripts/bootstrap/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/scripts/bootstrap) im Projektordner der Platine bauen das KiCad-Projekt aus einer einzigen Schaltungsbeschreibung. Sie sind das
Original: Jede Änderung an Schaltung, Schaltplan oder Platine wird hier gemacht, und
die KiCad-Dateien werden neu erzeugt (`tools/pcb.sh generate-library | generate-schematic
| place | route-finish`). Die KiCad-Dateien werden nicht von Hand bearbeitet.

**Sie überschreiben Schaltplan und Platine.** Jeder Schritt hält in
`kicad/generated-from.json` fest, was er geschrieben hat; `scripts/check_source.py` (das Ziel `check-source`)
schlägt fehl, wenn eine KiCad-Datei davon abweicht oder wenn sich der Generator geändert hat, nachdem
die Dateien geschrieben wurden. Kommentare und Docstrings zählen nicht als Änderung.

| Datei | Zweck |
|---|---|
| `design.py` | Die Schaltungsbeschreibung: Bauteilmodell, Teilenummern der Passiven und `build()`. |
| `circuit_core.py`, `circuit_io.py` | Jedes Bauteil, Blatt für Blatt, mit Wert, Footprint, LCSC-Nummer, Variante, Gruppe und dem Netz an jedem Pin. |
| `libs.py` | Liest Symbol- und Footprint-Bibliotheken und prüft jedes Bauteil gegen beide. |
| `make_lib.py` | Baut `kicad/lib/` aus LCSC/EasyEDA-Konvertierungen, erzeugt den Footprint der NFC-Antenne und das dreiteilige ESP32-P4-Symbol und öffnet die Lotpaste auf den freiliegenden Pads von ESP32-P4, Ethernet-PHY und PN532 als Fenster. `derived_symbols()` zeichnet die Symbole, die der Konverter oder KiCads Bibliothek falsch gezeichnet oder nach einem anderen Bauteil benannt hat (siehe "Schaltplanzeichnung"). `--refit` wendet seine Korrekturen und die abgeleiteten Symbole erneut auf die Bibliothek im Projekt an. |
| `build_sch.py` | Schreibt den hierarchischen Schaltplan (Stammblatt + ein Blatt je Block), mit Schriftfeldern und der Revisionshistorie. Schlägt fehl, wenn der Überlappungs-Lint etwas findet. |
| `sch_power.py`, `sch_mcu.py`, `sch_periph.py`, `sch_io.py` | Die Zeichnung jedes Blatts: wohin jedes Bauteil eines Funktionsblocks kommt und die Leitungen dazwischen (siehe "Schaltplanzeichnung" unten). `sch_layouts.py` ordnet ihnen die Blätter zu und wählt das kleinste Papier, das ein Blatt fasst. |
| `sch_draw.py`, `sch_finish.py` | Die Zeichen-Engine: Symbole, Leitungen, Labels und Versorgungssymbole; Schließen der Pins, die ein Layout offen lässt; die Konnektivitätsprüfung und der Überlappungs-Lint. |
| `geometry.py` | Platinenumriss, Displayposition, Schlitz, Antennen- und LED-Positionen. |
| `placement.py` | Position und Rotation jedes Bauteils. |
| `build_pcb.py` | Baut die Platine (`place`), exportiert und importiert die Austauschdateien des Autorouters (`dsn`, `ses`), füllt die Kupferflächen (`finish`). |
| `board.py` | Pfade, Koordinatenhelfer und der `Board`-Wrapper um pcbnew, den die Builder-Module gemeinsam nutzen. |
| `board_setup.py` | Umriss, Kupferflächen und Sperrflächen, Massepads für das Display, Designregeln, Netzklassen, Projektdatei. |
| `silk.py` | Der Bestückungsdruck beider Seiten: Logo aus den Vektordateien in `case/logo/`, Beschriftungen, die GPIO-Übersicht (aus `circuit_core.P4_GPIO`), Hinweise. Prüft, dass kein Text auf einem Pad, auf einem anderen Text oder außerhalb der Platine liegt. |
| `routes_mcu.py` | Feste Leiterbahnen am MCU: Versorgungs-Vias, der Fan-out aller vier Seiten, der Flash, der Displaybus und die NFC-Hostsignale am PN532. |
| `routes_board.py` | Feste Leiterbahnen an anderen Stellen: 48-V-Netze, Ethernet-Paare, Antennenzuleitungen, DC-Eingang mit seinem Filter, Summer, LED-Verbindung, Masse-Vias und der Via-Fan-out der Versorgungspads. |
| `routes_sdio.py` | Der SDIO-Bus zwischen MCU und WLAN-Modul, von Hand angelegt: Bahnen auf der Rückseite, Serpentinen, die alle sechs Leitungen gleich lang machen (Espressifs HDG 1.4.9), und die Masse-Vias an seinen Lagenwechseln. |
| `routes_wifi.py` | Der eigene 3,3-V-Wandler des WLAN-Moduls: Eingangsschleife, Schaltknoten, Ausgang in den 3V3-Pin des Moduls, Rückkopplung, Enable. |
| `copper_path.py` | Der Kupferweg zwischen zwei Pads eines Netzes ohne seine Stichleitungen; `scripts/layout_report.py` und `sim/si.py` messen damit die SDIO-Leitungen. |
| `finish_route.py` | Gitter-Router, der die Verbindungen schließt, die der Autorouter offen lässt, auch die Masse- und 3,3-V-Pads, die von ihren Kupferflächen abgeschnitten sind. |
| `route_grid.py` | Seine Engine: Hindernisraster, Netzkonnektivität, Pfadsuche, Umwandlung in Leiterbahnen und Vias. |
| `post_route.py` | Nach dem Routen: verbreitert Versorgungsleiterbahnen und Engstellen, vergrößert Via-Pads, setzt neben das Via jedes schnellen Signals ein Masse-Via sowie Stitching-Vias. Mit `--fix` liest es KiCads Design Rule Check und nimmt alles zurück, was Teil einer Verletzung ist. |
| `check_overlap.py` | Meldet überlappende Bauteilkörper. |
| `check_netlist.py` | Vergleicht eine von KiCad exportierte Netzliste mit `design.py`. Listet die Geräte und Adressen an jedem I2C-Bus auf und schlägt bei einem Adresskonflikt fehl. |
| `sexpr.py` | Kleiner Leser/Schreiber für KiCads Dateiformat. |

## Schaltplanzeichnung

Jedes Blatt wird von einer Layout-Funktion gezeichnet, Block für Block. Ein Block ist eine Funktion der Schaltung (der
USB-Eingang, der Kernwandler, der NFC-Sendepfad); seine Bauteile werden von Hand platziert und durch Leitungen verbunden,
die von links nach rechts lesbar sind, Versorgungen zeigen nach oben und Masse nach unten. Labels verbinden Blöcke
miteinander und führen Busse (den RGB-Bus, RMII, SDIO, den Flash-Bus); innerhalb eines Blocks werden sie nicht verwendet.

`sch_finish.finish()` schließt, was ein Layout offen lässt: Versorgungspins bekommen ein Versorgungssymbol (Pins nebeneinander
teilen sich eines), andere Pins eine kurze Leitung mit Label, unbenutzte Pins ein No-Connect-Flag, und ein
Netz, das vollständig innerhalb eines Blocks verdrahtet ist, bekommt seinen Namen an einer seiner Leitungen, damit der Schaltplan
die Netznamen der Schaltungsbeschreibung behält. Danach:

- `check()` löst einen Fehler aus, wenn eine Leitung, ein Pin oder ein Label zwei Netze verbinden würde. Es behandelt als verbunden, was
  KiCad verbinden könnte (ein Pin oder ein Leitungsende auf einer anderen Leitung), ist also strenger als KiCad. Pins, die ein Symbol
  innerhalb des Bauteils verbindet (`jumper_pin_groups`, die Durchgangspins des USB-ESD-Bauteils), gelten als verbunden.
- `lint()` meldet Text auf Text, Text auf einem Symbol oder einer Leitung, Symbole auf Symbolen und Blockrahmen aufeinander, aus
  der Größe von KiCads Schrift. `build_sch.py` schlägt fehl, außer es meldet nichts.

Die Netzliste, die der Schaltplan ergibt, wird Pin für Pin gegen `design.py` geprüft (`check-netlist`); diese
Prüfung, nicht die Zeichnung, entscheidet, dass die Schaltung stimmt.

Symbole, die in `make_lib.derived_symbols()` gezeichnet werden, statt sie wie konvertiert zu übernehmen:

- nach dem verbauten Bauteil benannt, wo die Platine das Symbol eines anderen Bauteils verwendete: AP63205WU-7 (war als
  AP63203 gezeichnet), SN74LV1T125DBVR (74AHCT1G125), LIS2DH12TR (KiCads LIS2DE12, gleiche Pins), DRV5032FADBZR
  (KiCads DRV5033), ESP32-C6-MINI-1U-H4 (MINI-1-N4), PN5321A3HN; die TVS-Dioden verwenden das unidirektionale
  TVS-Symbol (`Diode:SMAJ5.0A`, `Diode:SMAJ58A`, `SMBJ26A` nach KiCads SM6T gezeichnet);
- zum besseren Lesen neu gezeichnet: die USB-C-Buchse und das USB-ESD-Bauteil (Pinnummern nicht mehr über den Pinnamen;
  die Durchgangspins des ESD-Bauteils sind eine Jumper-Gruppe), das PoE-Modul (Eingang links), die RJ45-Buchse
  (Pinnamen aus der Funktion der Buchse), die Wandler (Eingang links, Schaltknoten rechts), die LED, der
  Summer und der PN532 (Host links, Funk rechts, Versorgungen oben, Massen unten).

## Voraussetzungen

- KiCad 10 (`kicad-cli` und das Python-Modul `pcbnew`, mit numpy und Pillow)
- Java 25 oder neuer und [Freerouting](https://github.com/freerouting/freerouting) 2.5.0 für das Ziel
  `route`. Version 2.2.4 hängt sich auf dieser Platine auf.
- Python 3 mit [easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py) zum Abrufen von Bauteilen

`pnpm nx run attractap-touch-p4-pcb:setup-toolchain` prüft KiCad und lädt Freerouting nach
`.tools/kicad` herunter. `tools/kicad-env.sh` findet KiCad (PATH, macOS-App-Bundle oder nixpkgs unter NixOS) und
`tools/pcb.sh` enthält die Befehle hinter den Zielen.

## Schritte

```bash
# 1. fetch the LCSC parts once (symbols, footprints) into a scratch folder, then build kicad/lib
easyeda2kicad --lcsc_id C54540373 C5736265 ... --full --output /tmp/lcsc/lcsc
pnpm nx run attractap-touch-p4-pcb:generate-library -- /tmp/lcsc

# 1b. 3D models: fetch once into a cache folder (EasyEDA conversions, KiCad packages3D), store them
#     in kicad/lib/attractap.3dshapes and write lib_models.py; then attach them to the footprints
python3 scripts/bootstrap/collect_models.py /tmp/models --fetch
pnpm nx run attractap-touch-p4-pcb:generate-library -- --refit

# 2. schematic from the circuit description, then ERC and the netlist check
pnpm nx run attractap-touch-p4-pcb:generate-schematic

# 3. board: parts, zones, fixed vias and routes; reports overlapping parts
pnpm nx run attractap-touch-p4-pcb:place

# 4. routing: autorouter (about 10 minutes), grid router for what it leaves open (it stops at 15 to 25
#    open connections on this board), zone fill, pour links and clean-up, DRC
pnpm nx run attractap-touch-p4-pcb:route
```

`route` führt diese Schritte aus (`tools/pcb.sh`): `build_pcb.py dsn`, Freerouting, `build_pcb.py ses`,
`finish_route.py`, `build_pcb.py finish`, `finish_route.py --pours`, `build_pcb.py finish`,
`post_route.py`, `build_pcb.py finish`, `post_route.py --fix`, `build_pcb.py finish`, DRC.

Die Anzahl der Kupferlagen ist `COPPER_LAYERS` in `geometry.py`: 6, oder 4 für das erste Layout. Leiterbahnen laufen
auf F.Cu, In2 und B.Cu in beiden; nur die Flächen unterscheiden sich (siehe `board_setup.zones`).

Der Autorouter liefert nicht zweimal dasselbe Ergebnis, daher liegt sein Ergebnis in Git:
`kicad/attractap-touch-p4.ses`. Alles danach ist wiederholbar. So bauen Sie die eingecheckte Platine
aus den eingecheckten Dateien neu auf:

```bash
pnpm nx run attractap-touch-p4-pcb:place
pnpm nx run attractap-touch-p4-pcb:route-finish    # imports the .ses, finishes the routing, runs DRC
```

`route` ersetzt die `.ses` durch ein neues Autorouter-Ergebnis. Checken Sie die neue Datei zusammen mit der Platine ein,
zu der sie geführt hat.

### Änderungen nach dem Lauf des Autorouters

Die eingecheckte `.ses` ist älter als das Design-Review vom November 2026, das Bauteile verschoben, Netze geändert
und Bauteile hinzugefügt hat. Der Neuaufbau kommt damit ohne einen neuen
Autorouter-Lauf zurecht:

- Die Sitzungsdatei hält auch fest, wo jedes Bauteil war, und KiCad würde die Bauteile beim
  Import dorthin zurücksetzen. `build_pcb.py ses` importiert nur die Leiterbahnen.
- `build_pcb.py` hat zwei Listen, `STALE_NETS` und `STALE_PARTS`. Die Leiterbahnen des Autorouters für die Netze in
  der ersten werden nicht übernommen; sie haben jetzt feste Leiterbahnen in `routes_board.py`. Seine Leiterbahnen, die
  einem Pad eines Bauteils in der zweiten oder einem festen Via neben einem solchen Pad zu nahe kommen (die Versorgungs-Vias,
  die ein neues Bauteil bekommt, gehen durch jede Lage), werden entfernt, und `finish_route.py` routet sie neu.

- Über diese zwei Listen hinaus entfernt `build_pcb.py ses` jede Leiterbahn und jedes Via des Autorouters, das einem
  Pad, einem festen Via oder einer festen Leiterbahn eines anderen Netzes zu nahe kommt (`drop_collisions`), gemessen an den echten
  Pad-Umrissen. So lässt sich ein Bauteil verschieben oder eine feste Leiterbahn ändern, ohne die Listen anzufassen. Auf einer Platine,
  die sich seit dem Lauf des Autorouters nicht geändert hat, entfernt das nichts.
- Die Sitzung nennt ihre Vias nach den vier Lagen, die der Autorouter sah. Auf der Sechs-Lagen-Platine hält KiCad sie
  für vergrabene Vias; der Import macht sie wieder zu durchgehenden Vias.

Wenn der Autorouter erneut läuft, leeren Sie beide Listen.

Erkenntnisse aus Revision A, falls der Generator wieder verwendet wird:

- Der Winkel eines Footprints in KiCad ist nicht immer der Winkel, den JLCPCB will: Er wird von dessen eigenem Bibliotheks-
  Footprint der Teilenummer aus gezählt. `tools/pcb.sh check-footprints` vergleicht beide für jedes Bauteil; die
  Korrekturen stehen in `scripts/export_fab.py`.
- Der Wert eines Keramikkondensators in der Stückliste ist sein Wert bei 0 V. Nehmen Sie den Wert bei der Betriebsspannung aus der Kurve des Herstellers: Die
  zuerst am 24-V-Eingang verbauten 10-uF-/50-V-Bauteile hatten dort 1,35 uF, und ihr großer Wert bei niedriger
  Spannung ließ den Eingang beim Einstecken eines Netzteils überschwingen.
- Ein thermisches Via, das mit einem konvertierten Footprint kommt, ist ein durchkontaktiertes Pad, kein Via: Prüfungen, die auf
  Vias schauen, sehen es nicht. Bei den vier des PN532 lag Lotpaste darauf (`test_design.py` sucht jetzt danach).
- Durchsteckbauteile ragen auf der Displayseite aus der Platine. Halten Sie sie, wo die Mechanik es erlaubt, von der Stelle
  hinter dem Display fern. Wo sie es nicht erlaubt (die Ethernet-Buchse), halten Sie 48-V-Pins neben der Metallrückseite des
  Displays und stellen Sie den Displayabstand für gekürzte Pins ein (`test_design.py` prüft beides).

- Feste Leiterbahnen müssen auf einem Pad oder einem Via enden, dürfen nur waagerechte, senkrechte und 45-Grad-Segmente verwenden und
  müssen an ihren Endpunkten auf andere Leiterbahnen treffen. Der Autorouter gibt bei einem Netz auf, das eine feste Leiterbahn
  mit offenem Ende oder ungeraden Winkel hat.
- Lassen Sie nur einen Autorouter gleichzeitig laufen. Zwei Instanzen blockieren sich gegenseitig.
- `finish_route.py` braucht Minuten bis eine Stunde. Wenn sich zwei Netze in seinem Log immer wieder gegenseitig auftrennen, hat
  diese Stelle zu wenig Platz: Sehen Sie sie sich an und korrigieren Sie die Platzierung oder fügen Sie eine feste Leiterbahn hinzu (die Fan-outs in
  `routes_mcu.py` sind so entstanden). Ein erneuter Lauf hilft nicht.
- Ein Versorgungs-Fan-out-Via vor einer Pad-Reihe kann eine Ausweichleiterbahn kosten. `plane_fanout` läuft zuletzt und
  hat eine kurze Liste von Pads, die anders gespeist werden.

Der Autorouter schreibt sein Ergebnis erst nach dem letzten Durchlauf eines Laufs, daher setzt `route` ihm ein Zeitlimit.
