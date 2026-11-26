# Designstandards und Review-Kriterien
<!-- llms-description: Die Standards, die Notenskala, die Kriterien je Punkt, die Layout-Regeln und die Review-Methode, an denen das Touch-P4-Design gemessen wird, mit seinen aktuellen Noten. -->

Die Standards, nach denen die Touch-P4-Platine entworfen und geprüft wird, für Hardware-Entwickler.
Mit dieser Seite wird das nächste Review durchgeführt und die nächste Revision benotet. Andere Seiten
zitieren ihre Punkte mit Nummer („Punkt 5.3“). Die Kriterien hier verbessern, wenn ein Review eine Lücke
zeigt.

## Grundregeln

Projektregeln, die für jede Änderung und jedes Review gelten:

- **Der Generator ist die Quelle der Wahrheit.** Jede Änderung läuft über `scripts/bootstrap/`. Die
  KiCad-Dateien sind seine Ausgabe; `check-source` schlägt fehl, wenn sie davon abweichen.
- **Bauteile nur auf einer Seite.** Alle Bauteile sitzen auf der Bestückungsseite. Eine zweite
  Bestückungsseite kostet zu viel; Ziele, die sie bräuchten, werden zu Abweichungen.
- **Abweichungen statt Erzwingen.** Ein Ziel, das sich nicht zu vertretbaren Kosten erreichen lässt,
  behält seine niedrigere Note und bekommt einen Eintrag unter
  [Bekannte Einschränkungen](hardware/touch-p4/limitations.md): Ziel, Erreichtes, warum es dort endet,
  Abhilfe und was eine spätere Revision tun könnte. Eine dokumentierte Abweichung wird nicht erneut
  beanstandet.
- **Erfüllen, was die Platine zulässt.** Eine Regel aus dem Layout-Leitfaden eines Herstellers wird
  erfüllt, wo immer die Platine es zulässt. Nur der Teil, der sich nicht erfüllen lässt, wird mit
  Begründung zur Abweichung.
- **Nur echte Bauteile.** Keine ungeprüften Klone. Ein Bauteil gilt nur dann als verfügbar, wenn JLCPCB
  oder LCSC es auf Lager haben oder ein Beschaffungsplan existiert.
- **Primärquellen für jede Aussage.** Datenblätter, die Land-Pattern-Zeichnungen der Hersteller, der Text
  der Normen, das Amtsblatt der EU, ETSI-Dokumente und die Zertifikate der Hersteller. Die eigenen
  Notizen des Repositorys sind Hinweise, kein Beleg.
- **ERC und DRC mit den Standard-Schweregraden von KiCad.** In der Projektdatei wird keine Regel
  abgeschwächt oder ignoriert. `--severity-all` zählt Warnungen als Befunde.
- **Kosten werden je Platine bei 100 Stück gerechnet.** Änderungen mit Kosten haben eine ausdrückliche
  Obergrenze (Versorgungspfad: etwa 5 USD je Platine; Wechsel des WLAN-Moduls: etwa 2 USD mehr je
  Platine, Modul und Antenne lieferbar).

## Bewertung

| Note | Wert | Bedeutung |
|---|---|---|
| A | 4,0 | Was ein professionelles Design-Review ohne Anmerkungen besteht |
| A− | 3,7 | Besteht, mit kleinen Anmerkungen, die vor der Bestellung keine Änderung brauchen |
| B+ / B / B− | 3,3 / 3,0 / 2,7 | Gut, mit Lücken, die eine Korrektur lohnen |
| C+ / C / C− | 2,3 / 2,0 / 1,7 | Für einen Prototyp akzeptabel, mit echten Lücken |
| D+ / D | 1,3 / 1,0 | Muss überarbeitet werden |

Die Note eines Bereichs ist der Mittelwert seiner Punkte. Die Gesamtnote ist der Mittelwert der
Bereiche, gewichtet wie in der Überschrift jedes Bereichs unten angegeben.

**Ziel:** jeder Punkt mit A− oder besser, oder eine dokumentierte Abweichung.

## Kriterien je Bereich

Was jeder Punkt für A− erfüllen muss. Die Nummern der Punkte sind fest; nicht umnummerieren. Nummern,
die in einer Liste fehlen (zum Beispiel 1.1, 1.2), sind Punkte, die vom ersten Review an bei A− oder
besser lagen und noch kein geschriebenes Kriterium haben. Sie dürfen nicht schlechter werden; das
nächste Review sollte sie aufschreiben.

### 1. Schaltungskorrektheit (15 %)

Umfang: die Pins, Werte, das Versorgungsschema und die Strapping-Pins jedes ICs gegen die Unterlagen des
Herstellers.

- **1.3** Die Schaltplan-Checkliste des ESP32-P4 (HDG) buchstabengetreu befolgt. Für Chip-Revision v3.x
  gehört dazu das Kern-Rückkopplungsnetz mit 499 kΩ / 499 kΩ / 22 pF.

### 2. Spannungsversorgung und Schutz (12 %)

- **2.1 Reserve am DC-Eingang.** Die Simulation des Einsteckens unter Spannung liegt in der Spitze
  mindestens 5 V unter der Grenze des Wandlers, auch bei 24 V + 10 %. Die Abschaltspannung der TVS ist
  für diesen Bereich begründet. Der Stoß, den die anwendbare Norm verlangt, wird innerhalb der Nennwerte
  des Wandlers begrenzt.
- **2.2 Quellen-ODER-Verknüpfung.** Ideale Dioden oder ein Power-Mux statt Schottky-Dioden, ohne
  Rückspeisung in eine nicht angeschlossene Quelle.
- **2.3 USB-Einschaltstrom.** Höchstens 10 µF an VBUS beim Einstecken (USB 2.0 §7.2.4.1) oder ein
  anstiegsbegrenzter Anlauf, per Simulation gezeigt.
- **2.4 Leistungsbudget.** Worst Case je Schiene und je Quelle, mindestens 30 % Reserve an jedem Regler,
  und die Obergrenze der +5V-Schiene gegen die Grenze jeder 5-V-Last.
- **2.6 Brown-out.** Ein Supervisor an CHIP_PU, und das Umschalten zwischen Versorgungen im Betrieb,
  simuliert.

### 3. Lesbarkeit des Schaltplans (10 %)

- **3.2 Signalfluss.** Leitungen innerhalb jedes Blocks, von links nach rechts fließend; Versorgungen
  nach oben, Masse nach unten; Labels nur zwischen Blöcken und für Busse.
- **3.3 Text.** Ein Überlappungs-Lint, der Pinnamen und -nummern, Felder gegen Symbolgrafiken und freien
  Text gegen Blattsymbole, Pins und Labels auf jedem Blatt (auch dem Stammblatt) abdeckt und null meldet.
  Jedes Blatt gedruckt lesbar.
- **3.4 Symbole.** Jedes Symbol nach dem verbauten Bauteil benannt; TVS-Dioden als TVS gezeichnet.
- **3.6 Schriftfeld.** Datum, gezeichnet von, geprüft von und eine Revisionshistorie.
- **3.7 Werte.** Kondensatoren mit Spannung und Dielektrikum; Widerstände mit Toleranz, wo sie zählt.

### 4. Bauteile und Stückliste (8 %)

- **4.1 Bauteilwahl.** Ein Lebenszyklusstatus, mit Quelle, für jeden IC und jedes Modul.
- **4.2 Verfügbarkeit.** Eine benannte, geprüfte Alternative für jedes Bauteil, bei dem sekundäre
  Kennwerte zählen (TVS, Sicherungen, Ferrite, Induktivitäten, Quarze, Dioden, ICs), und ein
  Beschaffungsplan für nicht lieferbare Bauteile.
- **4.3 Stückliste.** Hersteller, Teilenummer, vollständige Beschreibung und Alternative in jeder Zeile,
  in beiden Varianten.
- **4.4 Footprints.** Die kritischen Land Patterns gegen die Zeichnungen der Hersteller geprüft und
  dokumentiert. Toleranz: innerhalb von 0,05 mm gilt als Übereinstimmung; ein Pad, das um bis zu etwa
  0,2 mm länger oder verschoben ist und den Anschluss noch abdeckt, ist akzeptabel; ein falscher Raster,
  eine falsche Pin-Reihenfolge oder Lochposition ist ein Fehler.
- **4.5 3D-Modelle.** Jeder Footprint hat eines, und die Passung ins Gehäuse ist damit geprüft.

### 5. Lagenaufbau und Layout (15 %)

- **5.2 Routing.** Kritische Netze bereinigt oder von Hand geroutet. USB als gekoppeltes Paar mit
  gleicher Via-Anzahl und höchstens 1 mm Unterschied. Jeder Bus erfüllt die Layout-Regeln seines
  Herstellers (für den SDIO-Bus des WLAN-Moduls: ESP32-C5 HDG 1.4.9, siehe
  [Layout-Regeln](#layout-regeln)).
- **5.3 Abblockung.** Kupferweg vom Pin zum Kondensator höchstens 3 mm an den vorrangigen Schienen
  (VDD_HP, VDD_PSRAM, VDD_FLASH, VDDO_4, VDD_USBPHY, VDD_BAT, VDD_LDO, VDD_DCDCC, VDD_ANA), höchstens
  5 mm an den 3,3-V-I/O-Pins; 10 µF nahe VDD_LDO und VDD_DCDCC.
- **5.4 Schaltwandler.** Die Hot Loop jedes Wandlers gemessen und aufgeschrieben.
- **5.5 Quarz.** Leiterbahnen des MCU-Quarzes höchstens 5 mm je Bahn.
- **5.6 Impedanz.** USB 90 Ω und Ethernet 100 Ω differenziell, die Breiten aus dem eigenen Rechner der
  Fertigung, und Impedanzkontrolle in der Bestellung.

### 6. Fertigung (7 %)

- **6.1 DRC.** 0 Fehler und 0 Warnungen mit den Standard-Schweregraden von KiCad.
- **6.2 Reserven.** Nichts an der Grenze der Fertigung, außer das Bauteil erzwingt es; jeder Fall gegen
  die veröffentlichten Grenzen der Fertigung aufgeschrieben.
- **6.4 Fertigungsunterlagen.** Eine Fertigungszeichnung und eine IPC-D-356-Netzliste im Paket.

### 7. Bestückung und Bestückungsdruck (8 %)

- **7.2 Fiducials.** Ein lokales Paar am MCU mit 0,35 mm Raster.
- **7.3 Rotationen.** `check-footprints` besteht für jedes Bauteil.
- **7.6 Bezeichner.** Jedes Bauteil außer einem kleinen passiven (U, Y, L, FB, D, Q, J, SW, F, RN, BZ)
  trägt seinen Bezeichner im Bestückungsdruck. Ein Test erzwingt das.
- **7.7 Bestückungszeichnung.** Nur Bezeichner, lesbar, mit Detailblättern der dichten Bereiche.

### 8. Test und Inbetriebnahme (5 %)

- **8.1 Testpunkte.** An jeder Schiene, an beiden I²C-Bussen und am RMII-Takt, jeder mit seinem Netz
  beschriftet.

### 9. EMV, Funk und Sicherheit (10 %)

- **9.1 ESD.** Eine Tabelle je Anschluss mit dem angestrebten Pegel nach IEC 61000-4-2 und dem Bauteil,
  das ihn liefert.
- **9.3 Funk.** Die Antenne, mit der das Modul zertifiziert wurde. Eine Leiterplattenantenne erfüllt die
  Platzierungsregeln des Herstellers (für den ESP32-C5: HDG 1.4.7) oder hat eine Abweichung; eine externe
  Antenne steht in den Stücklisten, mit einem Platz im Gehäuse und eingezeichnetem Kabelweg.
- **9.4 PoE-Isolation.** Barrierekondensatoren, ausgelegt für die Isolationsprüfung nach IEEE 802.3, und
  3 mm Abstand zu 48-V-Kupfer auf jeder Lage und durch die Platine.
- **9.6 Konformität.** Jede Aussage gegen eine Primärquelle geprüft und zitiert.

### 10. Verifikation (5 %)

- **10.3 Simulationen.** Die wichtigsten Ergebnisse mit einer unabhängigen Referenz gegengeprüft.

### 11. Prozess und Dokumentation (5 %)

- **11.2** Eine einseitige Spezifikation ([Spezifikation](hardware/touch-p4/spec.md)).
- **11.3** Eine einzige Quelle der Wahrheit, mit einer Prüfung, die fehlschlägt, wenn die KiCad-Dateien
  von der Ausgabe des Generators abweichen.
- **11.4** Eine Revisionshistorie, die zum Schriftfeld passt, und ein Freigabeablauf.

## Layout-Regeln

Die Regeln, die der Generator setzt und die das Layout erfüllen muss. Was die geroutete Platine
erreicht, steht unter [Design](hardware/touch-p4/design-notes.md).

Netzklassen (`scripts/bootstrap/board_setup.py`, mm):

| Klasse | Leiterbahn | Abstand | Netze |
|---|---|---|---|
| Default | 0,15 | 0,127 | Signale |
| Power | 0,25 | 0,127 | 3,3 V, Kernschiene, kleine Versorgungsschienen |
| Power5V | 0,5 | 0,15 | 5-V-Schienen, die Schaltknoten des 5-V-Wandlers, die 3,3 V des WLAN-Moduls |
| DCIN | 0,6 | 0,25 | DC-Eingang bis zum Wandler (bis 28 V) |
| DCSig | 0,25 | 0,2 | Enable und Bootstrap des DC-Wandlers |
| VBUS | 0,6 | 0,127 | USB-VBUS (die USB-C-Pads liegen 0,2 mm auseinander) |
| PoE | 0,6 | 0,3, und 3 mm zu jedem anderen Netz (eigene Regel) | 48-V-Seite |
| NFC_RF | 0,3 | 0,127 | Sender zur Antenne |
| USB | 0,14, Abstand 0,15 | 0,127 | USB-Daten, gekoppeltes Paar, 90 Ω |
| MDI | 0,155, Abstand 1,115 | 0,127 | Ethernet-Paare, 50-Ω-Leitungen, 100-Ω-Paar |

Weitere Regeln:

- **Leiterbahnen.** Minimum 0,11 mm (die Verengungen des Autorouters an Pins mit feinem Raster; Grenze
  der Fertigung 0,09 mm), nach dem Routing wo möglich auf 0,127 mm verbreitert. `post_route.py`
  verbreitert Versorgungsleiterbahnen so weit, wie das Kupfer daneben es erlaubt: in Richtung 0,6 mm
  (Kernschiene), 0,5 mm (3,3 V), 0,8 mm (5 V) und 0,4 mm (übrige Versorgungen).
- **Vias.** Mindestens 0,45 mm Pad, 0,2 mm Bohrung (die kleinste ohne Aufpreis); 0,5 mm Pad, wo Platz
  ist. Bauteilloch zu Via-Loch mindestens 0,45 mm (eigene Regel).
- **Platinenrand.** Kupfer mindestens 0,3 mm vom Platinenrand und von gefrästen Ausschnitten.
- **PoE.** 3 mm von 48-V-Kupfer zu jedem anderen Kupfer, auf jeder Lage und durch die Platine. Kein
  Kupfer auf irgendeiner Lage im Barriereband des PoE-Moduls (Silvertel Ag9900, Abb. 23).
- **Masse.** Jedes Massepad hat ein Via in die Massefläche oder eine Leiterbahn zu einem Pad, das eines
  hat; Masse hängt nicht von den äußeren Füllungen ab. Auf den Flächen In1, In3 und In4 läuft keine
  Leiterbahn.
- **Rückstrompfade.** Ein Masse-Via neben jedem Via eines schnellen Signals (RMII, SDIO, USB,
  Ethernet-Paare), wo Platz ist. Stitching-Vias alle 5 mm, alle 2,5 mm entlang der Oberkante und um das
  WLAN-Modul.
- **Abblockung und Quarz.** Punkte 5.3 und 5.5. Für den Quarz außerdem ESP32-P4 HDG 1.4.2: mindestens
  4,5 mm von den Takt-Pins, keine Vias in den Taktleitungen, Lastkondensatoren am fernen Ende, kein Signal
  unter dem Quarz.
- **SDIO zum WLAN-Modul** (ESP32-C5 HDG 1.4.9). Befehl und Daten innerhalb von 1,27 mm (50 mil) der
  Länge des Takts, höchstens 50,8 mm (2000 mil), 50 Ω ±10 %, kein Lagenwechsel, eine ungeteilte
  Bezugsfläche, Massekupfer rund um den Takt.
- **Impedanz.** USB 90 Ω ±15 % (USB 2.0), Ethernet 100 Ω ±15 % (100BASE-TX). Die Bestellung verlangt
  Impedanzkontrolle auf ±10 %.
- **Schaltwandler.** Eingangskondensator direkt an den Pins VIN und GND, kleiner Schaltknoten.
- **Löten.** Wärmefallen (0,25 mm, 0,2 mm Spalt) an zweipoligen 0402- und 0603-Bauteilen gegen
  Tombstoning. Kein Via-Loch unter Lotpaste, außer gefüllten und überdeckelten Vias in Pads. Paste auf
  freiliegenden Pads als Raster von Fenstern, nicht als eine Öffnung.
- **Bestückungsdruck.** Text 1,0 mm hoch, 0,15 mm Linien. Kein Text auf einem Pad (0,15 mm), auf einem
  anderen Text oder innerhalb von 0,3 mm vom Platinenrand; 0,35 mm zwischen Bezeichnern.

## Review-Methode

1. **Einen Commit prüfen, keinen Arbeitsstand.** Ein `git archive` des zu prüfenden Commits nehmen und
   jede Prüfung darauf im Docker-Image `kicad10-np` (KiCad 10) ausführen, sodass nichts Uncommittetes
   als geprüfter Stand durchgeht.
2. **Die Prüfungen ausführen.** ERC, DRC, Netzliste, Quelle, Paket, Simulationen und Footprints (siehe
   [Das Review ausführen](#das-review-ausführen)).
3. **Lesen, nicht nur prüfen.** Jedes Schaltplanblatt mit 200 dpi rendern und Block für Block lesen.
   Bestückungsdruck, Bestückungszeichnung und Kupferlagen plotten und ansehen.
4. **Das Layout messen.** `scripts/layout_report.py` misst den Kupferweg von jedem
   MCU-Versorgungspin zu seinem Kondensator, die Längen von Quarz und schnellen Netzen, Vias und
   Hot-Loop-Flächen. `scripts/fab_margins.py` vergleicht die kleinsten Strukturen mit den
   veröffentlichten Grenzen von JLCPCB.
5. **Jede Aussage gegen eine Primärquelle prüfen.** Die
   [CE- und Marktcheckliste](hardware/touch-p4/compliance.md) Aussage für Aussage prüfen und danach
   unabhängig anhand derselben Art von Quellen stichprobenartig kontrollieren.
6. **Jeden Punkt benoten**, gegen die Kriterien oben. Punkte unter A− und neue Abweichungen unter
   [Bekannte Einschränkungen](hardware/touch-p4/limitations.md) festhalten.

Ein Review auf dem Papier beurteilt das Design; der [Inbetriebnahmeplan](hardware/touch-p4/bring-up.md)
bestätigt es an der Hardware.

## Bekannte Fallstricke

Diese im nächsten Review zuerst prüfen:

- Ein bestandener Lint ist kein Beweis. Die Blätter rendern und ansehen; ein Lint findet nur, was er
  prüft.
- Wer eine Diode entfernt, entfernt auch ihren Spannungsabfall. Prüfen, welcher Spannung die Schiene dann
  folgt (hier: bis zur Abschaltung der eFuse, über der Grenze einiger Lasten).
- Die Klemmspannung einer TVS-Diode bei ihrem Nennstrom kann die Nennwerte des geschützten Bauteils
  übersteigen. Klären, welche Stoßprüfung gilt, dann die Klemmung bei dem Strom prüfen, den diese Prüfung
  treibt.
- Die Pin-*Funktionen* eines ICs prüfen, nicht nur seine Gehäusezeichnung, bevor Pins offen bleiben.
- Jeder Kondensator am Ausgang eines Wandlers zählt zu dessen Stabilitätsgrenze, auch die an den Lasten
  und die eigenen Kondensatoren eines Moduls.
- Eine Quelle, die weniger Strom bietet, als die Platine ziehen kann, braucht eine Regel (hier: der reine
  USB-Modus).
- Neue Testpunkte brauchen Beschriftungen.
- Neue hohe Bauteile brauchen eine neue Passungsprüfung gegen das Gehäuse und das Flexkabel des Displays.
- Konformität: EN 50130-4 wird unter der EMV-Richtlinie zitiert, nicht unter der RED. Die
  Einschränkungshinweise zu EN 301 489-3/-17 bedeuten, dass der Prüfplan objektive Bestehenskriterien
  festlegen muss. Das Zertifikat eines Funkmoduls gibt dem Host keine EMV-Anrechnung.
- Ein Textblock, der mit jeder Revision wächst, braucht reservierten Platz und einen Lint gegen alles in
  seiner Nähe.
- Eine Layout-Regel des Herstellers wird nicht mit einer Abschätzung wegdiskutiert (siehe
  [Grundregeln](#grundregeln)).
- Eine Aussage über die geroutete Platine wird an der gerouteten Platine gemessen, nicht aus den Notizen
  übernommen.
- Pads, die nach Nummer passen, beweisen keine Polarität. Eine Bibliothek kann die Anode einer Diode mit 1
  nummerieren, wo KiCad die Kathode mit 1 nummeriert (die SS310, D105). Die Pinnamen jedes gepolten Bauteils
  mit dem Bibliothekseintrag seiner Teilenummer vergleichen und die Polaritätsmarken in JLCPCBs
  Bestückungsvorschau ansehen.

## Aktuelle Noten

Stand November 2026, Revision A. Die Noten wurden der Platine mit dem ESP32-C6-MINI-1U gegeben.
Bereich 9 (EMV, Funk) und die Punkte, die der Wechsel auf das ESP32-C5-MINI-1 berührt hat (2.4, 4.1 bis
4.4, 5.2, 9.3), müssen im nächsten Review neu benotet werden.

| # | Bereich | Gewicht | Note |
|---|---|---|---|
| 1 | Schaltungskorrektheit | 15 % | A |
| 2 | Spannungsversorgung und Schutz | 12 % | A |
| 3 | Lesbarkeit des Schaltplans | 10 % | A− |
| 4 | Bauteile und Stückliste | 8 % | A− |
| 5 | Lagenaufbau und Layout | 15 % | B+ |
| 6 | Fertigung | 7 % | A− |
| 7 | Bestückung und Bestückungsdruck | 8 % | A− |
| 8 | Test und Inbetriebnahme | 5 % | A− |
| 9 | EMV, Funk und Sicherheit | 10 % | A− |
| 10 | Verifikation | 5 % | A− |
| 11 | Prozess und Dokumentation | 5 % | A |
| | **Gesamt** | | **A− (3,75)** |

Punkte unter A−, jeweils mit ihrem Eintrag unter [Bekannte Einschränkungen](hardware/touch-p4/limitations.md):

| Punkt | Note | Erreicht |
|---|---|---|
| 5.3 MCU-Abblockung | C+ | 4 von 21 Versorgungspins im Ziel |
| 5.5 Quarz-Leiterbahnen | B+ | 6,5 / 6,8 mm |
| 9.3 Funk | B | Für die externe Antenne des C6 benotet; für die Leiterplattenantenne des C5 neu benoten |

Punkte bei A−, die auch einen Abweichungseintrag haben: 2.4 (reine USB-Versorgung auf 500 mA begrenzt),
6.2 (fünf Merkmale an der Grenze der Fertigung), 7.6 (kleine Passivbauteile nur in der
Bestückungszeichnung) und 9.1 (LED-Fenster, Summer, Verschlussschrauben). Punkt 5.2 hat eine Abweichung
für den SDIO-Bus (zwei Lagenwechsel je Leitung), nach der Benotung hinzugekommen.

## Das Review ausführen

```bash
pnpm nx run attractap-touch-p4-pcb:check              # test, check-source, erc, check-netlist, drc, simulate, check-package
pnpm nx run attractap-touch-p4-pcb:check-footprints   # needs the internet

# in apps/attractap/hardware/touch-p4:
python3 scripts/layout_report.py fab/reports/board.json            # decoupling paths, crystal, fast nets, hot loops
python3 scripts/fab_margins.py kicad/attractap-touch-p4.kicad_pcb  # KiCad's Python (pcbnew); smallest features against JLCPCB's limits
```

`fab/reports/board.json` wird vom Ziel `simulate` geschrieben (`sim/dump_board.py`). Das Antennenmodell
läuft getrennt: `pnpm nx run attractap-touch-p4-pcb:simulate-antenna`, mit `OPENEMS_PYTHON` auf ein
Python gesetzt, das openEMS hat (siehe [Simulationen](hardware/touch-p4/simulations.md)).
