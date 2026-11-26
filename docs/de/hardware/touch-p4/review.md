# Design-Review von Revision A
<!-- llms-description: Die Aufzeichnung des Design-Reviews der Touch P4: Noten, Kriterien, Entscheidungen und was das Review gefunden hat. -->

Das Review der Touch-P4-Platine nach Branchenpraxis, im Stand vom 25. November 2026
bei Commit `e4e83c0a`. Diese Seite hält fest, wie die Platine bewertet wurde, was
jede Note verlangt, welche Noten vor und nach den Korrekturen vergeben wurden und
welche Entscheidungen unterwegs getroffen wurden. Was jeder Befund am Design
geändert hat, steht in
[design-notes.md, "Branchen-Review"](hardware/touch-p4/design-notes.md#branchen-review). Die Ziele,
die die Platine nicht vollständig erreicht, stehen unter
[Akzeptierte Abweichungen](hardware/touch-p4/design-notes.md#akzeptierte-abweichungen).

Das WLAN-Modul wurde nach diesem Review erneut entschieden: siehe
[Entscheidungen](#entscheidungen), letzter Eintrag. Die Noten unten gelten für die Platine
mit dem ESP32-C6-MINI-1U.

## Wie die Platine geprüft wurde

- **Generator und Prüfungen.** Die Platine wird aus `scripts/bootstrap/` erzeugt;
  die KiCad-Dateien sind dessen Ausgabe, und `check-source` schlägt bei einer
  Handänderung fehl. Jede Prüfung lief im Docker-Image `kicad10-np`, auf einem
  `git archive` des geprüften Commits, sodass nichts Uncommittetes als geprüfter
  Stand durchgehen konnte.
- **ERC und DRC mit den Standard-Schweregraden von KiCad.** In der Projektdatei darf
  keine Regel abgeschwächt oder ignoriert werden. `--severity-all` zählt Warnungen
  als Befunde.
- **Lesen, nicht nur prüfen.** Jedes Schaltplanblatt wurde mit 200 dpi gerendert
  und gelesen. Bestückungsdruck, Bestückungszeichnung und Kupferlagen wurden
  geplottet und angesehen.
- **Layout-Messungen:** `scripts/layout_report.py` misst den Kupferweg von jedem
  MCU-Versorgungspin zu seinem Kondensator, die Längen von Quarz und schnellen
  Netzen, Vias und Hot-Loop-Flächen. `scripts/fab_margins.py` vergleicht die
  kleinsten Strukturen mit den veröffentlichten Grenzen von JLCPCB.
- **Primärquellen für jede Aussage.** Datenblätter, die Land-Pattern-Zeichnungen der
  Hersteller, der Text der Normen, das Amtsblatt der EU, ETSI-Dokumente und die
  Zertifikate der Hersteller. Die eigenen Notizen des Repositorys gelten als
  Hinweise, nicht als Beleg. `compliance.md` wurde Aussage für Aussage geprüft und
  danach unabhängig anhand derselben Art von Quellen stichprobenartig kontrolliert.
- **Nicht geprüft: Hardware.** Es war noch keine Platine aufgebaut. Die Noten
  bewerten das Design; der Inbetriebnahmeplan muss es bestätigen.

## Bewertung

| Note | Bedeutung |
|---|---|
| A | Was ein professionelles Design-Review ohne Anmerkungen besteht |
| A− | Besteht, mit kleinen Anmerkungen, die vor der Bestellung keine Änderung brauchen |
| B | Gut, mit Lücken, die eine Korrektur lohnen |
| C | Für einen Prototyp akzeptabel, mit echten Lücken |
| D | Muss überarbeitet werden |

Für die Gesamtnote zählen die Buchstaben als A = 4,0, A− = 3,7, B+ = 3,3, B = 3,0,
B− = 2,7, C+ = 2,3, C = 2,0, C− = 1,7, D+ = 1,3, D = 1,0. Sie werden je Bereich
gemittelt und gewichtet wie in der Tabelle unter [Noten](#noten).

**Ziel:** jeder Punkt mit A− oder besser. Wo sich ein Ziel nicht zu vertretbaren
Kosten erreichen lässt, behält der Punkt seine niedrigere Note, mit einem Eintrag
unter "Akzeptierte Abweichungen" in `design-notes.md`. Dieser Eintrag nennt das Ziel,
das Erreichte, den Grund, warum es dort endet, die Gegenmaßnahme und was eine
spätere Revision tun könnte. Eine dokumentierte Abweichung wird nicht erneut
beanstandet. (Entscheidung vom 25. November 2026.)

## Was A− für jeden Punkt verlangt

Nicht aufgeführte Punkte lagen von Anfang an bei A− oder besser und dürfen nicht
schlechter werden.

**Schaltung**
- 1.3: die Schaltplan-Checkliste des ESP32-P4 buchstabengetreu befolgt. Für Chip-Revision
  v3.x gehört dazu das Kern-Rückkopplungsnetz mit 499 kΩ / 499 kΩ / 22 pF.

**Spannungsversorgung**
- 2.1 Reserve am DC-Eingang: die Simulation des Einsteckens unter Spannung liegt
  mindestens 5 V unter der Grenze des Wandlers, auch bei 24 V + 10 %. Die
  Abschaltspannung der TVS-Diode ist für diesen Bereich begründet. Der Stoß, den
  die anwendbare Norm verlangt, wird innerhalb der Nennwerte des Wandlers begrenzt.
- 2.2 Quellen-ODER-Verknüpfung: ideale Dioden oder ein Power-Mux statt
  Schottky-Dioden, ohne Rückspeisung in eine nicht angeschlossene Quelle.
- 2.3 USB-Einschaltstrom: höchstens 10 µF an VBUS beim Einstecken (USB 2.0 §7.2.4.1),
  oder ein anstiegsbegrenzter Anlauf, per Simulation gezeigt.
- 2.4 Leistungsbudget: Worst Case je Schiene und je Quelle, mindestens 30 % Reserve
  an jedem Regler, und die Obergrenze der +5V-Schiene gegen die Grenze jeder
  5-V-Last.
- 2.6 Brown-out: ein Supervisor an CHIP_PU, und das Umschalten zwischen
  Versorgungen im Betrieb, simuliert.

**Schaltplan**
- 3.2 Signalfluss: Leitungen innerhalb jedes Blocks, von links nach rechts
  fließend; Versorgungen nach oben, Masse nach unten; Labels nur zwischen Blöcken
  und für Busse.
- 3.3 Text: ein Überlappungs-Lint, der auch Pinnamen und -nummern sowie Felder
  gegen Symbolgrafiken abdeckt und null meldet; jedes Blatt gedruckt lesbar.
- 3.4 Symbole: jedes Symbol nach dem verbauten Bauteil benannt, TVS-Dioden als TVS.
- 3.6 Schriftfeld: Datum, gezeichnet von, geprüft von und eine Revisionshistorie.
- 3.7 Werte: Kondensatoren mit Spannung und Dielektrikum, Widerstände mit Toleranz,
  wo sie zählt.

**Bauteile und Stückliste**
- 4.1 Bauteilwahl: ein Lebenszyklusstatus, mit Quelle, für jeden IC und jedes Modul.
- 4.2 Verfügbarkeit: eine benannte, geprüfte Alternative für jedes Bauteil, bei dem
  sekundäre Kennwerte zählen (TVS, Sicherungen, Ferrite, Induktivitäten, Quarze,
  Dioden, ICs), und ein Beschaffungsplan für nicht lieferbare Bauteile.
- 4.3 Stückliste: Hersteller, Teilenummer, vollständige Beschreibung und Alternative
  in jeder Zeile, in beiden Varianten.
- 4.4 Footprints: die kritischen Land Patterns gegen die Zeichnungen der Hersteller
  geprüft und dokumentiert.
- 4.5 3D-Modelle: jeder Footprint hat eines, und die Passung ins Gehäuse ist damit
  geprüft.

**Layout**
- 5.2 Routing: kritische Netze bereinigt oder von Hand geroutet; USB als gekoppeltes
  Paar mit gleicher Via-Anzahl und höchstens 1 mm Unterschied.
- 5.3 Abblockung: Kupferweg vom Pin zum Kondensator höchstens 3 mm an den
  vorrangigen Schienen (VDD_HP, VDD_PSRAM, VDD_FLASH, VDDO_4, VDD_USBPHY, VDD_BAT,
  VDD_LDO, VDD_DCDCC, VDD_ANA), höchstens 5 mm an den 3,3-V-I/O-Pins.
- 5.4 Schaltwandler: die Hot Loop jedes Wandlers gemessen und aufgeschrieben.
- 5.5 Quarz: Leiterbahnen des MCU-Quarzes höchstens 5 mm je Bahn.
- 5.6 Impedanz: USB 90 Ω und Ethernet 100 Ω differenziell, die Breiten aus dem
  eigenen Rechner der Fertigung, und Impedanzkontrolle in der Bestellung.

**Fertigung**
- 6.1 DRC: 0 Fehler und 0 Warnungen mit den Standard-Schweregraden von KiCad.
- 6.2 Reserven: nichts an der Grenze der Fertigung, außer das Bauteil erzwingt es;
  jeder Fall gegen die veröffentlichten Grenzen der Fertigung aufgeschrieben.
- 6.4 Fertigungsunterlagen: eine Fertigungszeichnung und eine IPC-D-356-Netzliste im
  Paket.

**Bestückung und Bestückungsdruck**
- 7.2 Fiducials: ein lokales Paar am MCU mit 0,35 mm Pitch.
- 7.3 Rotationen: `check-footprints` besteht für jedes Bauteil.
- 7.6 Bezeichner: jedes Bauteil außer einem kleinen passiven (U, Y, L, FB, D, Q, J,
  SW, F, RN, BZ) trägt seinen Bezeichner im Bestückungsdruck. Ein Test erzwingt das.
- 7.7 Bestückungszeichnung: nur Bezeichner, lesbar, mit Detailblättern der dichten
  Bereiche.

**Test**
- 8.1 Testpunkte: an jeder Schiene, an beiden I²C-Bussen und am RMII-Takt, jeder mit
  seinem Netz beschriftet.

**EMV, Funk und Sicherheit**
- 9.1 ESD: eine Tabelle je Port mit dem angestrebten Pegel nach IEC 61000-4-2 und
  dem Bauteil, das ihn liefert.
- 9.3 Funk: eine Antenne, mit der das Modul zertifiziert wurde, in den
  Stücklisten, mit einem Platz im Gehäuse und eingezeichnetem Kabelweg.
- 9.4 PoE-Isolation: Barrierekondensatoren, ausgelegt für die Isolationsprüfung nach
  802.3, und 3 mm Abstand zu 48-V-Kupfer auf jeder Lage und durch die Platine.
- 9.6 Konformität: jede Aussage gegen eine Primärquelle geprüft und zitiert.

**Verifikation und Prozess**
- 10.3 Simulationen: die wichtigsten Ergebnisse mit einer unabhängigen Referenz
  gegengeprüft.
- 11.2 Eine einseitige Spezifikation (`spec.md`).
- 11.3 Eine einzige Quelle der Wahrheit, mit einer Prüfung, die fehlschlägt, wenn die
  KiCad-Dateien von der Ausgabe des Generators abweichen.
- 11.4 Eine Revisionshistorie, die zum Schriftfeld passt, und ein Freigabeablauf.

## Noten

Erstes Review: 24. November 2026, Commit `268a00a6`. Endnoten: 25. November 2026,
Commit `e4e83c0a`.

| # | Bereich | Gewicht | Vorher | Nachher |
|---|---|---|---|---|
| 1 | Schaltungskorrektheit | 15 % | A− | A |
| 2 | Spannungsversorgung und Schutz | 12 % | B | A |
| 3 | Lesbarkeit des Schaltplans | 10 % | C+ | A− |
| 4 | Bauteile und Stückliste | 8 % | B− | A− |
| 5 | Lagenaufbau und Layout | 15 % | B | B+ |
| 6 | Fertigung | 7 % | B | A− |
| 7 | Bestückung und Bestückungsdruck | 8 % | B− | A− |
| 8 | Test und Inbetriebnahme | 5 % | B+ | A− |
| 9 | EMV, Funk und Sicherheit | 10 % | B− | A− |
| 10 | Verifikation | 5 % | B+ | A− |
| 11 | Prozess und Dokumentation | 5 % | B | A |
| | **Gesamt** | | **B (2,99)** | **A− (3,75)** |

**Punkte unter A−**, jeweils mit ihrem Eintrag unter "Akzeptierte Abweichungen":

| Punkt | Note | Erreicht | Warum es dort endet |
|---|---|---|---|
| 5.3 MCU-Abblockung | C+ (vorher C−) | 4 von 21 Versorgungspins im Ziel | 0,35 mm Pitch, und die Platine bleibt einseitig |
| 5.5 Quarz-Leiterbahnen | B+ (vorher B) | 6,5 / 6,8 mm, mit einem 2016-Quarz | Espressifs 4,5-mm-Abstandsregel und die NFC-Vias |
| 9.3 WLAN-Antenne | B (vorher C+) | Zertifizierte Antenne und ein Ersatz in den Stücklisten, Fach im Gehäuse | Die zertifizierte Antenne (100 mm) passt nicht in das Fach; der Ersatz braucht Funktests |

Diese Punkte stehen bei A−, sind aber auch als Abweichungen aufgeführt:
- 2.4: USB als einzige Quelle wird auf die 500-mA-Klasse begrenzt.
- 6.2: fünf Strukturen liegen an der Grenze der Fertigung.
- 7.6: kleine Passive stehen nur in der Bestückungszeichnung.
- 9.1: die LED-Fenster, der Summer und die Schlossschrauben.

## Entscheidungen

| Datum | Entscheidung | Warum |
|---|---|---|
| 24. Nov. | Der Generator bleibt die Quelle der Wahrheit; jede Änderung läuft über `scripts/bootstrap/` | Die eingecheckten KiCad-Dateien waren genau seine Ausgabe |
| 25. Nov. | ODER-Verknüpfung mit idealen Dioden (LM74700-Q1 + IRLML0030) und ein USB-eFuse (TPS259470A), 5,01 USD je Platine bei 100 Stück; Überspannungsdioden +0,2 USD | Obergrenze bei etwa 5 USD; nur echte Bauteile, keine ungeprüften Klone |
| 25. Nov. | Öffnungen in der Dock-Platte unter J401 und U102 statt eines tieferen Gehäuses | Behält die Optik; frei vom Lichtweg des Näherungssensors und vom Dock-Magneten |
| 25. Nov. | PN532 beibehalten, obwohl NXP ihn als nicht für Neuentwicklungen führt | Firmware und Protokoll passen zu den eingesetzten Lesern; Tokmas- und NXP-Teile sind gegenseitig Alternativen; Migration für Revision B vermerkt |
| 25. Nov. | MCU-Land-Pattern auf Espressifs Pads geändert | Der kritischste Footprint, und das Layout wurde ohnehin überarbeitet |
| 25. Nov. | USB als einzige Quelle: die Firmware wendet immer die 500-mA-Klasse an | Kein Weg für die CC-Leitungen zu einem ADC-Pin; die konservative Lesart derselben Regel |
| 25. Nov. | Kein Leitung-gegen-Leitung-Überspannungsschutz über die Normen hinaus; EN-50130-4-Pegel mit dem Labor zu klären | Für diese Portklasse nicht gefordert; er würde einen 60-V-Wandler brauchen |
| 25. Nov. | **Bauteile nur auf der Oberseite** (Anwender) | Eine zweite Bestückungsseite würde die Kosten zu stark erhöhen; die MCU-Abblockung wird zur Abweichung |
| 25. Nov. | **Nicht machbare oder teure Ziele werden zu akzeptierten Abweichungen** (Anwender) | Kosten vor einer einheitlichen Note |
| 25. Nov. | **WLAN: ESP32-C5 mit eigener Platinenantenne, das größere ESP32-C5-WROOM-1** (Anwender) | Dual-Band-Wi-Fi 6; interne Antenne akzeptiert; den Varianten mit externer Antenne fehlte ein Zertifikat oder sie passten nicht; siehe unten |
| 25. Nov. | **WLAN: das ESP32-C5-MINI-1-N4-V1.2 statt des WROOM-1** (Anwender) | Keine WROOM-1-Variante bei JLCPCB oder LCSC lieferbar; das MINI-1 ist zertifiziert (EU-Baumusterprüfbescheinigung 44024-05-2026-260268) und lieferbar; siehe unten |

### Das WLAN-Modul

Vorgabe des Anwenders: Auf den ESP32-C5 wechseln, wenn das Modul (und die Antenne,
falls vorhanden) bei 100 Stück höchstens etwa 2 USD mehr je Platine kostet und
beide lieferbar sind.

Das wurde am 25. November 2026 gefunden:
- **C5-MINI-1U** (externe Antenne): etwa +0,85 USD mit einer Dual-Band-Antenne,
  lieferbar. Für dieses Modul ist kein RED-, FCC- oder ISED-Zertifikat
  veröffentlicht.
- **C5-WROOM-1U** (externe Antenne): zertifiziert (SN25C0297, benannte Stelle 2907),
  etwa +1,22 USD. Mit 18 × 21,2 mm muss die Ecke oben links neu angelegt werden.
- **C5-MINI-1** (interne Antenne): zertifiziert und lieferbar.
- **Die Entscheidung des Anwenders:** das größere Modul mit eigener
  Platinenantenne, das **ESP32-C5-WROOM-1**.
- **Die Wärme ist nicht geklärt.** Die C5-Module sind bis 85 °C ausgelegt. Die
  Wärmeabschätzung ergab für das C6-Modul 79 °C ±40 % in einem 40-°C-Raum an PoE. Ob
  dieser Wert mit der Auslegung des C5 vergleichbar ist (Modultemperatur gegen
  Umgebung), wurde noch geprüft, als der Wechsel übergeben wurde. Das muss mit den
  eigenen Leistungswerten des C5 geklärt werden.

Als der Wechsel begann, später am selben Tag, hatten JLCPCB und LCSC kein
ESP32-C5-WROOM-1 in irgendeiner Variante lieferbar, obwohl das Modul zertifiziert ist
(EU-Baumusterprüfbescheinigung SN25C0185, FCC 2AC7Z-ESPC5WROOM1). Der Anwender wählte
daraufhin das **ESP32-C5-MINI-1-N4-V1.2**: 614 auf Lager, 3,36 USD bei 100 Stück. Was
dafür geprüft wurde, steht in
[design-notes.md, "WLAN-Modul: ESP32-C5-MINI-1"](hardware/touch-p4/design-notes.md#wlan-modul-esp32-c5-mini-1).

Ein unfertiger Wechsel auf das C5-MINI-1 existiert als lokaler, nicht gepushter
Referenz-Commit auf dem Branch `t3/attractap-touch-p4-c5-mini1-wip`. Er diente nur als
Hinweis.

## Was das Review selbst gefunden hat

Diese Punkte kamen zwischen den Stufen auf, nach den Korrekturen, und sollten im
nächsten Review zuerst geprüft werden:

- Ein bestandener Lint ist kein Beweis. Der erste Überlappungs-Lint ignorierte
  Pintext, und erst das Rendern der Blätter fand die Überlappungen.
- Mit den Schottky-Dioden entfiel auch deren Spannungsabfall von 0,4 V. Die
  +5V-Schiene folgte dann einer USB-Quelle bis zur Abschaltung des eFuse, über der
  Grenze einiger Lasten.
- Die Klemmspannung einer TVS-Diode bei ihrem Nennstrom kann die Nennwerte des
  geschützten Bauteils übersteigen. Sie ist bei dem Strom zu prüfen, den die
  anwendbare Stoßprüfung treibt, und zuerst ist zu klären, welche Prüfung gilt.
- Die Pin-*Funktionen* eines ICs prüfen, nicht nur seine Gehäusezeichnung, bevor
  Pins offen bleiben.
- Jeder Kondensator am Ausgang eines Wandlers zählt zu dessen Stabilitätsgrenze,
  auch die an den Lasten.
- Eine Quelle, die weniger Strom bietet, als die Platine ziehen kann, braucht eine
  Regel. Diese Platine hat einen reinen USB-Modus.
- Neue Testpunkte brauchen Beschriftungen.
- Neue hohe Bauteile brauchen eine neue Passungsprüfung gegen das Gehäuse und das
  Flexkabel des Displays.
- Konformität: EN 50130-4 wird unter der EMV-Richtlinie zitiert, nicht unter der RED.
  Die Einschränkungshinweise zu EN 301 489-3/-17 bedeuten, dass der Testplan
  objektive Bestehenskriterien festlegen muss. Das Zertifikat des Moduls gibt dem
  Host keine EMV-Anrechnung.
- Ein Textblock, der mit jeder Revision wächst, braucht reservierten und gelinteten
  Platz. Die Revisionshistorie des Stammblatts wuchs in die darunterliegenden
  Blattsymbole; der Lint prüfte Texte nur gegen Texte und prüft jetzt freien Text
  gegen Blattsymbole, Pins und Labels auf jedem Blatt, auch dem Stammblatt.
- Eine Regel im Layout-Leitfaden des Herstellers wird erfüllt, wo immer die Platine
  es zulässt, und nur der Teil, der sich nicht erfüllen lässt, kommt mit Begründung
  in eine Abweichung. Das erste C5-Layout wies die SDIO-Längenregel der HDG mit einer
  Laufzeitabschätzung ab; der Bus erfüllt sie jetzt mit Serpentinen und verfehlt nur
  die eine Regel, für die die vordere Lage keinen Platz lässt.
- Eine Aussage über die geroutete Platine wird an der gerouteten Platine gemessen. Die
  Notizen sagten, neben jedem SDIO-Via liege ein Masse-Via, während der Schritt nach
  dem Routen unter dem Modul keinen Platz gefunden hatte (nächster 2,6 bis 6,4 mm).
  Der Generator setzt diese Masse-Vias jetzt selbst, und die Notizen nennen die
  gemessenen Abstände (0,7 bis 1,7 mm).
- Die eigenen Kondensatoren eines Moduls hängen an der Schiene des Wandlers, der es
  speist, und zählen zu dessen Grenze. Die des C6-Moduls wurden nie mitgezählt; die
  des C5 (33,4 uF) werden in den Kapazitätstests mitgezählt.

## Das Review erneut ausführen

```bash
pnpm nx run attractap-touch-p4-pcb:check              # test, check-source, erc, check-netlist, drc, simulate, check-package
pnpm nx run attractap-touch-p4-pcb:check-footprints   # needs the internet

# in apps/attractap/hardware/touch-p4, with KiCad's Python (pcbnew), e.g. in the kicad10-np image:
python3 scripts/layout_report.py fab/reports/board.json   # decoupling paths, crystal, fast nets, hot loops
python3 scripts/fab_margins.py kicad/attractap-touch-p4.kicad_pcb   # smallest features against JLCPCB's limits
```

`fab/reports/board.json` wird vom Ziel `simulate` geschrieben (`sim/dump_board.py`).
