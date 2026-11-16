# Reservierungen administrieren
<!-- llms-description: Wie Administratoren das Plugin Reservierungen installieren, konfigurieren und betreiben: Zeitzone, E-Mail-Vorlagen, Startprüfung und Audit-Log. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Reservierungen** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

## Plugin installieren

> [!NOTE]
> Das Plugin braucht eine bezahlte Lizenz mit dem Modul `reservations`. Der Schlüssel für gemeinnützige Nutzung
> enthält es nicht. Ohne es zeigt **Einstellungen → Plugins** den Status **Lizenz fehlt**, das Plugin wird nicht
> geladen und bestehende Reservierungen werden nicht durchgesetzt. Siehe [Plugins installieren](plugins/installing-plugins.md#lizenz-fehlt).

1. Öffnen Sie **Einstellungen → Plugins** und installieren Sie das Plugin `reservations` wie unter
   [Plugins installieren](plugins/installing-plugins.md) beschrieben.
2. Prüfen Sie die angeforderten Berechtigungen und vertrauen Sie ihnen:

| Berechtigung         | Verwendet für                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_ACCESS`    | Eigene Tabellen für Buchungen, Einstellungen, Kalender-Feeds und versendete Hinweise.                 |
| `ACCESS_HOOKS`       | Die Prüfung vor dem Start (blockieren oder bestätigen) und die Frage „Behalten oder Rest freigeben?“. |
| `LISTEN_EVENTS`      | Sitzungsstart/-ende, Wartungs- und Gesundheitsänderungen (Check-in, Hinweise).                        |
| `ACCESS_RESOURCES`   | Lesende Prüfung, wer eine Ressource starten oder warten darf, und Wartungsfenster.                    |
| `READ_USERS`         | Namen und Sprachen von Buchenden und Verwaltenden.                                                    |
| `READ_SETTINGS`      | Die öffentliche Anwendungs-URL für Kalender-Feed-Links und die Standardsprache.                       |
| `SEND_NOTIFICATIONS` | Benachrichtigungen in der App, per Push und per E-Mail.                                               |
| `READER_UI`          | Buchungshinweise und Rückfragen auf den Bildschirmen der Attractap-Reader.                            |

3. Das Plugin benötigt Attraccess 1.11.0 oder neuer.

E-Mail-Hinweise benötigen eine funktionierende [SMTP-Konfiguration](setup/smtp-email.md). Ohne sie funktionieren
Benachrichtigungen in der App und per Push weiterhin.

## Reservierungen für eine Ressource aktivieren

Öffnen Sie die Einstellungsseite der Ressource. Der Abschnitt **Reservierungen** wird Nutzenden mit der Berechtigung
**Ressourcen verwalten** angezeigt (die API erlaubt es auch den Wartenden der Ressource). Reservierungen sind
standardmäßig **deaktiviert**.

| Einstellung                       | Standard    | Erlaubte Werte / Bedeutung                                                                                                              |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Reservierungen aktiviert          | aus         | Schaltet die Funktion für diese Ressource ein.                                                                                          |
| Genehmigung erforderlich          | aus         | Neue Buchungen sind ausstehend, bis eine verwaltende Person entscheidet. Gilt auch für Buchungen von Verwaltenden.                      |
| Zeitraster (Minuten)              | 15          | 5 bis 240, muss 1440 teilen. Beginn und Dauer rasten auf dieses Raster ein.                                                             |
| Mindestdauer (Minuten)            | 15          | 1 bis 1440, ein Vielfaches des Zeitrasters.                                                                                             |
| Höchstdauer (Minuten)             | 240         | 1 bis 10080, ein Vielfaches des Zeitrasters, nicht unter der Mindestdauer.                                                              |
| Maximaler Vorlauf (Tage)          | 30          | 1 bis 730. Wie weit im Voraus gebucht werden kann.                                                                                      |
| Mindestvorlauf (Minuten)          | 0           | 0 bis 10080. Der späteste Zeitpunkt vor dem Beginn, zu dem noch gebucht werden kann. 0 heißt bis zum Beginn (nie in der Vergangenheit). |
| Puffer vorher / nachher (Minuten) | 0 / 0       | je 0 bis 1440. Bleibt um eine Buchung frei und zählt bei Überschneidungen.                                                              |
| Aktive Buchungen pro Person       | 3           | 0 bis 100 (ausstehend und bestätigt mit künftigem Ende). 0 heißt unbegrenzt.                                                            |
| Wer buchen darf                   | `can-start` | `can-start`, `managers-only` oder `any-user`.                                                                                           |
| Bestätigungsfenster (Minuten)     | 60          | 0 bis 1440. Ein Start so kurz vor der Buchung einer anderen Person verlangt eine Bestätigung. 0 heißt nie fragen.                       |
| Check-in aktiviert                | an          | Buchungen brauchen einen Sitzungsstart, um nicht als „Nicht erschienen“ zu enden.                                                       |
| Check-in-Karenz (Minuten)         | 15          | 1 bis 240. Zeit nach dem Beginn, bis eine Buchung ohne Check-in zu „Nicht erschienen“ wird.                                             |
| Frühes Einchecken (Minuten)       | 15          | 0 bis 240. Wie lange vor dem Beginn ein Check-in zählt.                                                                                 |
| Übergabe-Erinnerung (Minuten)     | 15          | 0 bis 1440. Benachrichtigt Personen mit laufender Sitzung so lange vor Beginn einer Reservierung.                                       |
| Buchbare Zeiten                   | leer (24/7) | Pro Wochentag null oder mehr Bereiche `HH:mm-HH:mm`.                                                                                    |

Änderungen betreffen nur **neue** Buchungen; bestehende bleiben erhalten. Bestätigungsfenster und Check-in-Regeln
verwenden immer die aktuellen Werte.

**Verwaltende Rollen.** Verwaltende einer Ressource sind Nutzende mit der Berechtigung **Ressourcen verwalten** sowie
die Wartenden und Einweisenden der Ressource oder ihrer Gruppe. Sie sehen alle Buchungen, genehmigen und lehnen ab,
stornieren jede Buchung mit Begründung, beenden jede laufende Buchung vorzeitig und bearbeiten die
Reservierungseinstellungen der Ressource. Der Seitenleisten-Eintrag **Reservierungen verwalten** zeigt ausstehende
Genehmigungen und alle Buchungen mit Filtern. Wartende ohne die Berechtigung **Ressourcen verwalten** müssen die
Seite unter Umständen einmal neu laden, bis der Eintrag erscheint.

### Buchbare Zeiten

Buchbare Zeiten gelten **nur für Buchungen**, nicht für spontane Starts. Die Regel: Sobald **irgendein** Wochentag
einen Bereich hat, sind Wochentage ohne Bereich **geschlossen**. Ohne jeden Bereich ist die Ressource rund um die
Uhr buchbar. Eine Buchung samt Puffern muss vollständig in einem Bereich an einem Tag liegen. Bereiche, die am selben
Tag aneinandergrenzen, bleiben getrennt: Bei 08:00-12:00 und 12:00-16:00 wird eine Buchung von 11:00 bis 13:00
abgelehnt. Nur ein Bereich bis 24:00 verbindet sich mit dem Bereich ab 00:00 des Folgetags.

### Reservierungen deaktivieren

Deaktivieren Sie Reservierungen, während es ausstehende oder bestätigte künftige Buchungen gibt, warnt die
Einstellungsseite mit der Anzahl der betroffenen Buchungen. Bestätigen Sie, werden diese Buchungen mit der Begründung
„Reservierungen deaktiviert“ storniert und die Buchenden benachrichtigt (im Hintergrund, das Speichern wartet nicht
darauf). Eine Buchung, die genau in diesem Moment angelegt wird, wird entweder mit storniert oder abgelehnt. Nach dem
Deaktivieren sind alle Starts wieder erlaubt.

## Zeitzone

Die Zeitzone des Plugins ist eine globale Einstellung im Abschnitt **Reservierungen** der Systemeinstellungen
(sichtbar für Nutzende mit der Berechtigung für Systemeinstellungen). Standard ist die Zeitzone des Servers. Sie
gilt für buchbare Zeiten, das Zeitraster, Texte in E-Mails und Benachrichtigungen sowie die Kalender-Feeds. Zeiten
werden in UTC gespeichert, die Sommerzeit wird berücksichtigt.

## Benachrichtigungskategorien

Benachrichtigungen nutzen diese Kategorien, die jede Person pro Kanal (App, Push, E-Mail) in ihren
Benachrichtigungseinstellungen unter dem Namen des Plugins einstellen kann:

| Kategorie                                 | Enthält                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| Reservierungen: meine Buchungen           | Bestätigungen, Stornierungen, vorzeitige Enden, Nichterscheinen.                |
| Reservierungen: Genehmigungen             | Neue ausstehende Buchungen (Verwaltende), Entscheidungen und Ablauf (Buchende). |
| Reservierungen: Erinnerungen              | Die 48-Stunden-Frage und die 24-Stunden-Erinnerung.                             |
| Reservierungen: Verfügbarkeit             | Wartung überschneidet eine Buchung, Ressource gestört oder erholt.              |
| Reservierungen: Übergabe                  | Übergabe-Erinnerungen und Hinweise bei Überschreitung.                          |
| Reservierungen: Starts trotz Reservierung | Wartende oder Verwaltende haben während einer Buchung gestartet.                |

## E-Mail-Vorlagen

Jede E-Mail des Plugins ist eine **E-Mail-Vorlage**, die Sie wie die E-Mails des Systems bearbeiten, unter
**Einstellungen → E-Mail → Vorlagen**. Die Vorlagen des Plugins stehen nach den Systemvorlagen und sind mit „Plugin:
reservations“ gekennzeichnet:

| Vorlage                                                                                                                        | Gesendet, wenn                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Reservierungsanfrage wartet auf Genehmigung                                                                                    | Eine Buchung wartet auf Genehmigung (an die Verwaltenden).                                    |
| Reservierung bestätigt                                                                                                         | Eine Buchung bestätigt oder genehmigt wurde, mit den Check-in-Regeln.                         |
| Reservierung abgelehnt / Reservierungsanfrage abgelaufen                                                                       | Eine Anfrage abgelehnt wurde oder bis zu ihrem Beginn niemand entschied.                      |
| Reservierung von Verwaltung storniert / Laufende Reservierung vorzeitig beendet / Reservierung entfernt (Reservierungen deaktiviert oder Maschinenplätze reduziert) | Verwaltende eine Buchung geändert oder entfernt haben, Reservierungen deaktiviert wurden oder eine Maschine Plätze verloren hat. |
| Nicht eingecheckt, Reservierung verfallen                                                                                      | Eine Buchung als Nichterscheinen freigegeben wurde.                                           |
| Erinnerung 48 Std. vorher: noch benötigt? / Erinnerung 24 Std. vorher                                                          | Die Erinnerungen vor einer Buchung.                                                           |
| Wartung betrifft eine Reservierung / Ressource hat ein Problem / Ressource funktioniert wieder                                 | Wartung oder der Zustand der Ressource eine Buchung betrifft.                                 |
| Bald reserviert (an die aktuelle Person) / Reservierung begonnen, Ressource noch belegt / Reservierung begonnen, bitte beenden | Übergabe- und Überschreitungshinweise.                                                        |
| Start trotz Reservierung (an die Buchenden / an die Verwaltung)                                                                | Verwaltende während einer Buchung gestartet haben.                                            |

- Bearbeiten Sie Betreff und Text im visuellen Editor und die deutschen und englischen Texte im Dialog
  **Übersetzungen**. **Variablen** zeigt, was Sie verwenden können, etwa `{{reservation.when}}` oder
  `{{resource.name}}`.
- **Gespeicherte Vorlagen gehören Ihnen.** Betreff, Text und mitgelieferte Übersetzungen des Plugins werden nur
  übernommen, wenn eine Vorlage zum ersten Mal gespeichert wird (bei der Installation oder wenn ein Update eine neue
  Vorlage mitbringt). Danach gehören Betreff, Text und Übersetzungen den Administratoren: Ein Update des Plugins
  überschreibt sie nie, egal ob Sie sie geändert haben oder nicht. **Auf Standard zurücksetzen** stellt die Fassung des
  installierten Plugins samt Übersetzungen wieder her; so erhalten Sie verbesserte Texte aus einem Update.
- Jede empfangende Person erhält die Mail in ihrer eigenen Sprache; welche Mail wer erhält, bestimmen weiterhin die
  Benachrichtigungskategorien. E-Mails brauchen die [SMTP-Konfiguration](setup/smtp-email.md) und die
  Anwendungs-URL, wie alle Attraccess-E-Mails.
- Deaktivieren oder deinstallieren Sie das Plugin, werden seine Vorlagen ausgeblendet und für später aufbewahrt.

## Startprüfung und Hook-Ausfälle

Die Startprüfung läuft über den **Pre-Start-Hook** des Plugins, für Reader, Web-Oberfläche, API und
Aufsichts-Freigabe gleichermaßen. Ressourcen mit deaktivierten Reservierungen werden aus einem Einstellungs-Cache im
Arbeitsspeicher beantwortet, ohne Datenbankzugriff.

Kann das Plugin nicht antworten (Timeout, Fehler, zu viele Fehler in Folge), entscheidet die **Ausfallrichtlinie**
der Ressource. Sie finden sie in den **Reader-Anzeige**-Einstellungen der Ressource (siehe
[Reader-Anzeige](attractap/reader-ui.md)) als „Wenn die Prüfung des Plugins fehlschlägt“. Standard ist **fail
closed**: Der Start wird mit „Vorübergehend nicht startbar“ abgelehnt. „Start erlauben“ (fail open) lässt Starts
durch, solange die Prüfung ausfällt, auch solche, die mit einer Buchung kollidieren. Die Einstellung wirkt nur,
solange die Prüfung fehlschlägt; jeder solche Start wird im Audit-Log festgehalten. Details siehe
[Plugins entwickeln](plugins/developing-plugins.md#reader-ui-und-start-hooks).

**Aufsicht.** Eine aufsichtführende Person, die eine Anfrage freigibt, kann nicht stellvertretend bestätigen. Ein
Start, der normalerweise eine Bestätigung verlangt, wird auf diesem Weg daher abgelehnt.

## Wartung und Gesundheit

- Über ein Wartungsfenster hinweg kann nicht gebucht werden, auch nicht über offene Wartung (sie zählt ab ihrem
  Beginn bis zum Abschluss).
- Wird eine Wartung angelegt oder geändert und überschneidet bestehende Buchungen, erhalten die Buchenden **einen**
  Hinweis, der alle ihre betroffenen Buchungen aufführt. Betrifft eine spätere Änderung weitere ihrer Buchungen, folgt
  ein weiterer Hinweis, der nur die neu betroffenen nennt. Buchungen werden **nicht** automatisch storniert; die
  Verwaltenden entscheiden.
- Wird eine Ressource gestört, werden Buchende von Buchungen informiert, die laufen oder innerhalb von 24 Stunden
  beginnen, und noch einmal bei Erholung.

## Audit-Log

Das Plugin schreibt die Audit-Domäne **reservations**: `created`, `approved`, `rejected`, `cancelled`,
`ended_early`, `no_show`, `expired`, `override_start`, `settings_changed`, `feed_created` und `feed_revoked`. Siehe
[Audit-Log](settings/audit-log.md).

## Betrieb mit einer Instanz

> [!WARNING]
> Das Plugin unterstützt **eine** API-Instanz. Sein Minuten-Scheduler, die Buchungssperre pro Ressource, der
> Einstellungs-Cache, die Entscheidungen „Behalten oder Rest freigeben?“ und der Rate-Limiter der Feeds liegen im
> API-Prozess. Zwei Instanzen würden den Scheduler doppelt ausführen und weder Buchungen serialisieren noch ihre
> Caches gegenseitig aktualisieren. Verteilte Sperren und Cache-Invalidierung werden unter **ATT-1146** verfolgt.

Gut zu wissen:

- Der Scheduler läuft einmal pro Minute (Ablauf, Nichterscheinen, Abschluss, Erinnerungen, Übergabe, Überziehen).
  Jede Mitteilung wird vor dem Senden in der Datenbank beansprucht, sodass Neustarts und doppelte Läufe nie eine
  Mitteilung doppelt senden. Mitteilungen werden **höchstens einmal** gesendet: Schlägt das Senden nach dem
  Beanspruchen fehl, wird es nicht wiederholt.
- Die Prüfung auf eine noch laufende fremde Sitzung erfolgt nur in den ersten fünf Minuten einer Buchung. Ist die API
  rund um den Beginn länger ausgefallen, entfällt diese Mitteilung.
- Benachrichtigungen zu einer Aktion (Buchen, Genehmigen, Stornieren, vorzeitig Beenden, Deaktivieren) werden nach
  dem Speichern im Hintergrund gesendet; die Aktion wartet nicht auf den Mailserver.
- Offene Entscheidungen „Behalten oder Rest freigeben?“ von Web-Nutzenden liegen im Arbeitsspeicher. Nach einem
  Neustart der API ist die Frage weg, und die Buchung bleibt bestehen.
