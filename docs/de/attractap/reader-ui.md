# Reader-Anzeige

Plugins können kleine Widgets auf Attractap-Readern anzeigen und vor dem Start einer Sitzung eine Bestätigung
verlangen. Diese Seite beschreibt, was jeder Reader anzeigen kann, und die Admin-Einstellungen, die in der
Oberfläche **Reader-Anzeige** heißen. Den Vertrag für Plugin-Entwickler finden Sie unter
[Plugins entwickeln](plugins/developing-plugins.md#reader-ui-und-start-hooks).

## Fähigkeiten

Attractap-Reader melden in `READER_FIRMWARE_INFO` (`capabilities.ui`), was sie anzeigen können. Plugins und Admins
nutzen das, um zu entscheiden, was ein Reader erhält. Firmware ohne `ui` gilt als **Schema-Version 0**: keine
Plugin-Widgets und keine Bestätigungsschritte.

| Fähigkeit                                                      | Touch (WLAN / Ethernet), aktuelle Firmware | Lite                      | Ältere Firmware (ohne `ui`) |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------- | --------------------------- |
| Schema-Version                                                 | 1                                          | 1                         | 0                           |
| Display                                                        | Touch-LCD                                  | keins                     | Touch-LCD                   |
| Slot-Widgets (`resourceList.row.status`, `resource.details.*`) | ja                                         | nein                      | nein                        |
| Startbestätigung (`confirm`)                                   | ja                                         | nur `card-confirm`        | nein                        |
| Popup mit Sperrgrund                                           | ja                                         | rotes „blockiert“-Blinken | allgemeines Fehler-Popup    |
| Frage nach dem Stopp                                           | ja                                         | nein (Standardantwort)    | nein (Standardantwort)      |
| LEDs / Summer                                                  | Summer                                     | LEDs und Summer           | wie bisher                  |
| Zeichensatz                                                    | Latin-1                                    | –                         | Latin-1                     |

Vor einem Start können Plugins vorerst nur einen `confirm`-Schritt verlangen: Der Pre-Start-Hook erlaubt, fragt
nach oder blockiert. Die Startschritte `choose` und `info` sind in Schema und Firmware enthalten, aber für eine
spätere Version reserviert. Die Frage nach dem Stopp nutzt einen eigenen Auswahlschritt.

Grenzen pro Reader: 3072 Byte Nutzlast, 4096 Byte pro Frame, 32 Knoten pro Baum, Tiefe 5, 64 aktive Knoten.

## Reader ohne Bildschirm

Ein Reader mit Bildschirm und aktueller Firmware zeigt die Bestätigung an. Kann er sie gerade nicht anzeigen, wird
der Start mit „Bestätigung nicht möglich“ blockiert (Code `CONFIRMATION_UNAVAILABLE`); die Einstellung für Reader
ohne Bildschirm gilt dort nie.

Die Einstellung **Reader ohne Bildschirm** der Ressource gilt für Reader, die den Bestätigungsschritt nicht anzeigen
können: Lite-Reader, Reader mit älterer Firmware (ohne Reader-UI) und Reader, deren Plugin-Widgets nach
wiederholten Abstürzen ausgesetzt sind.

| Einstellung          | Verhalten                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block` (Standard)   | Die Sitzung startet nicht. Lite zeigt einen bernsteinfarbenen Halbring („reserviert“), dann das rote „blockiert“-Blinken; ein Touch-Reader zeigt den Text des Plugins (ältere Firmware einen allgemeinen Fehler).                         |
| `card-confirm`       | Nur Lite: Ein bernsteinfarbener Ring leert sich über das Bestätigungsfenster, dazu ein Piepton. Ein zweites kurzes Auflegen **derselben Person** startet die Sitzung; die Karte einer anderen Person bricht ab. Andere Reader blockieren. |
| `allow-with-warning` | Die Sitzung startet **ohne Bestätigung**; Lite zeigt das Warnmuster.                                                                                                                                                                      |

Blockiert ein Plugin selbst (`block`), zeigt Lite das rote „blockiert“-Blinken. Das Plugin legt die
Standardeinstellung fest; Admins überschreiben sie pro Ressource unter **Ressourceneinstellungen → Reader-Anzeige**.
„Plugin-Standard“ übernimmt die Wahl des Plugins (`block`, wenn es keine trifft). Plugins können weder LEDs noch
Töne direkt ansteuern.

## Admin-Einstellungen

- **Ressourceneinstellungen → Reader-Anzeige:** die Einstellung für Reader ohne Bildschirm und pro Plugin, ob es
  Widgets anzeigt und was passiert, wenn sein Hook ausfällt („Start blockieren“, der Standard, oder „Start
  erlauben“, wird protokolliert).
- **Reader-Editor → Tab „Reader-Anzeige“:** Plugin-Widgets für diesen Reader an oder aus. Widgets erscheinen nur,
  wenn die Einstellung der Ressource und die des Readers an sind. Dieser Tab speichert sofort, nicht mit dem
  Speichern-Button des Editors.
- Derselbe Tab listet jeden Plugin-Beitrag als **Angezeigt**, **Eingeschränkt** oder **Übersprungen** mit Grund,
  zum Beispiel „zu viele Widget-Elemente auf diesem Reader“ oder „vom Reader verworfen“.

## Alarme

**Alarme der Reader-Anzeige** stehen in den Plugin-Einstellungen und, für einen Reader, im Reader-Editor:

| Alarm                                                 | Wirkung                                                                                                  | Endet von selbst                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Plugin-Hook nach wiederholten Fehlern deaktiviert     | Starts folgen der Ausfallrichtlinie des Plugins, ohne den Hook aufzurufen.                               | wenn der Hook wieder antwortet: nach 60 s ruft ihn der nächste Start einmal auf |
| Plugin mit Zugriffs-Hooks konnte nicht geladen werden | Die Start-Hooks des Plugins werden nicht angewendet.                                                     | wenn das Plugin wieder lädt                                                     |
| Reader nach Absturz gesperrt                          | Keine Plugin-Widgets auf diesem Reader; Bestätigungen folgen der Einstellung für Reader ohne Bildschirm. | nach 30 Minuten ohne weiteren Absturz                                           |

**Quittieren** beendet einen Alarm vorzeitig. Für Plugin-Alarme ist die Berechtigung zum Verwalten von Plugins
nötig, für Crash-Loop-Alarme eines Readers die Berechtigung zum Verwalten von Readern. Jede Änderung wird
protokolliert.
