# Reader-UI-Fähigkeiten

Attractap-Reader melden in `READER_FIRMWARE_INFO` (`capabilities.ui`), was sie anzeigen können. Plugins und Admins
nutzen das, um zu entscheiden, was ein Reader erhält. Firmware ohne `ui` gilt als **Schema-Version 0**: keine
Plugin-Widgets und keine Bestätigungsschritte.

| Fähigkeit                                                      | Touch (WLAN / Ethernet), aktuelle Firmware | Lite                   | Ältere Firmware (ohne `ui`) |
| -------------------------------------------------------------- | ------------------------------------------ | ---------------------- | --------------------------- |
| Schema-Version                                                 | 1                                          | 1                      | 0                           |
| Display                                                        | Touch-LCD                                  | keins                  | Touch-LCD                   |
| Slot-Widgets (`resourceList.row.status`, `resource.details.*`) | ja                                         | nein                   | nein                        |
| Startschritte (`confirm`, `choose`, `info`)                    | ja                                         | nur `card-confirm`     | nein                        |
| Popup mit Sperrgrund                                           | ja                                         | LED-Muster             | allgemeines Fehler-Popup    |
| Frage nach dem Stopp                                           | ja                                         | nein (Standardantwort) | nein (Standardantwort)      |
| LEDs / Summer                                                  | Summer                                     | LEDs und Summer        | wie bisher                  |
| Zeichensatz                                                    | Latin-1                                    | –                      | Latin-1                     |

Grenzen pro Reader: 3072 Byte Nutzlast, 4096 Byte pro Frame, 32 Knoten pro Baum, Tiefe 5, 64 aktive Knoten.

## Reader ohne Bildschirm

Auf einem Lite-Reader lässt sich keine Bestätigung anzeigen. Die **Richtlinie für Geräte ohne Bildschirm** der
Ressource entscheidet:

| Richtlinie           | Verhalten                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block` (Standard)   | Bernsteinfarbener Halbring („reserviert“), dann das rote „blockiert“-Muster. Die Sitzung startet nicht.                                                                                               |
| `card-confirm`       | Bernsteinfarbener Ring, der sich über das Bestätigungsfenster leert, und ein Piepton. Ein zweites kurzes Auflegen **derselben Person** startet die Sitzung; die Karte einer anderen Person bricht ab. |
| `allow-with-warning` | Die Sitzung startet mit einem Warnmuster.                                                                                                                                                             |

Das Plugin legt den Standard fest; Admins überschreiben ihn pro Ressource unter **Ressourceneinstellungen → Reader-Anzeige**.
Plugins können weder LEDs noch Töne direkt ansteuern.

## Admin-Einstellungen

- Pro Ressource: Überschreibung der Richtlinie, Widgets pro Plugin an oder aus und Ausfallrichtlinie des Hooks pro
  Plugin (standardmäßig fail closed, fail open wird protokolliert).
- Pro Reader (Reader-Editor): Plugin-Widgets an oder aus. Widgets erscheinen nur, wenn beide Schalter an sind.
- Die Reader-Ansicht listet jeden Beitrag als `rendered`, `degraded` oder `skipped` mit Grund.
- Offene Circuit-Breaker- und Crash-Loop-Alarme werden dort angezeigt und können quittiert werden.
