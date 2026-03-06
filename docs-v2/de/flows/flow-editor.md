# Flow-Editor

Der Flow-Editor ist ein visuelles Drag-and-Drop-Werkzeug zum Erstellen von Automatisierungs-Workflows. Er ist über den Tab **Flows** auf jeder Ressourcen-Detailseite erreichbar.

## Editor öffnen

1. Navigieren Sie zur [Detailseite](resources/resource-details.md) einer Ressource
2. Klicken Sie auf den Tab **Flows**
3. Klicken Sie auf einen bestehenden Flow, um ihn zu bearbeiten, oder auf **Flow erstellen**, um einen neuen zu beginnen

<!-- TODO: Screenshot des Flow-Editors -->

## Editorübersicht

Der Editor besteht aus:

- **Arbeitsfläche** -- Der Hauptbereich, in dem Sie Ihren Flow durch Platzieren und Verbinden von Knoten aufbauen
- **Knotenpalette** -- Ein Bereich, der alle verfügbaren Knotentypen nach Kategorie sortiert auflistet
- **Ausführungsprotokolle** -- Ein Bereich, der den Echtzeit-Ausführungsstatus anzeigt

## Knoten hinzufügen

1. Finden Sie den gewünschten Knoten in der **Knotenpalette** auf der linken Seite
2. Ziehen Sie den Knoten auf die Arbeitsfläche
3. Der Knoten erscheint mit seinen Konfigurationsoptionen

> [!TIP]
> Sie können auch auf einen Knoten in der Palette doppelklicken, um ihn automatisch zur Arbeitsfläche hinzuzufügen.

## Knoten verbinden

Knoten haben **Anschlüsse** (kleine Kreise) an ihren Kanten:

- **Ausgangsanschlüsse** befinden sich auf der rechten Seite eines Knotens
- **Eingangsanschlüsse** befinden sich auf der linken Seite eines Knotens

Um zwei Knoten zu verbinden:

1. Klicken und halten Sie auf einen **Ausgangsanschluss** des Quellknotens
2. Ziehen Sie die Verbindungslinie zu einem **Eingangsanschluss** des Zielknotens
3. Lassen Sie los, um die Verbindung zu erstellen

> [!NOTE]
> Nicht alle Knotenkombinationen sind gültig. Der Editor verhindert ungültige Verbindungen (z.B. zwei Eingabeknoten direkt verbinden).

## Knoten konfigurieren

Klicken Sie auf einen beliebigen Knoten, um dessen Einstellungen zu öffnen. Jeder Knotentyp hat eigene Konfigurationsoptionen -- siehe [Knotentypen](flows/node-types.md) für Details.

## Auto-Layout

Klicken Sie auf den **Auto-Layout** Button in der Werkzeugleiste, um alle Knoten automatisch in einem übersichtlichen, gut lesbaren Layout anzuordnen. Dies ist nützlich, wenn viele Knoten hinzugefügt wurden oder die Arbeitsfläche unübersichtlich geworden ist.

## Import & Export

Sie können Flows zwischen Ressourcen teilen oder sichern:

| Aktion | Vorgehensweise |
|--------|---------------|
| **Export** | Klicken Sie auf **Export**, um den Flow als JSON-Datei herunterzuladen |
| **Import** | Klicken Sie auf **Import** und wählen Sie eine zuvor exportierte JSON-Datei |

> [!NOTE]
> Importierte Flows müssen möglicherweise angepasst werden, wenn die Zielressource andere Einstellungen hat als die Quellressource.

## Ausführungsprotokolle

Das Ausführungsprotokoll zeigt den Echtzeit-Status jedes Knotens während der Flow-Ausführung. Die Knotenfarben zeigen den aktuellen Zustand an:

| Farbe | Status |
|-------|--------|
| **Grau** | Inaktiv -- noch nicht ausgeführt |
| **Blau** | Verarbeitung -- wird gerade ausgeführt |
| **Grün** | Abgeschlossen -- erfolgreich beendet |
| **Rot** | Fehlgeschlagen -- ein Fehler ist aufgetreten |

<!-- TODO: Screenshot der Ausführungsprotokolle mit Farbindikatoren -->

## Flow speichern

Klicken Sie auf **Speichern** in der Werkzeugleiste, um Ihre Änderungen zu speichern. Der Flow ist sofort aktiv und wird ausgelöst, wenn seine Eingabebedingungen erfüllt sind.

## Siehe auch

- [Knotentypen](flows/node-types.md) -- Alle verfügbaren Knoten und ihre Einstellungen
- [Flows-Überblick](flows/overview.md) -- Was Flows sind und wie sie funktionieren
