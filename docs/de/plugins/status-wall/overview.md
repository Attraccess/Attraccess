# Statuswand

<!-- llms-description: Das Statuswand-Plugin zeigt auf einem großen Bildschirm live und ohne Anmeldung, welche Maschinen frei, in Benutzung oder in Wartung sind. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Status Wall** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Eine Statuswand ist eine Vollbildseite für einen großen Bildschirm in einer Werkstatt oder Halle. Jede Maschine ist
eine Kachel mit ihrem Bild, eingerahmt in einer Ampelfarbe, damit man quer durch den Raum sieht, was frei ist:

| Farbe | Symbol             | Bedeutung                                           |
| ----- | ------------------ | --------------------------------------------------- |
| Grün  | Haken              | Frei: niemand benutzt sie.                          |
| Gelb  | Ein/Aus            | In Benutzung, mit der bisherigen Dauer der Sitzung. |
| Rot   | Schraubenschlüssel | In Wartung, mit der bisherigen Dauer.               |

Die Kopfzeile zeigt den Namen der Wand, die Zahl der Maschinen je Zustand und die Uhrzeit. Die Kacheln passen immer
auf den Bildschirm, ob die Wand 4 oder 60 Maschinen zeigt, und behalten ihren Platz (nach Namen sortiert).

## Voraussetzungen

- Attraccess 2.0 oder neuer und das Plugin `status-wall`, installiert wie in
  [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es braucht `PLUGIN_STORAGE` (eigene Tabelle),
  `ACCESS_RESOURCES` (Maschinenzustände) und `LISTEN_EVENTS` (Live-Aktualisierung).
- Zum Einrichten von Wänden die Berechtigung **Statuswände verwalten** (`status-wall.walls.manage`). Administratoren
  und Ressourcenverwalter haben sie standardmäßig.

## Eine Wand einrichten

1. Öffne **Statuswände** in der Seitenleiste und wähle **Neue Statuswand**.
2. Gib einen Namen ein und wähle, was die Wand zeigt: **alle Ressourcen** oder einzelne Ressourcengruppen und
   Ressourcen. Eine Gruppe zeigt jede Maschine, die gerade zu ihr gehört.
   Wählen kannst du nur Ressourcen und Gruppen, die du selbst sehen darfst (siehe
   [Wer die Maschinenliste sehen darf](settings/overview.md#sichtbarkeit-der-maschinenliste)), und **alle Ressourcen**
   kannst du nur speichern, wenn deine eigene Maschinenliste nicht eingeschränkt ist. Eine gewählte Gruppe zeigt alle
   ihre Maschinen, auch solche, die du selbst nicht sehen darfst, und **alle Ressourcen** zeigt auch Maschinen, die nur
   in verborgenen Ressourcengruppen liegen.

   Beim Speichern wird die ganze Auswahl geprüft, auch was früher oder von jemand anderem gespeichert wurde. Enthält
   eine Wand eine Ressource oder eine Gruppe, die du nicht mehr sehen darfst, kannst du sie erst
   speichern (auch nur zum Umbenennen), nachdem du den Eintrag entfernt hast. Der Dialog führt ihn nicht auf: Wähle bei Ressourcen
   **Auswahl leeren** und wähle sie neu aus, bei Gruppen **Aus der Auswahl entfernen**. Das ändert, was die Wand
   zeigt. Soll sie so bleiben, bitte jemanden, der alles darauf sehen darf, sie zu bearbeiten. Gelöschte Ressourcen
   und Gruppen verhindern das Speichern nicht.
3. Speichere. Der Dialog zeigt den Link der Wand. Öffne ihn auf dem Bildschirm oder kopiere ihn in dessen Browser.

Du kannst beliebig viele Wände einrichten, zum Beispiel eine je Halle. Das **⋮**-Menü einer Wand öffnet sie, zeigt
ihren Link erneut, bearbeitet sie, erstellt einen neuen Link oder löscht sie.

Ein Doppelklick auf die Wand schaltet auf dem Bildschirm in den Vollbildmodus. Die Seite hält die Anzeige wach, wo der
Browser es erlaubt.

## Der Link

Der Link enthält ein langes zufälliges Geheimnis und braucht kein Konto, ein Bildschirm muss sich also nie anmelden.
Wer den Link hat, sieht die Wand. Eine Wand zeigt nur Namen, Bilder und Zustände der Maschinen: nie, wer eine Maschine
benutzt oder warum sie in Wartung ist.

- **Neuer Link** ersetzt das Geheimnis. Bildschirme mit dem alten Link zeigen „Dieser Link ist nicht mehr gültig“ und
  brauchen den neuen.
- **Löschen** entfernt die Wand; ihr Link funktioniert sofort nicht mehr.
- Links sind auf 120 Abrufe pro Minute je Bildschirm und Wand begrenzt, weit mehr als ein Bildschirm braucht.

## Wie sie aktuell bleibt

Der Bildschirm bekommt eine Nachricht vom Server, sobald eine Sitzung beginnt, übernommen wird oder endet oder eine
Wartung angelegt oder beendet wird, und lädt die Wand innerhalb etwa einer Sekunde neu. Zusätzlich lädt er jede Minute
neu; so erscheinen neue Namen und Bilder, Maschinen, die einer Gruppe hinzugefügt wurden, und Wartungen, die zu einer
geplanten Zeit beginnen. Ist der Server nicht erreichbar, zeigt die Wand weiter den letzten Stand mit einem Symbol
„keine Verbindung“ in der Kopfzeile.
