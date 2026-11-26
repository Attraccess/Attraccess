# Gehäuse
<!-- llms-description: Das 3D-druckbare Wand- und Tischgehäuse des Attractap-Touch-P4-Lesers: Teile, Druck, Konstruktionsdateien und was noch nicht geprüft ist. -->

Ein 3D-druckbares Gehäuse für die [Attractap-Touch-P4-Platine](hardware/touch-p4/overview.md), Revision A (4-Zoll-Touchdisplay mit 480 × 480 Pixeln, NFC-Antenne auf der Platine, Ethernet, DC-Buchse, USB-C, Buzzer, acht Status-LEDs). Es hängt an der Wand oder steht auf einem Tisch, und derselbe Leser passt in beide Halterungen.

| An der Wand | Auf dem Tischständer |
| --- | --- |
| ![Leser an einer Wand](../../../_media/hardware/touch-p4/case/01-wall-hero.png) | ![Leser auf dem Tischständer](../../../_media/hardware/touch-p4/case/04-desk-front.png) |

> **Stand: nur CAD.** Kein Teil wurde bisher gedruckt, geslict oder anprobiert. Passungen und Schraubenlängen sind ungetestet, und die Displaymaße stammen von der Produktseite, nicht von einem vermessenen Panel; siehe [Noch nicht geprüft](#noch-nicht-geprüft).

## So funktioniert es

- **Kappe**: die vordere Schale. Sie trägt das Display bündig mit der Front und die Platine. Acht Lichtfenster für die Status-LEDs, der Attraccess-Schriftzug und ein Tap-Ring über der NFC-Antenne.
- **Dock**: die Rückplatte. Sie wird an die Wand geschraubt (fünf Löcher; das untere Paar entspricht dem 60-mm-Abstand einer Unterputzdose) oder auf den Ständer. Unter der Ethernet-Buchse und dem PoE-Modul hat die Platte flache Aussparungen und ein Fenster für die beiden Schirmfedern der Buchse, sodass beide Teile an ihrer höchsten Stelle mindestens 0,5 mm Abstand behalten. Die Platine erkennt das Dock auf zwei Arten, damit der Leser weiß, wann er abgenommen wird: Ein Näherungssensor misst das Infrarotlicht, das die glatte Innenseite des Docks reflektiert, und ein Hall-Schalter erfasst einen Magneten von 10 × 3 mm, der in einem Ring auf dieser Fläche sitzt.
- **Ständer**: ein hohler Keil für den Tisch. Der Leser lehnt sich um 35° zurück.
- Die Kappe hakt an einer 45°-Leiste am oberen Rand des Docks ein, schwenkt zu und wird von unten mit zwei M3-Schrauben gesichert. Stecker und Kabel sind danach zwischen Kappe und Dock eingeschlossen.
- Ein Kabel verschwindet entweder in der Wand hinter dem Dock oder verlässt das Gerät durch eine Aussparung unten, wo ein Kabelbinder auf einem Sattel in der Kappe den Zug von der Buchse nimmt.
- Schrauben gehen in Einschmelzmuttern. Der Leser lässt sich mit zwei Schrauben von der Wand nehmen, die Platine mit vier weiteren aus der Kappe.

Die [Installationsanleitung](hardware/touch-p4/installation-manual.md) ([PDF](_media/hardware/touch-p4/attractap-installation-manual-de.pdf ':ignore')) zeigt jeden Schritt mit Abbildungen: Teile- und Hardwareliste, Einschmelzmuttern, Montage, Bohrschablone, Kabelwege, Tischständer und Wartung.

## Konstruktionsdateien

Sie liegen in [`apps/attractap/hardware/touch-p4/case/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case).

| Ordner | Inhalt |
| --- | --- |
| [`cad/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case/cad) | Die Konstruktion (`attractap-touch-case.sc`, SolidCraft) und die daraus erzeugten Dateien: je eine 3MF- und eine STEP-Datei pro Teil, die gesamte Baugruppe als STEP sowie eine Platinen- und eine Display-Attrappe zum Probepassen |
| [`board/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case/board) | STEP-Export der Platine allein, ohne Bauteile, aus dem aktuellen Layout ([KiCad-Dateien](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/kicad), Revision A). Die Gehäusekonstruktion enthält die Platine in dem Stand, den sie beim Zeichnen des Gehäuses hatte; gleichen Sie sie nach einer Änderung der Platinenkontur mit diesem Export ab |
| [`logo/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case/logo) | Die Umrisse von Schriftzug und Schlüsselloch für die Logo-Einlagen |
| [`manual/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/case/manual) | Die SolidCraft-Datei, aus der die Abbildungen der [Installationsanleitung](hardware/touch-p4/installation-manual.md) gerendert werden, und die Skripte, die Abbildungen und PDF erzeugen |

## Drucken

Das Gehäuse ist für ABS+ auf einem Filamentdrucker ausgelegt. Jedes Teil hat eine ebene Fläche zum Aufliegen und soll ohne Stützstrukturen druckbar sein; keines wurde bisher geslict, das ist also unbestätigt. Jede 3MF-Datei liegt bereits auf ihrer Druckfläche. Für einen Leser, der verkauft wird, braucht das Filament ein Datenblatt, das seine Brennbarkeitsklasse nennt; ob einfaches ABS+ genügt, steht in der [Konformitäts-Checkliste](hardware/touch-p4/compliance.md#gehäusekunststoff).

| Teil | Datei in `cad/` | Anz. | Farbe | Liegt auf |
| --- | --- | --- | --- | --- |
| Kappe | `attractap-cap.3mf`, oder `attractap-cap-multicolor.3mf` mit dem Logo als separate Objekte für den Mehrfarbdruck | 1 | RAL 5021 | ihrer Vorderseite |
| Dock | `attractap-dock.3mf` | 1 | Marmorweiß | ihrer Rückseite |
| Displayrahmen | `attractap-display-frame.3mf` | 1 | Beliebig | seiner Platinenseite |
| LED-Diffusor | `attractap-led-diffuser.3mf` | 2 | Natur oder reines Weiß | seiner Platinenseite |
| Ständer (nur Tisch) | `attractap-stand.3mf` | 1 | Marmorweiß | seiner Tischseite |

`attractap-mock-pcb` und `attractap-mock-display` (3MF, STEP, STL) sind Platzhalter für die Platine und das Display, um die Passung zu prüfen, bevor die echten Teile vorliegen. Die Display-Attrappe verwendet die unten aufgeführten angenommenen Displaymaße.

Die Hardware (Einschmelzmuttern, Schrauben, Klebeband, Kabelbinder) ist in der [Anleitung](hardware/touch-p4/installation-manual.md#teile-hardware-und-werkzeuge) aufgelistet.

## Das Design ändern

Die Konstruktionsdateien sind SolidCraft-Dokumente (erstellt mit Version 0.45.0).

- Koordinaten: Der Ursprung ist die Mitte des Displays von vorn gesehen, Z ist 0 an der Wand, und die Vorderseite liegt bei Z = `D`. Ein Punkt (x, y) in den eigenen Koordinaten der Platine, wie sie in ihren [Designnotizen](hardware/touch-p4/design-notes.md#mechanik) verwendet werden, liegt im Gehäuse bei X = 43 − x und Y = 49,15 − y. In den Koordinaten der KiCad-Datei, in der die Platinenecke bei (60, 30) liegt, ist das X = 103 − x und Y = 79,15 − y.
- Der Tiefenaufbau ist parametrisch (`plate_t`, `cav`, `pcb_t`, `disp_gap`, `disp_t`, `lens_t`, `tape_t`, `lens_recess`, `wall`, `pcb_ins_depth`). Positionen in X und Y sind einfache Zahlen, die der Platine entnommen sind.
- Nach einer Änderung am Design schreibt `cad/tools/export_parts.py` die Dateien seiner Teile neu: Kappe, Dock, Displayrahmen, LED-Diffusor, Display-Attrappe und die Baugruppe. Ständer und Platinen-Attrappe exportiert es nicht.
- `manual/attractap-manual-scenes.sc` ist eine Kopie des Designs mit zusätzlichen Körpern zur Illustration. Druckdateien werden nur aus den Designs in `cad/` exportiert. Die Kopie, die Renderings auf dieser Seite und die Abbildungen der Anleitung zeigen noch den früheren Tiefenaufbau: eine um 1,2 mm tiefere Kappe, mit dem Display 2 mm von der Platine entfernt.
- Die 3MF-Dateien sind auf ihrer Druckfläche liegend gespeichert. In SolidCraft 0.45.0 blieb die Option, die Teile auf ihre markierte Druckfläche legt, ohne Wirkung; deshalb wird jedes Teil vor dem Export mit einer vorübergehenden Verschiebung gedreht.

Die Skripte sind reines Python ohne Abhängigkeiten; führen Sie sie mit `python3 -I` aus. Sie steuern SolidCraft über sein Kommandozeilenwerkzeug (der Pfad am Anfang jedes Skripts ist der für macOS) oder schreiben Step-Dateien dafür und nutzen `rsvg-convert` für Beschriftungen.

| Skript | Was es erzeugt |
| --- | --- |
| `cad/tools/export_parts.py` | Die STEP-, 3MF- und STL-Dateien von Kappe, Dock, Displayrahmen, LED-Diffusor, Display-Attrappe und Baugruppe, auf ihre Druckflächen gelegt |
| `manual/tools/scenes.py`, `scenelib.py` | Szenen- und Kameraaufbau und die Beschriftungen der Abbildungen der Anleitung |
| `manual/tools/gen_hardware.py`, `gen_strain_relief.py`, `gen_wall_route.py` | Step-Dateien, die der Szenendatei der Anleitung Schrauben, Einschmelzmuttern, Kabel und Kabelbinder hinzufügen |
| `manual/tools/drill.py` | Die Bohrschablone |
| `manual/tools/build_pdf.py` | Die PDFs der Anleitung, `docs/_media/hardware/touch-p4/attractap-installation-manual-en.pdf` und `-de.pdf`, aus den Seiten der Anleitung `docs/en/hardware/touch-p4/installation-manual.md` und `docs/de/hardware/touch-p4/installation-manual.md` (braucht einen Chromium-basierten Browser) |

## Noch nicht geprüft

- **Nichts wurde gedruckt.** Gedruckte Passungen, die Schwenkbewegung beim Einhängen und die Zugentlastung sind nur in CAD geprüft.
- **Displaymaße.** Sie stammen aus der Maßzeichnung auf der Produktseite des Displays (AliExpress-Artikel 1005005675144653, dieselbe Zeichnung wie im Makerfabs-Datenblatt, nach dem die Platine gelayoutet wurde): insgesamt 3,14 mm, zusammengesetzt aus der Deckscheibe (0,55 mm), dem Touch-Sensor (0,35 mm), der Klebeschicht (0,175 mm) und dem LCD-Modul (2,06 mm). Angenommen wird ein Eckenradius von mindestens 1 mm. Nichts ist gemessen. Sie entscheiden, ob der Bildschirm bündig sitzt und wie weit die Metallrückseite des Displays von der Platine entfernt ist. Vermessen Sie das Panel, das Sie kaufen; weicht es ab, setzen Sie `disp_t` und `lens_t` und exportieren Sie die Teile erneut.
  - `lens_t` ist nur die Deckscheibe, 0,55 mm: Der Touch-Sensor ist kleiner als die Deckscheibe (76,5 x 76,7 mm), sodass der Rand, den der Rahmen hält, keinen Sensor dahinter hat.
  - Eine frühere Version dieses Gehäuses nahm insgesamt 3,8 mm und 1,3 mm Glas an, aus einer Zeit, in der die Produktseite nicht lesbar war. Damit hätte dieses Panel 0,85 mm unter der Front gesessen.
  - Der Touch-Sensor ist 0,9 mm breiter als die Öffnung des Rahmens für das LCD-Modul (75,6 mm). Der Rand des Rahmens reicht 0,4 mm unter jede Seitenkante des Sensors und drückt mit dem 0,3-mm-Klebeband mit 0,05 mm darauf. Eine Öffnung von 77,3 mm würde ihn freilassen.
  - Nach der Zeichnung trägt der Rand der Deckscheibe ein eigenes doppelseitiges Klebeband (3M 9495, 0,175 mm). Wird es mit dem Panel geliefert, kann es das 0,3-mm-Klebeband der Anleitung ersetzen; das Glas sitzt dann 0,1 mm tiefer, und der Rand drückt mit 0,2 mm auf die Kanten des Sensors, weiten Sie also zuerst die Öffnung.
- **Abstand des Displays zur Platine.** Zwei Dinge bestimmen ihn, von entgegengesetzten Seiten (Einzelheiten in den [Designnotizen](hardware/touch-p4/design-notes.md#displaymontage-und-flexkabel) der Platine):
  - Das Flexkabel des Displays wird um die Platine geführt, und seine steifen Teile müssen nach der Biegung flach hinter der Platine liegen. Nach der Zeichnung des Panels funktioniert das bis zu **2,0 mm** zwischen Platine und Metallrückseite des LCD, mit 0,5 mm Reserve bei 1,5 mm.
  - Bei der Ethernet-Version hat die Buchse J401 ihre Lötpins hinter dem Display: 16 Pins, zwei Schirmlaschen und zwei Kunststoffzapfen, 11 davon hinter der Metallrückseite des LCD. Sie stehen mindestens 1,45 mm aus der Platine heraus. Die USB-C-Buchse hat ihre Schirmlaschen unter dem Rand des Glases.
  - Deshalb hält das Gehäuse das Display **1,5 mm** von der Platine entfernt (`disp_gap`), mit auf 1 mm gekürzten Pins der Buchse und Polyimidband an dieser Ecke des LCD (die Anleitung enthält beide Schritte).
  - Die beiden 48-V-Pins der Buchse treten 0,5 mm neben der Metallkante des LCD aus, innerhalb der Tasche des Rahmens für die Pins. Der Rahmen kann keine Wand dazwischen setzen: Das Lötpad des näheren Pins endet 0,1 mm von der Kante des LCD. Das Band auf dem LCD ist dort die Isolierung.
  - Andersherum geht es nicht ohne ein längeres Gehäuse: Mit der Buchse unter dem Display schrumpft ihr Steckerraum von 51 auf 32 mm, und ein Kabel aus der Wand bräuchte einen Stecker, der 12 mm unter der Buchse endet.
- **Einschmelzmuttern nahe der Frontfläche.** Bei diesem Display und diesem Abstand liegen nur 2,3 mm zwischen Platine und Frontwand. Die Löcher für die Einschmelzmuttern der vier Platinen-Schraubdome sind 3,2 mm tief (`pcb_ins_depth`), reichen also 0,9 mm in die 2,4 mm dicke Frontwand und lassen 1,5 mm stehen. Prüfen Sie beim ersten Druck, dass das Einpressen der Einschmelzmuttern die Front nicht markiert.
- **Dock-Magnet.** Der Ring liegt bei X 30,5, Y 10,95 (Platinenpunkt 12,5, 38,2), und die Fläche des Magneten ist 10,3 mm vom Hall-Schalter entfernt. Rechnerisch ergibt das 22 mT, das Vierfache dessen, was der Schalter braucht. Prüfen Sie an der ersten Platine, dass der Schalter bei eingehängtem Leser „am Dock“ und nach dem Abheben „ab“ meldet. Die Tasche ist 10,2 mm breit für einen Tropfen Kleber; passen Sie sie an die Magnete an, die Sie kaufen.
- **Dock-Platte vor dem Näherungssensor.** Der Näherungssensor der Platine beleuchtet eine Stelle der Dock-Innenseite um X 21,4, Y -2,1 (Platinenpunkt 21,6, 51,25), von vorn gesehen 9 mm links und 13 mm unter dem Ring des Magneten. Halten Sie die Platte dort auf 9 mm ringsum eben, 13,9 mm von der Bestückungsseite der Platine entfernt und frei von Rippen, Löchern, Kabelclips und Etiketten. Der Messwert des Sensors hängt von der Farbe der Platte ab: Ein Leser muss seine Referenz erneut speichern, wenn er auf ein Dock anderer Farbe wechselt, und ein schwarzes Dock reflektiert womöglich zu wenig (noch nicht gemessen).
- **Ethernet-Buchse und PoE-Modul gegen das Dock.** Geprüft mit den 3D-Modellen der Platine (Designnotizen der Platine, „Gehäusepassung gegen die 3D-Modelle“): Die Buchse J401 ist höchstens 13,95 mm hoch, und ihre Schirmfedern reichen bis 15,21 ± 0,5 mm, laufen also bis zu 1,8 mm in die Dock-Platte, die 13,9 mm von der Platine entfernt ist. Das Gehäuse braucht eine Öffnung in der Dock-Platte unter der Buchse oder mehr Tiefe; beides ist noch nicht gezeichnet. Das PoE-Modul ist 13,35 ± 0,5 mm hoch (Zeichnung von SDAPO; dieses Gehäuse nahm 10 mm an): 0,55 mm bis zur Dock-Platte, 0,05 mm bei Maximum.
- **Betrieb im Freien.** Es gibt keine Dichtungen, die Buzzerlöcher und Kabelaussparungen sind offen, und ABS+ altert im Sonnenlicht. Behandeln Sie es als Gehäuse für Innenräume. Auch das 5-GHz-WLAN der Platine ist auf den Betrieb in Innenräumen auf den Kanälen 36 bis 64 beschränkt ([Konformitäts-Checkliste](hardware/touch-p4/compliance.md#_5-ghz-wlan)).

Die Anleitung endet mit der [vollständigen Liste](hardware/touch-p4/installation-manual.md#noch-nicht-geprüft).
