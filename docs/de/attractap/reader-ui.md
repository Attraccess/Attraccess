# Reader-Anzeige

Plugins, zum Beispiel ein Reservierungs-Plugin, können kurze Hinweise auf dem Bildschirm von Attractap-Readern
anzeigen, Mitglieder vor dem Start einer Maschine um eine Bestätigung bitten, einen Start mit Begründung ablehnen
und nach dem Stopp eine kurze Frage stellen. Diese Seite erklärt, was Mitglieder sehen, welche Reader was anzeigen
können und welche Einstellungen Admins haben. In der Admin-Oberfläche heißt das alles **Reader-Anzeige**. Den
technischen Vertrag für Plugin-Entwickler finden Sie unter
[Plugins entwickeln](plugins/developing-plugins.md#reader-ui-und-start-hooks).

## Was Mitglieder sehen

- **Hinweise auf dem Bildschirm (Widgets):** ein kurzer Status neben einer Ressource in der Liste oder auf ihrer
  Detailseite, zum Beispiel „Reserviert 14:00–16:00“. Der eigene Status des Readers (in Benutzung, Wartung, nicht
  verfügbar, Einweisung erforderlich) kommt immer zuerst; ein Plugin-Hinweis erscheint nur, wenn keiner davon
  zutrifft. Ein Reader, an dem niemand angemeldet ist, zeigt nie persönliche Daten oder Namen anderer Personen.
- **Bestätigung vor dem Start:** Der Reader zeigt die Frage des Plugins, zum Beispiel „Diese Maschine ist um 14:00
  reserviert. Trotzdem starten?“, mit **Abbrechen** und **Start**. Abbrechen oder Warten, bis die Frage
  verschwindet (nach etwa einer Minute), startet nichts; der Reader kehrt zur Ressource zurück. In der Web-App
  erscheint dieselbe Frage als Dialog; läuft sie ab, sagt die Web-App das und bittet, erneut zu starten. Der Start
  per QR-Code und das Übernehmen einer fremden Sitzung stellen dieselbe Frage.
- **Abgelehnter Start:** Der Reader zeigt die Begründung des Plugins auf dem Bildschirm, zum Beispiel wer die
  Maschine bis wann reserviert hat. Die Web-App zeigt dieselbe Begründung als Hinweis.
- **Frage nach dem Stopp:** Manche Plugins stellen direkt nach dem Ende einer Sitzung eine kurze Frage, zum
  Beispiel ob die Maschine sauber hinterlassen wurde. Die Sitzung ist dann bereits beendet; wer nicht innerhalb
  von etwa 15 Sekunden antwortet, wählt damit die Standardantwort des Plugins. In der Web-App gilt die
  Standardantwort.
- **„Vorübergehend nicht startbar“:** Das Plugin, das Starts prüft, antwortet nicht, deshalb kann der Start nicht
  stattfinden. Versuchen Sie es gleich erneut oder fragen Sie das Team. „Bestätigung nicht möglich“ bedeutet, dass
  der Reader die Frage in diesem Moment nicht anzeigen konnte; halten Sie die Karte erneut an.
- **Reader offline:** Solange ein Reader keine Verbindung zum Server hat, startet nichts, und Plugin-Hinweise
  verschwinden.

## Welche Reader was anzeigen können

| Reader                             | Hinweise auf dem Bildschirm | Bestätigung vor dem Start                 | Abgelehnter Start             | Frage nach dem Stopp   |
| ---------------------------------- | --------------------------- | ----------------------------------------- | ----------------------------- | ---------------------- |
| Attractap Touch, aktuelle Firmware | ja                          | auf dem Bildschirm                        | Begründung auf dem Bildschirm | ja                     |
| Attractap Lite (nur LEDs)          | nein                        | zweites Auflegen der Karte, falls erlaubt | rotes Blinken                 | nein (Standardantwort) |
| Attractap Touch, ältere Firmware   | nein                        | nein (siehe unten)                        | allgemeiner Fehler            | nein (Standardantwort) |

Lite-Reader antworten mit ihren LEDs: Ein bernsteinfarbener Halbring gefolgt von rotem Blinken bedeutet, dass der
Start abgelehnt wurde. Ein bernsteinfarbener Ring, der sich langsam leert, mit einem Piepton bedeutet „Karte zum
Bestätigen erneut auflegen“. Das Warnmuster bedeutet, dass die Maschine gestartet ist, aber mit der Warnung des
Plugins.

## Reader ohne Bildschirm

Manche Reader können keine Bestätigung anzeigen: Lite-Reader, Reader mit älterer Firmware und Reader, deren
Plugin-Hinweise nach wiederholten Abstürzen pausiert sind (siehe [Alarme](#alarme)). Verlangt ein Plugin auf einem
solchen Reader eine Bestätigung, entscheidet die Ressourceneinstellung **Reader ohne Bildschirm**:

| Einstellung                                   | Was passiert                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start blockieren** (Standard)               | Die Maschine startet nicht. Lite zeigt den bernsteinfarbenen Halbring und das rote Blinken; ein Touch-Reader mit älterer Firmware zeigt einen allgemeinen Fehler.                                       |
| **Mit zweitem Auflegen der Karte bestätigen** | Nur Lite: Der bernsteinfarbene Ring leert sich, ein Piepton. Ein zweites kurzes Auflegen **derselben Person** startet die Maschine; die Karte einer anderen Person bricht ab. Andere Reader blockieren. |
| **Mit Warnung starten**                       | Die Maschine startet **ohne** Nachfrage. Lite zeigt das Warnmuster.                                                                                                                                     |
| **Plugin-Standard**                           | Übernimmt den Vorschlag des Plugins (Blockieren, wenn es keinen macht).                                                                                                                                 |

Ein Touch-Reader mit aktueller Firmware zeigt die Frage immer selbst an; diese Einstellung gilt für ihn nie.
Plugins können LEDs und Töne nicht direkt steuern.

## Admin-Einstellungen

- **Ressourceneinstellungen → Reader-Anzeige:**
  - **Reader ohne Bildschirm**, siehe oben.
  - Pro Plugin: **Widgets auf Readern anzeigen** (die Hinweise des Plugins zu dieser Ressource) und **Wenn die
    Prüfung des Plugins fehlschlägt**. „Start blockieren“ (empfohlen) hält die Maschine geschlossen, solange das
    Plugin einen Start nicht prüfen kann. „Start erlauben“ lässt trotzdem starten; jeder solche Start wird im
    Audit-Log festgehalten.
- **Reader-Editor → Tab „Reader-Anzeige“:** **Plugin-Widgets auf diesem Reader anzeigen**. Hinweise erscheinen
  nur, wenn dieser Schalter und der Schalter der Ressource an sind. Dieser Tab speichert sofort, nicht mit dem
  Speichern-Button des Editors.
- Derselbe Tab listet, **was Plugins auf diesem Reader anzeigen**, pro Plugin und Ressource: **Angezeigt**, **Als
  einfacher Text angezeigt** (der Reader kann das Layout des Plugins nicht darstellen und zeigt stattdessen dessen
  Text) oder **Nicht angezeigt** mit Grund, zum Beispiel „kein Platz mehr auf dem Bildschirm des Readers“ oder
  „der Reader hat es abgelehnt“.

## Alarme

**Alarme der Reader-Anzeige** stehen unten in den Plugin-Einstellungen und, für einen Reader, im Tab
„Reader-Anzeige“ des Reader-Editors. Jeder Alarm sagt, was betroffen ist und was zu tun ist:

| Alarm                                  | Bedeutung                                                                                                                                                         | Was zu tun ist                                                                                                                                                  | Endet von selbst                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Plugin-Prüfung schlägt wiederholt fehl | Das Plugin konnte mehrere Starts hintereinander nicht prüfen und wird nicht mehr gefragt. Starts folgen „Wenn die Prüfung des Plugins fehlschlägt“ der Ressource. | Nach 60 Sekunden wird das Plugin erneut gefragt; **Aufheben** fragt es sofort. Schlägt es weiter fehl, prüfen Sie das Log des Plugins oder deaktivieren Sie es. | wenn das Plugin wieder antwortet      |
| Plugin konnte nicht geladen werden     | Das Plugin wurde nicht geladen. Seine Prüfungen und Bestätigungen werden nicht angewendet; Starts laufen ohne sie.                                                | Prüfen Sie den Fehler des Plugins auf der Plugin-Seite und laden oder installieren Sie es neu.                                                                  | wenn das Plugin wieder lädt           |
| Reader stürzt wiederholt ab            | Der Reader ist wiederholt neu gestartet. Plugin-Hinweise sind auf ihm pausiert, Bestätigungen folgen „Reader ohne Bildschirm“.                                    | Warten oder mit **Aufheben** die Hinweise sofort wieder einschalten. Stürzt er weiter ab, aktualisieren Sie seine Firmware oder melden Sie den Absturz.         | nach 30 Minuten ohne weiteren Absturz |

Zum Aufheben eines Plugin-Alarms ist die Berechtigung zum Verwalten von Plugins nötig, für einen Reader-Alarm die
Berechtigung zum Verwalten von Readern. Das Auslösen und Aufheben von Alarmen wird im Audit-Log festgehalten.

## Audit-Log

Unter **Einstellungen → Audit-Log** finden Admins unter anderem: „Plugin-Startprüfung entschieden“, „Abfrage am
Lesegerät angezeigt / beantwortet / abgelaufen / abgebrochen“, „Einstellung für Lesegeräte ohne Bildschirm
angewendet“, „Start trotz fehlgeschlagener Plugin-Prüfung erlaubt“, „Plugin-Prüfung nach Fehlern pausiert oder
fortgesetzt“, „Alarm der Reader-Anzeige ausgelöst oder aufgehoben“ und „Einstellung der Reader-Anzeige geändert“.
