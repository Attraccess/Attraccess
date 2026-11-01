# Nutzungsverfolgung

Attraccess erfasst, wer welche Ressource wann nutzt. Jede Nutzungssitzung wird in der Nutzungshistorie der Ressource aufgezeichnet.

Wer sehen darf, ob eine Ressource in Benutzung ist und von wem, hängt von der Einstellung [Sichtbarkeit der Ressourcennutzung](settings/overview.md#sichtbarkeit-der-ressourcennutzung) ab. Die eigenen Sitzungen sehen Sie immer.

## Was ist eine Nutzungssitzung?

Eine Nutzungssitzung stellt einen einzelnen Nutzungszeitraum einer Ressource dar. Sie wird erstellt, wenn ein Benutzer die Nutzung startet, und abgeschlossen, wenn er sie beendet.

Jede Sitzung enthält:

| Feld          | Beschreibung                          |
| ------------- | ------------------------------------- |
| **Benutzer**  | Wer die Ressource genutzt hat         |
| **Startzeit** | Wann die Sitzung begonnen hat         |
| **Endzeit**   | Wann die Sitzung beendet wurde        |
| **Dauer**     | Wie lange die Ressource genutzt wurde |
| **Notizen**   | Optionale Notizen zur Sitzung         |
| **Projekt**   | Optionales zugehöriges Projekt        |

## Sitzung starten

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource
2. Klicken Sie auf **Sitzung starten**
3. Je nach Konfiguration der Ressource müssen Sie möglicherweise ein [Formular](forms/overview.md) ausfüllen

> [!NOTE]
> Sie müssen für die Ressource (oder eine Gruppe, die sie enthält) [eingewiesen](resources/introductions.md) sein, bevor Sie eine Sitzung starten können.

<!-- TODO: Screenshot des Sitzungsstarts einfügen -->

## Sitzung beenden

1. Öffnen Sie die Detailseite der Ressource
2. Klicken Sie auf **Sitzung beenden**
3. Je nach Konfiguration der Ressource müssen Sie möglicherweise ein Formular ausfüllen

## Gemeinsam genutzte Maschinen (parallele Sitzungen)

Eine Maschine kann über **Maximale parallele Sitzungen** von mehreren Personen gleichzeitig genutzt werden (siehe [Ressourcen erstellen](resources/creating-resources.md#maximale-parallele-sitzungen)). Jede Person hat ihre eigene Sitzung; pro Maschine ist nur eine aktive Sitzung je Person möglich. Ein Start wird mit **Sitzung bereits aktiv** abgelehnt, wenn Sie bereits eine Sitzung haben, oder mit **Maschine ist voll**, wenn alle Plätze belegt sind. Eine beaufsichtigte Sitzung zählt als eine Sitzung (die der beaufsichtigten Person); die [Aufsicht](resources/introductions.md#beaufsichtigungsmodus) zählt nicht zum Limit.

Jede Person beendet ihre eigene Sitzung. Ressourcenverwalter, Einweiser, Wartende und die Aufsicht einer Sitzung können die gewählte Sitzung einer anderen Person beenden, indem sie diese auf der [Detailseite](resources/resource-details.md) aus der Liste der aktiven Sitzungen auswählen und auf **Sitzung beenden** klicken.

> [!WARNING]
> **Flows und Abrechnung bei gemeinsam genutzten Maschinen (Limit über 1).** Flows und Abrechnung berücksichtigen nicht, wie viele Sitzungen laufen. Bei einem Limit von 1 gilt dieser Abschnitt nicht.
>
> - **Flows** laufen bei jedem Sitzungsstart und -ende. Ein Flow, der beim Sitzungsende den Strom abschaltet, schaltet ihn daher für alle Nutzenden der Maschine ab. Eine Berücksichtigung der Sitzungsanzahl in Flows ist geplant.
> - **Nutzungsgebühren** pro Nutzung werden pro Sitzung berechnet.
> - **Abrechnung nach Sitzungszeit** erfolgt pro Sitzung.
> - **Zähler (zum Beispiel Energie):** Die am frühesten gestartete, noch laufende Sitzung besitzt den Zähler und wird mit ihrem Verbrauch belastet. Später überlappende Sitzungen werden für bereits belegte Zähler weder gemessen noch berechnet. Endet diese Sitzung, während andere weiterlaufen, wird der Zähler wie üblich abgelesen, und den noch laufenden Sitzungen wird kein weiterer Zählerverbrauch berechnet. Der Zähler ist dann wieder frei: Die nächste Sitzung, die startet, während er frei ist, erhält den Zähler und wird mit seinem Verbrauch belastet.
> - **Laufzeit (Betriebszeit)** wird zu jedem Zeitpunkt genau einer Sitzung zugerechnet, der am frühesten gestarteten aktiven. Die insgesamt berechnete Zeit übersteigt daher nie die Betriebszeit der Maschine.
>
> Eine faire Aufteilung von Zählern und Laufzeit auf gleichzeitige Sitzungen ist geplant.

## Sitzungen mit Projekten verknüpfen

Wenn Sie aktive [Projekte](projects/overview.md) haben, können Sie eine Nutzungssitzung mit einem Projekt verknüpfen. So lässt sich nachverfolgen, welche Ressourcen für welche Projekte verwendet werden.

Die Projektzuordnung wird beim Starten der Sitzung festgelegt.

## Nutzungshistorie

Die Nutzungshistorie wird auf der [Detailseite](resources/resource-details.md) der Ressource in chronologischer Reihenfolge angezeigt. Sie zeigt alle vergangenen und aktuellen Sitzungen.

<!-- TODO: Screenshot der Nutzungshistorie einfügen -->

Personen mit **Ressourcen bearbeiten** (`resources.update`) oder **Ressourcen-Zugriff verwalten** (`resources.access.manage`) sowie in die Ressource eingewiesene Personen (direkt oder über eine Gruppe, einschließlich Einweisern und Wartenden) sehen die Sitzungen aller Benutzer. Alle anderen sehen nur ihre eigenen Sitzungen sowie projektbezogene Sitzungen eines [Projekts](projects/overview.md), in dem sie Mitglied sind.

Ist **Nur in die Ressource eingewiesene Personen** gewählt, sehen Personen, die nicht eingewiesen sind, aber eine Ressource mit beaufsichtigter Nutzung verwenden könnten, dort nur **Verfügbar** oder **In Benutzung**: Der ungefilterte Verlauf zeigt die übrigen Sitzungen geschwärzt, nur mit Zeiten und ohne Namen oder Details. Den Verlauf nach einer anderen Person zu filtern ist für sie nicht möglich.

## Siehe auch

- [Detailseite](resources/resource-details.md)
- [Einweisungen](resources/introductions.md)
- [CSV-Export](resources/csv-export.md)
- [Projekte](projects/overview.md)
- [Formulare](forms/overview.md)
