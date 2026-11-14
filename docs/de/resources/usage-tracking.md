# Nutzungsverfolgung
<!-- llms-description: Wie Nutzungssitzungen gestartet, beendet, gemeinsam genutzt, mit Projekten verknüpft und in der Nutzungshistorie eingesehen werden. -->

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
> **Flows bei gemeinsam genutzten Maschinen (Limit über 1).** [Flows](flows/overview.md) laufen bei jedem Sitzungsstart und -ende. Ein Flow, der beim Sitzungsende den Strom abschaltet, schaltet ihn daher für alle Nutzenden der Maschine ab, sofern er nicht `activeSessions` prüft (siehe [Aktive Sitzungen auf gemeinsam genutzten Maschinen](flows/payloads-variables-templates.md#aktive-sitzungen-auf-gemeinsam-genutzten-maschinen)). Die Ressourceneinstellungen listen im Abschnitt **Ressourcentyp und Verhalten** die Flows auf, die das nicht prüfen. Bei einem Limit von 1 gilt das nicht.

### Abrechnung bei gemeinsam genutzten Maschinen

Jede Person wird für ihre eigene Sitzung abgerechnet. Die Gebühren jeder Person stehen auf ihrer eigenen Abrechnungstransaktion und zählen für ihr eigenes [Projekt](#sitzungen-mit-projekten-verknüpfen).

- **Nutzungsgebühr und Sitzungszeit** bleiben pro Person und werden nie aufgeteilt. Die Sitzungszeit ist die eigene Sitzungsdauer der Person, aufgerundet auf volle Minuten.
- **Zähler (zum Beispiel Energie) und Laufzeit** werden fair aufgeteilt. Jeder Start und jedes Ende einer Sitzung auf der Maschine schließt das aktuelle Zeitsegment und eröffnet ein neues. Jedes Segment speichert seinen Zeitraum, den zwischen den beiden Grenzmessungen gemessenen Verbrauch, die Betriebszeit der Maschine darin und welche Sitzungen aktiv waren. Verbrauch und Betriebszeit eines Segments werden zu gleichen Teilen auf die in diesem Segment aktiven Sitzungen verteilt. Insgesamt wird also nie mehr berechnet, als die Maschine tatsächlich verbraucht hat oder gelaufen ist.
- Eine Sitzung, die nie ein Segment mit einer anderen Sitzung geteilt hat, wird genau wie bei einer Einzelnutzung abgerechnet (Laufzeit auf volle Minuten aufgerundet). Sobald eine Sitzung ein Segment geteilt hat, wird ihre Laufzeit nach exakten Anteilen berechnet, da ein Aufrunden pro Person Guthaben aus dem Nichts erzeugen würde.
- Jeder Zähler hat die Einstellung **Zuordnung**, mit der er stattdessen auf **Pro Sitzung gemessen** umgestellt werden kann. Details, Rundung, fehlgeschlagene Messungen und nicht teilbare Zähler siehe [Zähler bei gemeinsam genutzten Maschinen](flows/energy-metering.md#zähler-bei-gemeinsam-genutzten-maschinen).

Beispiel: Eine Maschine verbraucht 8 kWh zu 30 Credits pro kWh. Person A ist allein für 2 kWh aktiv, A und B zusammen für 2 kWh und B allein für 4 kWh. A zahlt 2 + 1 = 3 kWh = 90 Credits, B zahlt 1 + 4 = 5 kWh = 150 Credits.

Auf Belegen, im Abrechnungsverlauf und in der laufenden Sitzungsabrechnung zeigt eine geteilte Sitzung den Anteil der Person (zum Beispiel „0,8 kWh - Ihr Anteil an 2,4 kWh“) mit der Markierung **geteilt** sowie eine Aufschlüsselung aller Segmente, an denen die Person beteiligt war. Siehe [Abrechnungstransaktionen](billing/transactions.md#geteilte-sitzungen).

Bei einem Limit von 1 ändert sich nichts. Wird ein Limit gesenkt, während Sitzungen laufen, werden überlappende Sitzungen weiterhin fair aufgeteilt. Wird es während einer Einzelsitzung erhöht, nimmt diese Sitzung ab dem Moment an den Segmenten teil, in dem andere starten.

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
