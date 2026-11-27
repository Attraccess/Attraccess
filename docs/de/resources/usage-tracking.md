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

## Automatisches Stoppen und Sitzung verlängern

Hat die Ressource eine [maximale Sitzungsdauer oder verlangt eine Dauerschätzung](resources/creating-resources.md#maximale-sitzungsdauer-und-dauerschätzung), hat die Sitzung ein automatisches Ende.

- **Schätzungsdialog:** Verlangt die Ressource eine Schätzung, öffnet sich beim Start (auch bei Übernahme, QR-Link und beaufsichtigtem Start) zuerst ein Dialog. Geben Sie ein, wie lange Sie die Maschine höchstens nutzen, in Stunden und Minuten oder per Schnellauswahl. Der Dialog zeigt die maximale Sitzungsdauer an, falls es eine gibt, und lässt keine längere Zeit zu. Spätestens nach dieser Zeit stoppt die Maschine automatisch.
- **Countdown und Verlängern:** Während die Sitzung läuft, zeigt die Ressourcenseite **Endet automatisch um HH:MM Uhr** mit einem Live-Countdown. Mit **+1 h**, **+2 h**, **+4 h**, **+6 h**, **+12 h**, **+24 h** oder **Auf Maximum verlängern** verlängern Sie. Schaltflächen, die über die maximale Sitzungsdauer hinausgehen würden, sind deaktiviert; ist nichts mehr übrig, weist die Seite darauf hin, dass das Maximum erreicht ist. Die Steuerung sehen der Sitzungsbesitzer und alle, die diese Sitzung beenden dürfen. Bei Sitzungen anderer Personen wird die Stoppzeit nur angezeigt.
- **Warnungen:** Der Sitzungsbesitzer erhält 15 und 5 Minuten vor dem Ende eine Benachrichtigung vom Typ **Ressourcennutzung endet bald** (in der App, als Push und per E-Mail, gemäß seinen Benachrichtigungseinstellungen). Eine Warnung, deren Zeitpunkt beim Start schon vorbei war, entfällt; eine Verlängerung setzt die Warnungen für das neue Ende neu.
- **Automatisches Stoppen:** Zum Endzeitpunkt beendet der Server die Sitzung als System mit der Notiz „Automatically ended: maximum session time reached“ oder „Automatically ended: estimated duration elapsed“. Endformulare werden übersprungen, [Flows](flows/overview.md) führen ihren Stopp-Zweig aus (der Strom wird also abgeschaltet, auch mitten in einem Auftrag wie einem 3D-Druck; siehe die Warnung unter [Ressourcen erstellen](resources/creating-resources.md#maximale-sitzungsdauer-und-dauerschätzung)), und die Abrechnung läuft wie bei jedem anderen Ende. Der Inhaber wird benachrichtigt. Das kann bis zu etwa eine Minute nach dem Ende dauern.
- **Parallele Sitzungen und Übernahme:** Jede Sitzung hat ihr eigenes Ende; ein automatisches Ende beendet die anderen nicht. Eine Übernahme gibt der neuen Person ein neues Ende, und sie muss eine Schätzung angeben, wenn eine verlangt wird.
- **Audit-Log:** Das Audit-Log enthält **Nutzung verlängert** und den Grund automatischer Enden.

Änderungen an den Ressourceneinstellungen ändern das Ende laufender Sitzungen nicht. Zu den Lesern siehe [Attractap-Leser](attractap/using-the-reader.md#sitzungsdauer-und-verlängern).

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

Auf Belegen und im Abrechnungsverlauf zeigt eine geteilte Sitzung den Anteil der Person am Gesamtwert (zum Beispiel „0,8 — dein Anteil an 2,4“) mit der Markierung **Geteilt** sowie eine Aufschlüsselung aller Segmente, an denen die Person beteiligt war. Siehe [Abrechnungstransaktionen](billing/transactions.md#geteilte-sitzungen). Während die Sitzung läuft, zeigt die laufende Abrechnungsansicht den bisherigen Zähleranteil (zum Beispiel „0,8 — dein Anteil an 1,2 bisher“), gekennzeichnet als „vorläufig bis zur nächsten Messung“, und dieselbe Aufschlüsselung, in der das offene Segment als vorläufig gekennzeichnet ist; eine Markierung **Geteilt** zeigt sie nicht.

Bei einem Limit von 1 ändert sich nichts. Wird ein Limit gesenkt, während Sitzungen laufen, werden überlappende Sitzungen weiterhin fair aufgeteilt. Wird es während einer Einzelsitzung erhöht, nimmt diese Sitzung ab dem Moment an den Segmenten teil, in dem andere starten.

### Maschinenstunden und Personenstunden

Berichte zeigen diese Werte getrennt, damit Personen, die eine gemeinsam genutzte Maschine gleichzeitig nutzen, nicht als zusätzliche Maschinenzeit zählen:

- **Personenstunden**: die Dauer jeder Sitzung addiert. Nutzt A die Maschine von 10:00 bis 12:00 und B von 11:00 bis 13:00, sind das 4 Stunden.
- **Maschinenstunden mit Sitzung**: die Zeit, in der mindestens eine Sitzung auf der Maschine lief. Überlappende Sitzungen zählen einmal, das Beispiel ergibt also 3 Stunden.
- **Maschinenlaufzeit**: die Zeit, in der die Maschine als laufend aufgezeichnet wurde (siehe [Flows](flows/node-types.md)), sofern Betriebsdaten vorliegen. Sie enthält auch Zeiten ohne Sitzung.

Bei einer Maschine mit **Maximale parallele Sitzungen** von 1 sind Personenstunden und Maschinenstunden mit Sitzung gleich. Die Projektstatistiken nennen die Maschinenstunden mit Sitzung kurz **Maschinenstunden**.

Die Werte finden Sie in der Karte **Betriebsdauer** auf der [Detailseite](resources/resource-details.md) der Ressource, in den Statistiken eines [Projekts](projects/overview.md#nutzungsstatistiken) und im Export [Ressourcen-Stundenübersicht](resources/csv-export.md#ressourcen-stundenübersicht). Das ändert nur, was berichtet wird: Wie die Laufzeit einzelnen Sitzungen zugerechnet wird und die Abrechnung bleiben wie oben beschrieben.

## Sitzungen mit Projekten verknüpfen

Wenn Sie aktive [Projekte](projects/overview.md) haben, können Sie eine Nutzungssitzung mit einem Projekt verknüpfen. So lässt sich nachverfolgen, welche Ressourcen für welche Projekte verwendet werden.

Die Projektzuordnung wird beim Starten der Sitzung festgelegt. Nach dem Ende einer Sitzung kann die Person, der sie gehört, sie in der Nutzungshistorie einem anderen eigenen Projekt zuordnen.

### Das Projekt einer laufenden Sitzung wechseln

Während Ihre Maschinensitzung läuft, können Sie sie einem anderen Projekt zuordnen, ohne die Maschine anzuhalten:

1. Öffnen Sie die Detailseite der Ressource
2. Klicken Sie in der laufenden Sitzung auf **Projekt wechseln**
3. Wählen Sie ein anderes Ihrer Projekte oder **Kein Projekt** und klicken Sie auf **Projekt wechseln**
4. Füllen Sie die für einen Projektwechsel erforderlichen [Formulare](forms/overview.md) aus

Alles bis zum Wechsel wird dem alten Projekt zugeordnet, alles danach dem neuen: Minuten, Betriebszeit der Maschine, [Zählerverbrauch](flows/energy-metering.md), Credits und die [Projektstatistiken](projects/overview.md#nutzungsstatistiken). Die angezeigte Dauer Ihrer Sitzung zählt weiterhin ab dem ursprünglichen Start.

- **Ein Eintrag pro Projekt.** Ein Wechsel beendet den aktuellen Nutzungseintrag und beginnt im selben Augenblick eine **Fortsetzung**. Die Historie zeigt sie als aufeinanderfolgende Zeilen; jede spätere ist als **Fortsetzung von #…** markiert. Jede Zeile hat ihre eigene Dauer und Abrechnung. Der [CSV-Export](resources/csv-export.md) enthält die ID des vorherigen Abschnitts (`previousUsageId`).
- **Die Maschine läuft weiter.** Ein Wechsel führt die [Flows](flows/node-types.md#projekt-gewechselt) **Nutzung gestartet**, **Nutzung beendet** und **Nutzung übernommen** nicht aus, verlangt keine Start-, End- oder Übernahmeformulare und sendet keine Start-, Stopp- oder Übernahme-Benachrichtigungen. Um auf einen Wechsel zu reagieren, verwenden Sie den Flow-Auslöser **Projekt gewechselt** und die Formularaktion **Projektwechsel**. Eine Endnotiz wird nicht abgefragt.
- Die **Abrechnung** richtet sich nach der Einstellung [Abrechnung beim Projektwechsel](billing/configuration.md#abrechnung-beim-projektwechsel) der Ressource. Der vorherige Abschnitt wird beim Wechsel abgerechnet.
- **Zähler** werden beim Wechsel abgelesen. Lässt sich ein kostenpflichtiger Zähler nicht lesen oder schlägt ein Projektwechsel-Flow fehl, wird der gesamte Wechsel abgelehnt: Die Sitzung läuft unter dem alten Projekt weiter.
- **Übernommen werden:** die beim Start gespeicherten Preise und der Abrechnungsfaktor, die Aufsichtsperson, der [automatische Stopp](#automatisches-stoppen-und-sitzung-verlängern) samt Verlängerungen und auf einer gemeinsam genutzten Maschine Ihr Platz (eine volle Maschine verhindert keinen Wechsel).
- **Wer wechseln darf:** nur die Person, der die Sitzung gehört. Administratoren und Ressourcenverwaltende können fremde laufende Sitzungen nicht wechseln; beendete Abschnitte können wie bisher geändert werden. Türen haben keine Sitzungen zum Wechseln.
- Wenn Ihre Installation [Aktionen auf das lokale Netzwerk beschränkt](settings/security.md), gilt für den Wechsel im Web und über die API die Regel für den Sitzungsstart.
- Eine Sitzung zählt einmal für Wartungspläne nach **Anzahl der Nutzungen**, für die Freischaltung nach beaufsichtigten Nutzungen und bei den Sitzungszahlen im Bericht zu Ressourcenstunden. Die Projektstatistiken zählen jeden Abschnitt für sein Projekt.

Sie können auch an einem [Touch-Leser](attractap/using-the-reader.md#das-projekt-einer-laufenden-sitzung-wechseln) wechseln oder über die REST-API mit `POST /api/resources/{resourceId}/usage/sessions/active/project` und dem Inhalt `{ "projectId": 12 }` (`null` für kein Projekt; `usageId` benennt optional die laufende Sitzung, damit eine inzwischen beendete Sitzung nicht mit ihrer Nachfolgerin verwechselt wird).

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
