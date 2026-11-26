# Gehäuse
<!-- llms-description: Das 3D-druckbare Wand- und Tischgehäuse des Attractap-Touch-P4-Lesers: wie es funktioniert, alle Druck- und CAD-Dateien, wie man es druckt und ändert und was noch nicht geprüft ist. -->

Ein 3D-druckbares Gehäuse für die [Attractap-Touch-P4-Platine](hardware/touch-p4/overview.md), für alle,
die es drucken, zusammenbauen oder ändern. Es hängt an der Wand oder steht auf einem Tisch; derselbe Leser
passt in beide. Noch nichts wurde gedruckt oder anprobiert: siehe [Noch nicht geprüft](#noch-nicht-geprüft).

| An der Wand | Auf dem Tischständer |
| --- | --- |
| ![Leser an einer Wand](../../../_media/hardware/touch-p4/case/01-wall-hero.png) | ![Leser auf dem Tischständer](../../../_media/hardware/touch-p4/case/04-desk-front.png) |

## So funktioniert es

- **Kappe**: die vordere Schale. Sie trägt das Display bündig mit der Front und die Platine. Acht
  Lichtfenster für die Status-LEDs, der Attraccess-Schriftzug und ein Tap-Ring über der NFC-Antenne.
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
| Kappe, mehrfarbig (Logo als separate Objekte) | [`attractap-cap-multicolor.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-cap-multicolor.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-cap-multicolor.step) | statt der Kappe | RAL 5021, Logo nach Wahl | ihrer Vorderseite |
| Dock | [`attractap-dock.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-dock.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-dock.step) | 1 | Marmorweiß | seiner Rückseite |
| Displayrahmen | [`attractap-display-frame.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-display-frame.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-display-frame.step) | 1 | Beliebig | seiner Platinenseite |
| LED-Diffusor | [`attractap-led-diffuser.3mf`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-led-diffuser.3mf) | [STEP](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/cad/attractap-led-diffuser.step) | 2 | Natur oder reines Weiß | seiner Platinenseite |
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
| [`board/attractap-touch-p4.step`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/board/attractap-touch-p4.step) | Die Platine allein (ohne Bauteile), aus dem aktuellen Layout exportiert. Die Konstruktion enthält die Platine in dem Stand, den sie beim Zeichnen des Gehäuses hatte; gleichen Sie sie nach einer Änderung der Platinenkontur mit dieser Datei ab. |
| [`logo/attraccess-wordmark.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-wordmark.svg), [`attraccess-keyhole.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-keyhole.svg), [`attraccess-logo-mono.svg`](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/case/logo/attraccess-logo-mono.svg) | Logo-Umrisse für die Einlagen der Kappe; das Logo im Bestückungsdruck der Platine wird aus demselben Ordner gezeichnet. |
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
- **Export**: Führen Sie nach einer Änderung `cad/tools/export_parts.py` aus. Es schreibt Kappe (einfach und
  mehrfarbig), Dock, Displayrahmen, LED-Diffusor, Display-Attrappe und die Baugruppe; Ständer und
  Platinen-Attrappe exportiert es nicht. In SolidCraft 0.45.0 bleibt die Option, die Teile auf ihre
  Druckfläche legt, ohne Wirkung; deshalb dreht das Skript jedes Teil vor dem Export mit einer
  vorübergehenden Verschiebung.
- **Szenen der Anleitung**: `manual/attractap-manual-scenes.sc` ist eine Kopie des Designs mit zusätzlichen
  Körpern zur Illustration; Druckdateien kommen nie daraus. Sie, die Renderings auf dieser Seite und die
  Abbildungen der Anleitung zeigen noch einen früheren Tiefenaufbau: eine um 1,2 mm tiefere Kappe, mit dem
  Display 2 mm von der Platine entfernt.

Die Skripte sind reines Python ohne Abhängigkeiten; führen Sie sie mit `python3 -I` aus. Sie steuern
SolidCraft über sein Kommandozeilenwerkzeug (der Pfad am Anfang jedes Skripts ist der für macOS) oder
schreiben Step-Dateien dafür und nutzen `rsvg-convert` für Beschriftungen.

| Skript | Was es erzeugt |
| --- | --- |
| `cad/tools/export_parts.py` | STEP-, 3MF- und STL-Dateien von Kappe, Dock, Displayrahmen, LED-Diffusor, Display-Attrappe und Baugruppe |
| `manual/tools/scenes.py`, `scenelib.py` | Szenen, Kameras und Beschriftungen der Abbildungen der Anleitung |
| `manual/tools/gen_hardware.py`, `gen_strain_relief.py`, `gen_wall_route.py` | Step-Dateien, die der Szenendatei der Anleitung Schrauben, Einschmelzmuttern, Kabel und Kabelbinder hinzufügen |
| `manual/tools/drill.py` | Die Bohrschablone |
| `manual/tools/build_pdf.py` | Die PDFs der Anleitung (`docs/_media/hardware/touch-p4/attractap-installation-manual-en.pdf` und `-de.pdf`) aus der englischen und der deutschen Seite der Anleitung; braucht einen Chromium-basierten Browser |

## Noch nicht geprüft

- **Nichts wurde gedruckt.** Passungen, die Schwenkbewegung beim Einhängen und die Zugentlastung sind nur in CAD geprüft.
- **Displaymaße.** Aus der Maßzeichnung auf der Produktseite des Displays (AliExpress-Artikel
  1005005675144653, dieselbe Zeichnung wie im Makerfabs-Datenblatt, nach dem die Platine gelayoutet wurde):
  insgesamt 3,14 mm, zusammengesetzt aus der Deckscheibe (0,55 mm), dem Touch-Sensor (0,35 mm), der
  Klebeschicht (0,175 mm) und dem LCD-Modul (2,06 mm); angenommen wird ein Eckenradius von mindestens 1 mm.
  Nichts ist gemessen, und diese Maße entscheiden, ob der Bildschirm bündig sitzt und wie weit die
  Metallrückseite des Displays von der Platine entfernt ist. Vermessen Sie das Panel, das Sie kaufen; weicht
  es ab, setzen Sie `disp_t` und `lens_t` und exportieren Sie die Teile erneut.
  - `lens_t` ist nur die Deckscheibe: Der Touch-Sensor (76,5 x 76,7 mm) ist kleiner als die Deckscheibe,
    sodass der Rand, den der Rahmen hält, keinen Sensor dahinter hat.
  - Der Sensor ist 0,9 mm breiter als die Öffnung des Rahmens für das LCD-Modul (75,6 mm). Der Rand des
    Rahmens reicht 0,4 mm unter jede Seitenkante des Sensors und drückt mit dem 0,3-mm-Klebeband mit
    0,05 mm darauf. Eine Öffnung von 77,3 mm würde ihn freilassen.
  - Nach der Zeichnung trägt der Rand der Deckscheibe ein eigenes Klebeband (3M 9495, 0,175 mm). Wird es
    mit dem Panel geliefert, kann es das 0,3-mm-Klebeband der Anleitung ersetzen; das Glas sitzt dann
    0,1 mm tiefer, und der Rand drückt mit 0,2 mm auf die Kanten des Sensors, weiten Sie also zuerst die
    Öffnung.
- **Abstand des Displays zur Platine.** Das Gehäuse hält das Display 1,5 mm von der Platine entfernt
  (`disp_gap`). Einzelheiten in den [Designnotizen](hardware/touch-p4/design-notes.md).
  - Das Flexkabel des Displays wird um die Platine geführt, und seine steifen Teile müssen flach hinter der
    Platine liegen. Nach der Zeichnung des Panels funktioniert das bis zu 2,0 mm zwischen Platine und
    Metallrückseite des LCD; 1,5 mm lassen 0,5 mm Reserve.
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
- **Einschmelzmuttern nahe der Frontfläche.** Nur 2,3 mm liegen zwischen Platine und Frontwand. Die Löcher
  für die Einschmelzmuttern der vier Platinen-Schraubdome sind 3,2 mm tief (`pcb_ins_depth`), reichen also
  0,9 mm in die 2,4 mm dicke Frontwand und lassen 1,5 mm stehen. Prüfen Sie beim ersten Druck, dass das
  Einpressen der Einschmelzmuttern die Front nicht markiert.
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
