# Gehäuse
<!-- llms-description: Das 3D-druckbare Wand- und Tischgehäuse des Attractap-Touch-P4-Lesers: wie es funktioniert, alle Druck- und CAD-Dateien, wie man es druckt und ändert und was noch nicht geprüft ist. -->

Ein 3D-druckbares Gehäuse für die [Attractap-Touch-P4-Platine](hardware/touch-p4/overview.md), für alle,
die es drucken, zusammenbauen oder ändern. Es hängt an der Wand oder steht auf einem Tisch; derselbe Leser
passt in beide. Noch nichts wurde gedruckt oder anprobiert: siehe [Noch nicht geprüft](#noch-nicht-geprüft).

| An der Wand | Auf dem Tischständer |
| --- | --- |
| ![Leser an einer Wand](../../../_media/hardware/touch-p4/case/01-wall-hero.png) | ![Leser auf dem Tischständer](../../../_media/hardware/touch-p4/case/04-desk-front.png) |

## So funktioniert es

- **Kappe**: die vordere Schale. Sie trägt das Display und die Platine; ihre Front ist eine schlichte,
  1,4 mm dicke Wand.
- **Frontplatte**: eine 1 mm dicke Abdeckung über die ganze Front, auf die Kappe geklebt; das Displayglas
  liegt bündig mit ihr. Standardmäßig ist sie schlicht, mit einem weißen Streifen von der Tap-Kachel bis zur
  Unterkante. Das Logo ist Sache der Frontplatte: Die gedruckte gibt es als zweite Datei mit eingelegtem
  Attraccess-Schriftzug, andere Frontplatten (Aluminium, Holz, das Logo eines Kunden) bringen ihr eigenes mit.
  Leser werden mit dem Attraccess-Schriftzug ausgeliefert, sofern ein Kunde nichts anderes wünscht.
- **Tap-Kachel**: das Kartenziel über der NFC-Antenne, 40,8 mm im Quadrat und 1,8 mm über der Frontplatte:
  eine schwarze Oberseite mit weißem Schlüsselloch auf einem weißen Körper. Ihr Flansch sitzt hinter der
  Frontwand der Kappe, so lässt sie sich von außen nicht abhebeln.
  - **Licht.** Die 16 LEDs der Platine bilden einen quadratischen Ring, auf jeder Seite 21,4 mm von der Mitte
    der Kachel, 10,7 mm voneinander entfernt. Der weiße Rand um die schwarze Oberseite ist 2 mm breit
    (21,4 ± 1 mm von der Mitte) und liegt genau über ihnen.
  - **Lichtkanal.** Die LEDs leuchten in einen Kanal in der Rückseite der Kachel, 2,3 mm breit und 2,5 mm tief,
    der um den ganzen Ring läuft. Seine weißen Wände leiten das Licht seitlich zwischen die LEDs, und zwischen
    Kanal und Rand liegen nur 2,8 mm weißer Kunststoff, etwa halb so viel wie bei einer massiven Kachel.
  - **Kern.** Innerhalb des Rings bleibt die Kachel weiß. In weißem Kunststoff wird Licht gestreut, nicht
    geführt: Ein weißer Kern wirft, was nach innen streut, zum Rand zurück, ein schwarzer würde es schlucken
    und den Rand dunkler machen. Die schwarze Oberseite verdeckt den Kern.
  - **Halt für die Platine.** Die Kachel ist zwischen der Frontwand der Kappe und der Platine eingeklemmt,
    ihre Rückseite liegt rund um die NFC-Schleife flach auf der Platine. So hält sie die Ecke der Platine, die
    keine Schraube hat (von vorn gesehen unten links). Von den beiden Platinenschrauben rechts der Kachel (von
    vorn gesehen) sitzt die obere in einer Kerbe im Flansch, die untere bleibt frei von seiner gerundeten Ecke.
- **Dock**: die Rückplatte, 13,9 mm von der Bestückungsseite der Platine entfernt. Sie wird an die Wand
  geschraubt (fünf Löcher; das untere Paar entspricht dem 60-mm-Abstand einer Unterputzdose) oder auf den
  Ständer. Unter der Ethernet-Buchse und dem PoE-Modul hat die Platte 0,8 mm tiefe Aussparungen und unter
  den beiden Schirmfedern der Buchse ein durchgehendes Fenster.
- **Dock-Erkennung**: Die Platine weiß, wann sie abgenommen wird. Ein Näherungssensor misst das
  Infrarotlicht, das die glatte Innenseite des Docks reflektiert, und ein Hall-Schalter erfasst einen
  Magneten von 10 x 3 mm, der in einem Ring auf dieser Fläche sitzt.
- **Ständer**: ein hohler Keil für den Tisch. Der Leser lehnt sich um 35° zurück.
- Die Kappe hakt an einer 45°-Leiste am oberen Rand des Docks ein, schwenkt zu und wird von unten mit
  zwei M3-Schrauben gesichert. Stecker und Kabel sind danach zwischen Kappe und Dock eingeschlossen.
- Ein Kabel verschwindet entweder in der Wand hinter dem Dock oder verlässt das Gerät durch eine Aussparung
  unten, wo ein Kabelbinder auf einem Sattel in der Kappe den Zug von der Buchse nimmt.
- Schrauben gehen in Einschmelzmuttern. Der Leser lässt sich mit zwei Schrauben von der Wand nehmen, die
  Platine mit vier weiteren aus der Kappe.

Die [Installationsanleitung](hardware/touch-p4/installation-manual.md) ([PDF](_media/hardware/touch-p4/attractap-installation-manual-de.pdf ':ignore'))
zeigt jeden Schritt mit Abbildungen: Teile- und Hardwareliste, Einschmelzmuttern, Montage, Bohrschablone,
Kabelwege, Tischständer und Wartung.

## Dateien

Alle Dateien liegen in [`apps/attractap/hardware/touch-p4/case/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case). Sie stehen unter der
[nichtkommerziellen Hardware-Lizenz](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/LICENSE.md): Das Design und gedruckte Gehäuse dürfen nicht verkauft werden (siehe [Lizenz](hardware/touch-p4/overview.md#lizenz)).

### Druckdateien

Jede 3MF-Datei liegt bereits auf ihrer Druckfläche. Drucken Sie sie in ABS+ (siehe [Drucken](#drucken)).

| Teil | Druckdatei | CAD | Anz. | Farbe | Liegt auf |
| --- | --- | --- | --- | --- | --- |
| Kappe | [`attractap-cap.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-cap.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-cap.step) | 1 | RAL 5021 | ihrer Vorderseite |
| Frontplatte | [`attractap-faceplate.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate.3mf), mit Schriftzug [`attractap-faceplate-logo.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate-logo.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate.step), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-faceplate-logo.step) | 1 | RAL 5021, Streifen und Schriftzug weiß | ihrer Vorderseite |
| Tap-Kachel | [`attractap-tile.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-tile.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-tile.step) | 1 | Oberseite und Schlüsselloch schwarz, Körper reines Weiß (er führt das Licht der LEDs) | ihrer Rückseite |
| Dock | [`attractap-dock.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-dock.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-dock.step) | 1 | Marmorweiß | seiner Rückseite |
| Displayrahmen | [`attractap-display-frame.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-display-frame.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-display-frame.step) | 1 | Beliebig | seiner Platinenseite |
| Ständer (nur Tisch) | [`attractap-stand.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-stand.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-stand.step) | 1 | Marmorweiß | seiner Tischseite |

Die Hardware (Einschmelzmuttern, Schrauben, Klebeband, Kabelbinder) ist in der
[Installationsanleitung](hardware/touch-p4/installation-manual.md) aufgelistet.

### Konstruktions- und Referenzdateien

| Datei | Was sie ist |
| --- | --- |
| [`cad/attractap-touch-case.sc`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-touch-case.sc) | Die Konstruktion, ein SolidCraft-Dokument (Version 0.45.0). Jede Druckdatei wird daraus exportiert. |
| [`cad/attractap-assembly.step`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-assembly.step) | Der ganze Leser zusammengebaut, für andere CAD-Programme. |
| Platinen-Attrappe: [3MF](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.3mf), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.step), [STL](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-pcb.stl) | Druckbarer Platzhalter für die Platine, um die Passung zu prüfen, bevor die echte Platine vorliegt. |
| Display-Attrappe: [3MF](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.3mf), [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.step), [STL](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-mock-display.stl) | Platzhalter für das Display, mit den angenommenen Displaymaßen (siehe [Noch nicht geprüft](#noch-nicht-geprüft)). |
| [`board/attractap-touch-p4.step`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/board/attractap-touch-p4.step) | Die Platine allein (ohne Bauteile), aus dem aktuellen Layout exportiert. Die Konstruktion enthält diese Datei, am 27. November 2026 für den LED-Ring und die verschobenen Befestigungslöcher neu importiert; importieren Sie sie nach einer Änderung der Platinenkontur oder der Löcher erneut. |
| [`logo/attraccess-wordmark.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-wordmark.svg), [`attraccess-keyhole.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-keyhole.svg), [`attraccess-logo-mono.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-logo-mono.svg) | Logo-Umrisse für die Einlagen der Frontplatte und der Tap-Kachel; das Logo im Bestückungsdruck der Platine wird aus demselben Ordner gezeichnet. |
| [`manual/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case/manual) | Die Szenendatei, aus der die Abbildungen der Anleitung gerendert werden, und die Skripte, die Abbildungen und PDF erzeugen (siehe [Das Design ändern](#das-design-ändern)). |

## Drucken

- Material: ABS+ auf einem Filamentdrucker. Für einen Leser, der verkauft wird, braucht das Filament ein
  Datenblatt, das seine Brennbarkeitsklasse nennt; ob einfaches ABS+ genügt, steht in der
  [Konformitäts-Checkliste](hardware/touch-p4/compliance.md).
- Jedes Teil hat eine ebene Fläche zum Aufliegen und soll ohne Stützstrukturen druckbar sein. Keines wurde
  bisher geslict, das ist also unbestätigt.

## Das Design ändern

- **Koordinaten**: Der Ursprung ist die Mitte des Displays von vorn gesehen; Z ist 0 an der Wand, und die
  Vorderseite liegt bei Z = `D`. Ein Platinenpunkt (x, y) in den eigenen Koordinaten der Platine liegt im
  Gehäuse bei X = 43 − x, Y = 49,15 − y; in KiCad-Koordinaten (Platinenecke bei (60, 30)) bei X = 103 − x,
  Y = 79,15 − y.
- **Parameter**: Der Tiefenaufbau ist parametrisch (`plate_t`, `cav`, `pcb_t`, `disp_gap`, `disp_t`,
  `lens_t`, `tape_t`, `lens_recess`, `wall`, `pcb_ins_depth`). Positionen in X und Y sind einfache Zahlen,
  die der Platine entnommen sind.
- **Export**: Führen Sie nach einer Änderung `cad/tools/export_parts.py` aus. Es schreibt Kappe,
  Frontplatte (schlicht und mit Schriftzug), Tap-Kachel, Dock, Displayrahmen, Display-Attrappe und die Baugruppe; Ständer und
  Platinen-Attrappe exportiert es nicht. In SolidCraft 0.45.0 bleibt die Option, die Teile auf ihre
  Druckfläche legt, ohne Wirkung; deshalb dreht das Skript jedes Teil vor dem Export mit einer
  vorübergehenden Verschiebung.
- **Szenen der Anleitung**: `manual/attractap-manual-scenes.sc` ist eine Kopie des Designs mit zusätzlichen
  Körpern zur Illustration; Druckdateien kommen nie daraus. Sie, die Renderings auf dieser Seite und die
  Abbildungen der Anleitung zeigen noch einen früheren Tiefenaufbau: eine um 0,64 mm tiefere Kappe, mit dem
  Display 2 mm von der Platine entfernt, und den früheren Weg des Display-Flexkabels durch die Platine unterhalb des
  Displays. Außerdem zeigen sie noch die alte Front mit Lichtfenstern, LED-Diffusoren und Einlagen in der Kappe,
  von vor der Frontplatte und der Tap-Kachel (27. November 2026).

Die Skripte sind reines Python ohne Abhängigkeiten; führen Sie sie mit `python3 -I` aus. Sie steuern
SolidCraft über sein Kommandozeilenwerkzeug (der Pfad am Anfang jedes Skripts ist der für macOS) oder
schreiben Step-Dateien dafür und nutzen `rsvg-convert` für Beschriftungen.

| Skript | Was es erzeugt |
| --- | --- |
| `cad/tools/export_parts.py` | STEP-, 3MF- und STL-Dateien von Kappe, Frontplatte, Tap-Kachel, Dock, Displayrahmen, Display-Attrappe und Baugruppe |
| `manual/tools/scenes.py`, `scenelib.py` | Szenen, Kameras und Beschriftungen der Abbildungen der Anleitung |
| `manual/tools/gen_hardware.py`, `gen_strain_relief.py`, `gen_wall_route.py` | Step-Dateien, die der Szenendatei der Anleitung Schrauben, Einschmelzmuttern, Kabel und Kabelbinder hinzufügen |
| `manual/tools/drill.py` | Die Bohrschablone |
| `manual/tools/build_pdf.py` | Die PDFs der Anleitung (`docs/_media/hardware/touch-p4/attractap-installation-manual-en.pdf` und `-de.pdf`) aus der englischen und der deutschen Seite der Anleitung; braucht einen Chromium-basierten Browser |

## Noch nicht geprüft

- **Nichts wurde gedruckt.** Passungen, die Schwenkbewegung beim Einhängen und die Zugentlastung sind nur in CAD geprüft.
- **Displaymaße.** Gemessen an einem Muster-Panel (26. November 2026): Glas 84,23 x 84,25 mm, 3,5 mm von der
  Vorderseite des Glases bis zur Metallrückseite (`disp_t`; die Zeichnung auf der Produktseite des Displays,
  AliExpress-Artikel 1005005675144653, sagt 3,14 mm). Der nach dem LCD-Umriss der Zeichnung gedruckte Displayrahmen
  passt auf das Muster. Nicht gemessen: die Deckscheibe allein (`lens_t`, 0,55 mm laut Zeichnung) und der Eckenradius
  (angenommen mindestens 1 mm). Sie entscheiden, ob der Bildschirm bündig sitzt. Vermessen Sie das Panel, das Sie
  kaufen; weicht es ab, setzen Sie `disp_t` und `lens_t` und exportieren Sie die Teile erneut.
  - `lens_t` ist nur die Deckscheibe: Der Touch-Sensor (76,5 x 76,7 mm) ist kleiner als die Deckscheibe,
    sodass der Rand, den der Rahmen hält, keinen Sensor dahinter hat.
  - Der Sensor ist 0,9 mm breiter als die Öffnung des Rahmens für das LCD-Modul (75,6 mm). Der Rand des
    Rahmens reicht 0,4 mm unter jede Seitenkante des Sensors und drückt mit dem 0,3-mm-Klebeband mit
    0,05 mm darauf. Eine Öffnung von 77,3 mm würde ihn freilassen.
  - Der Rand der Deckscheibe des Musters trägt ein eigenes Klebeband (3M, mit Schutzfolie; laut Zeichnung
    3M 9495 mit 0,175 mm, nicht gemessen). Es kann das 0,3-mm-Klebeband der Anleitung ersetzen; das Glas sitzt dann
    0,1 mm tiefer, und der Rand drückt mit 0,2 mm auf die Kanten des Sensors, weiten Sie also zuerst die
    Öffnung.
- **Abstand des Displays zur Platine.** Das Gehäuse hält das Display 1,7 mm von der Platine entfernt
  (`disp_gap`). Einzelheiten in den [Designnotizen](hardware/touch-p4/design-notes.md#displaymontage-und-flexkabel).
  - Das Flexkabel des Displays faltet sich flach auf die Metallrückseite des LCD und geht durch einen Schlitz
    hinter dem Display. Der Touch-Controller darauf zeigt zur Platine, 1,3 mm hoch; die Platine erlaubt 1,5 bis
    2,0 mm, und 1,7 mm lassen Raum für Drucktoleranzen. Der Rahmen ist am unteren Rand des Displays offen, wo die
    Faltung liegt.
  - Bei der LAN-Version hat die Ethernet-Buchse J401 ihre Lötpins hinter dem Display: 16 Pins, zwei
    Schirmlaschen und zwei Kunststoffzapfen, 11 davon hinter der Metallrückseite des LCD, die mindestens
    1,45 mm aus der Platine herausstehen. Sie werden auf 1 mm gekürzt, und diese Ecke des LCD bekommt
    Polyimidband (die Anleitung enthält beide Schritte). Die USB-C-Buchse hat ihre Schirmlaschen unter dem
    Rand des Glases.
  - Die beiden 48-V-Pins der Buchse treten 0,5 mm neben der Metallkante des LCD aus, innerhalb der Tasche
    des Rahmens für die Pins. Der Rahmen kann dort keine Wand setzen (das Pad des näheren Pins endet 0,1 mm
    von der Kante des LCD); das Band auf dem LCD ist die Isolierung.
  - Die Buchse andersherum zu drehen geht nicht ohne ein längeres Gehäuse: Unter dem Display schrumpft ihr
    Steckerraum von 51 auf 32 mm, und ein Kabel aus der Wand bräuchte einen Stecker, der 12 mm unter der
    Buchse endet.
- **Tap-Kachel und LED-Ring.** Am 27. November 2026 für den Ring aus 16 LEDs der Platine geändert und nur im CAD
  geprüft.
  - Wie gleichmäßig und wie hell der Rand leuchtet. Der Lichtkanal und die 2,8 mm Weiß darüber sind ein erster
    Ansatz; Lichtflecken auf dem Rand sprächen für einen tieferen Kanal oder kleine schwarze Masken über den
    LEDs, ein zu dunkler Rand für eine dünnere Decke.
  - Ob die Rückseite der Kachel die untere linke Ecke der Platine (von vorn gesehen) ohne Spiel hält. Sie liegt
    im CAD ohne Spalt auf der Platine. Sitzt die Platine dann nicht auf allen vier Schraubdomen, schleifen Sie
    die Rückseite der Kachel ab.
  - Nach hinten (zur Wand) stützt diese Ecke nur die Platine selbst: Das Dock hat dahinter seine Kabelöffnung.
    Eine auf die Kachel gedrückte Karte biegt sie elastisch zurück, geschätzt um 0,1 mm bei 5 N auf die Mitte
    der Kachel.
- **Einschmelzmuttern nahe der Frontfläche.** Nur 2,9 mm liegen zwischen Platine und Frontwand. Die Löcher
  für die Einschmelzmuttern der vier Platinen-Schraubdome sind 3,2 mm tief (`pcb_ins_depth`), reichen also
  0,3 mm in die 1,4 mm dicke Frontwand der Kappe (2,4 mm, bevor die Frontplatte ihren äußeren Millimeter
  übernahm) und lassen 1,1 mm stehen. Prüfen Sie beim ersten Druck, dass das Einpressen der Einschmelzmuttern
  die Front nicht markiert und die Frontplatte nicht anhebt.
- **Dock-Magnet.** Der Ring liegt bei X 30,5, Y 10,95 (Platinenpunkt 12,5, 38,2); die Fläche des Magneten
  ist 10,3 mm vom Hall-Schalter entfernt, was rechnerisch 22 mT ergibt, das Vierfache dessen, was der
  Schalter braucht. Prüfen Sie an der ersten Platine, dass der Schalter bei eingehängtem Leser „am Dock“ und
  nach dem Abheben „ab“ meldet. Die Tasche ist 10,2 mm breit für einen Tropfen Kleber; passen Sie sie an die
  Magnete an, die Sie kaufen.
- **Dock-Platte vor dem Näherungssensor.** Der Sensor beleuchtet eine Stelle der Dock-Innenseite um
  X 21,4, Y -2,1 (Platinenpunkt 21,6, 51,25), von vorn gesehen 9 mm links und 13 mm unter dem Ring des
  Magneten. Halten Sie die Platte dort auf 9 mm ringsum eben und frei von Rippen, Löchern, Kabelclips und
  Etiketten; ein Test prüft, dass die Öffnungen des Docks diese Stelle freilassen. Der Messwert hängt von der
  Farbe der Platte ab: Ein Leser muss seine Referenz auf einem Dock anderer Farbe erneut speichern, und ein
  schwarzes Dock reflektiert womöglich zu wenig (nicht gemessen).
- **Ethernet-Buchse und PoE-Modul gegen das Dock.** Nur gegen die 3D-Modelle der Platine geprüft, bei den
  Maximalhöhen der Hersteller: Der Körper der Buchse behält 0,70 mm zu seiner Aussparung, ihre Schirmfedern
  (15,21 ± 0,5 mm hoch) 1,14 mm zur Wand hinter dem Fenster und 1,0 mm zu den Seiten des Fensters, das
  PoE-Modul (13,35 ± 0,5 mm, Zeichnung von SDAPO) 0,80 mm, die DC-Klemme J103 0,70 mm zur Platte.
  Prüfen Sie beim ersten Druck.
- **Betrieb im Freien.** Es gibt keine Dichtungen, die Buzzerlöcher und Kabelaussparungen sind offen, und
  ABS+ altert im Sonnenlicht: ein Gehäuse für Innenräume. Auch das 5-GHz-WLAN der Platine ist auf den
  Betrieb in Innenräumen beschränkt ([Konformitäts-Checkliste](hardware/touch-p4/compliance.md)).

Die Installationsanleitung endet mit der [vollständigen Liste](hardware/touch-p4/installation-manual.md)
dessen, was noch nicht geprüft ist.
