# Eine Platinenrevision freigeben
<!-- llms-description: Wie eine Revision der Touch-P4-Platine freigegeben und bestellt wird und die datierten Stände der Revision A. -->

Wie eine Revision der Touch-P4-Platine vom Repository zur Bestellung kommt und wie sie
festgehalten wird, damit sich die Platinen im Feld auf ihre Dateien zurückverfolgen lassen.

## Maßgebliche Quelle

Die Schaltungsbeschreibung in `scripts/bootstrap/` (`design.py`, `circuit_core.py`,
`circuit_io.py`, die Skripte für Platzierung und Routing) ist die Vorlage. Die KiCad-Dateien in
`kicad/` und das Paket in `fab/jlcpcb/` werden daraus erzeugt und eingecheckt, damit
man sie ohne Ausführung eines Programms öffnen, prüfen und bestellen kann. Bearbeiten Sie die
KiCad-Dateien nicht von Hand: Der nächste Lauf des Generators überschreibt die Änderung, und `check` schlägt fehl,
wenn die KiCad-Dateien von dem abweichen, was der Generator liefert (siehe die [Übersicht](hardware/touch-p4/overview.md#arbeiten-am-design)).

## Revisionsverlauf

Dieselben Zeilen stehen im Schriftfeld des Hauptblatts (`HISTORY` in
`scripts/bootstrap/build_sch.py`); ein Test schlägt fehl, wenn beide voneinander abweichen. Revision A wurde
noch nicht bestellt: Dies sind die datierten Stände ihres Designs.

| Revision | Datum | Änderung |
|---|---|---|
| A | 2026-11-15 | Erstes Design, aus der Schaltungsbeschreibung erzeugt |
| A | 2026-11-21 | Review: Ethernet-Buchse, Bestückungsdruck, Manipulationssensoren (Beschleunigungssensor, Hall-Schalter, Näherungssensor) |
| A | 2026-11-22 | Sechs Lagen; gegen die Datenblätter geprüft: PN532-Lotpaste, DC-Eingangskondensatoren |
| A | 2026-11-24 | Simuliert: NFC-Anpassung; ESP32-C6-MINI-1U mit Antennenanschluss |
| A | 2026-11-25 | Industrie-Review: Kernteiler 499k, 3-kV-Sperrkondensatoren, Schaltplan neu gezeichnet, TVS-Symbole |
| A | 2026-11-25 | Industrie-Review: Bauteildaten und Alternativen, Fertigungszeichnung, IPC-D-356-Netzliste, 3D-Modelle, Land Patterns von USB-C, ESP32-C6 und Displayanschluss |
| A | 2026-11-25 | Industrie-Review: eFuse und ideale Dioden an der 5-V-Schiene, Reset-Supervisor, gedämpfter DC-Eingang, TLV62569-3,3-V-Wandler, Testpunkte, DC und PoE für die Firmware erkennbar |
| A | 2026-11-25 | Industrie-Review: Layout überarbeitet (ESP32-P4-Land-Pattern, Abblockung, USB-Paar, Impedanz), Quarz 2,0 x 1,6 mm, Bezeichner im Bestückungsdruck, Bestückungszeichnung |
| A | 2026-11-25 | WLAN-Modul ESP32-C5-MINI-1 (2,4 und 5 GHz, Platinenantenne) statt ESP32-C6-MINI-1U, mit eigenem 3,3-V-Wandler |

## Vor einer Bestellung

1. `pnpm nx run attractap-touch-p4-pcb:check` läuft durch: Tests, ERC, Netzliste gegen die
   Schaltungsbeschreibung, DRC mit Schaltplan-Abgleich, die Simulationen, und `fab/jlcpcb/`
   passt zur Platine.
2. `pnpm nx run attractap-touch-p4-pcb:check-footprints` läuft durch (es braucht das Internet).
3. Bestand: Jede Zeile der Stückliste der zu bestellenden Variante ist bei
   JLCPCB lieferbar oder wird über dessen Bauteilbeschaffung zugekauft (siehe „Sourcing risks“ in den
   Designnotizen).
4. Eine andere Person als der Autor liest den Schaltplan als PDF, die Fertigungszeichnung und
   die Bestückungszeichnung (`fab/`), prüft die offenen Punkte der Designnotizen und
   gibt frei: Ihr Name kommt in `CHECKED_BY` in `scripts/bootstrap/build_sch.py`,
   das ihn in jedes Schriftfeld einträgt. Erzeugen Sie den Schaltplan neu und committen Sie ihn.
5. Ein neuer Revisionsbuchstabe, wenn sich seit der letzten Bestellung etwas geändert hat: `rev` in den Schriftfeldern
   (`build_sch.py`), `REV` im Bestückungsdruck (`silk.py`) und eine Zeile in
   `HISTORY` in `build_sch.py` (sie ist der Revisionsverlauf auf dem Hauptblatt).

## Die Bestellung

- Laden Sie `fab/jlcpcb/attractap-touch-p4-gerbers.zip` sowie die BOM- und CPL-Dateien der
  Variante hoch und stellen Sie das Bestellformular so ein, wie die Tabelle der [Übersicht](hardware/touch-p4/overview.md#bestellen-bei-jlcpcb) es angibt (Lagenaufbau, Oberfläche,
  Impedanzkontrolle, Via-Füllung).
- Halten Sie die Bestellnummer von JLCPCB beim Commit fest: in der Commit-Nachricht des Commits, der
  die Bestellung festhält, oder in den Designnotizen.

## Nach der Bestellung

- Halten Sie den Commit, aus dem bestellt wurde, als Git-Tag `touch-p4-rev-<letter>` fest (zum
  Beispiel `touch-p4-rev-A`), auf dem Commit, der die gesendeten Dateien enthält. Der Maintainer
  legt den Tag an und pusht ihn; Werkzeuge oder der Generator legen ihn nicht an.
- Was die ersten Platinen zeigen, kommt in die Designnotizen, und was geändert werden muss, in
  eine neue Revision.
