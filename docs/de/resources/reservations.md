# Reservierungen

Mit dem Plugin **Reservierungen** buchen Mitglieder eine Ressource im Voraus für ein bestimmtes Zeitfenster. Solange
eine Buchung aktiv ist, kann niemand sonst die Ressource starten. Wer kurz vor der Buchung einer anderen Person
startet, wird um eine Bestätigung gebeten.

> [!NOTE]
> Reservierungen stellt das offizielle Plugin `reservations` bereit. Installieren Sie es zuerst (siehe
> [Plugin installieren](#plugin-installieren)) und aktivieren Sie Reservierungen pro Ressource. Ohne das Plugin oder
> bei Ressourcen ohne aktivierte Reservierungen ändert sich nichts.

Das Plugin beendet, sperrt oder übernimmt niemals eine laufende Sitzung. Es blockiert oder fragt nur vor dem
**Start** einer Sitzung und versendet Benachrichtigungen.

## Für Mitglieder

### Eine Ressource buchen

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource. Bei Ressourcen mit aktivierten
   Reservierungen sehen Sie eine Karte **Reservierungen** mit Tages- und Wochenansicht. Ihre eigenen Buchungen sind
   hervorgehoben, Buchungen anderer erscheinen als **Reserviert**.
2. Klicken Sie auf **Reservieren**.
3. Wählen Sie Datum, Beginn und Dauer. Beginn und Dauer folgen dem Zeitraster der Ressource (zum Beispiel 15
   Minuten); nur gültige Zeitfenster sind auswählbar. Der Dialog zeigt außerdem die Check-in-Regeln und ob die
   Buchung genehmigt werden muss.
4. Bestätigen Sie. Die Buchung ist sofort **bestätigt**, oder **ausstehend**, wenn die Ressource eine Genehmigung
   verlangt.

Alle Zeiten werden in der konfigurierten [Zeitzone](#zeitzone) des Plugins angezeigt.

Eine Buchung gibt keine Berechtigung zum Starten. Sie können eine Ressource nur starten, wenn Sie sie ohnehin
nutzen dürfen (zum Beispiel durch eine Einweisung).

Wer buchen darf, hängt von der Ressource ab:

| Einstellung     | Wer buchen darf                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `can-start`     | Alle, die die Ressource starten dürfen (auch unter Aufsicht), außerdem Einweisende, Wartende und Nutzende mit **Ressourcen verwalten**. |
| `managers-only` | Einweisende, Wartende und Nutzende mit **Ressourcen verwalten**.                                                                        |
| `any-user`      | Jede angemeldete Person.                                                                                                                |

Eine Buchung wird (mit Begründung) abgelehnt, wenn sie eine andere Buchung samt Puffern überschneidet, ein
[Wartungsfenster](resources/maintenance.md) überschneidet, außerhalb der buchbaren Zeiten liegt, zu kurz, zu lang,
zu weit in der Zukunft, zu spät oder in der Vergangenheit liegt oder wenn Sie bereits die Höchstzahl aktiver
Buchungen für diese Ressource haben.

Bei einer Maschine mit `maxParallelSessions > 1` reserviert eine Buchung die **gesamte** Ressource.

### Meine Reservierungen

Der Seitenleisten-Eintrag **Meine Reservierungen** listet Ihre kommenden und vergangenen Buchungen mit Status.

| Status                 | Bedeutung                                                                        |
| ---------------------- | -------------------------------------------------------------------------------- |
| Wartet auf Genehmigung | Wartet auf die Entscheidung einer verwaltenden Person. Blockiert noch niemanden. |
| Bestätigt              | Genehmigt oder ohne Genehmigung gebucht. Blockiert das Zeitfenster.              |
| Abgelehnt              | Eine verwaltende Person hat die Buchung abgelehnt.                               |
| Storniert              | Von Ihnen oder einer verwaltenden Person storniert.                              |
| Abgelaufen             | Beim Beginn noch nicht entschieden.                                              |
| Nicht erschienen       | Bis zum Ende der Karenzzeit gab es keinen Check-in.                              |
| Abgeschlossen          | Die Buchung ist vorbei (oder wurde vorzeitig beendet).                           |

Dort können Sie ausstehende und kommende Buchungen stornieren, eine laufende Buchung vorzeitig beenden und zu Ihren
[Kalender-Feeds](#kalender-feeds-ical) wechseln.

### Genehmigung

Verlangt die Ressource eine Genehmigung, ist eine neue Buchung **ausstehend**, bis eine verwaltende Person sie
genehmigt oder ablehnt (optional mit Begründung). Sie werden über die Entscheidung benachrichtigt. Eine Buchung, die
bei ihrem Beginn noch aussteht, wird **abgelaufen**. Eine ausstehende Buchung blockiert andere Buchungen, aber nie
den Start der Ressource.

### Check-in und Nichterscheinen

Ist der Check-in für die Ressource aktiviert, checken Sie einfach ein, indem Sie **innerhalb des Check-in-Fensters
eine Sitzung auf dieser Ressource starten**: ab einigen Minuten vor Beginn (frühes Einchecken) bis zum Ende der
Buchung. Mehr müssen Sie nicht tun; auch ein beaufsichtigter Start zählt, wenn Sie ihn angefragt haben.

Auch eine Sitzung von Ihnen, die bei Beginn der Buchung **bereits läuft**, zählt, etwa wenn Sie vor dem frühen
Check-in-Fenster gestartet haben oder Ihre Sitzung aus Ihrer direkt vorangehenden Buchung weiterläuft. Eine solche
Sitzung wird am Ende der Karenzzeit erkannt und checkt Sie dann ein.

Haben Sie bis zum Beginn plus Karenzzeit nicht eingecheckt, wird die Buchung zu **Nicht erschienen**, das
Zeitfenster wird für andere frei und Sie erhalten eine E-Mail. Ist die Karenzzeit so lang wie die Buchung oder
länger, wird eine ungenutzte Buchung an ihrem Ende zu **Nicht erschienen**. Es gelten die aktuellen
Check-in-Einstellungen der Ressource, auch für Buchungen von vor einer Änderung. Ist der Check-in deaktiviert, bleibt
die Buchung einfach bis zu ihrem Ende bestehen. Bestätigungs- und Erinnerungs-E-Mails nennen die Check-in-Regeln der Ressource.

### Vorzeitig beenden: behalten oder Rest freigeben

Sie können eine laufende Buchung unter **Meine Reservierungen** oder auf der Ressourcenseite vorzeitig beenden. Das
Zeitfenster wird sofort frei.

Beenden Sie Ihre Sitzung während Ihrer eigenen laufenden Buchung, werden Sie gefragt: **Behalten oder Rest
freigeben?**

- Im Web erscheint ein Dialog auf der Ressourcenseite („Deine Buchung läuft bis 16:00. Behalten oder den Rest
  freigeben?“). Ignorieren Sie ihn, bleibt die Buchung bestehen. Die Frage wird 15 Minuten lang gemerkt.
- Auf einem Attractap-Reader mit Bildschirm erscheint die Frage nach dem Stopp. Ohne Antwort gilt **Behalten**.

### Startschutz und Bestätigung

Beim Start einer Ressource prüft das Plugin die Buchungen **anderer** Personen. Nur bestätigte Buchungen zählen.

- **Eine fremde Buchung läuft:** Der Start wird mit „Von einer anderen Person bis 16:00 reserviert.“ abgelehnt. Der
  Name der buchenden Person wird nie Personen gezeigt, die ihn nicht sehen dürfen.
- **Eine fremde Buchung beginnt bald:** Beginnt sie innerhalb des Bestätigungsfensters der Ressource
  (standardmäßig 60 Minuten), werden Sie um Bestätigung gebeten: „Reserviert ab 14:00, du hast 40 Min. Trotzdem
  starten?“. Auf einem Reader ohne Bildschirm wird der Start standardmäßig abgelehnt. Beginnen mehrere Buchungen
  innerhalb des Fensters, bestätigen Sie jede einzeln.
- **Ihre eigene Buchung:** Während oder kurz vor Ihrer eigenen Buchung starten Sie ohne Rückfrage.
- **Wartende und Verwaltende** können eine laufende Buchung nach ausdrücklicher Bestätigung übersteuern. Die buchende
  Person und die Verwaltenden werden benachrichtigt; die Übersteuerung steht im [Audit-Log](settings/audit-log.md).
- **Beaufsichtigte Starts** (eine aufsichtführende Person genehmigt die Anfrage) können niemanden um eine
  Bestätigung bitten, daher wird eine Rückfrage dort zu einer Ablehnung.

Nur ausstehende Buchungen blockieren keinen Start.

**Die Ressourcenseite zeigt eine Sperre, bevor Sie auf Start drücken.** Solange eine fremde Buchung läuft und Sie
nicht starten dürfen, ersetzt die Seite den Start-Knopf durch einen Hinweis, wie bei „Sie benötigen eine Einweisung“
und „in Benutzung“: Er zeigt Titel und Grund des Plugins, und der Grund nennt, wann die Sperre endet („Von einer
anderen Person bis 16:00 reserviert.“). Der Hinweis aktualisiert sich von selbst, wenn eine Buchung beginnt, endet
oder storniert wird. Ist die Seite veraltet und Sie drücken trotzdem auf Start, wird der Start weiterhin mit derselben
Meldung abgelehnt. Verwaltende und Wartende sehen den Hinweis nicht; sie starten über die oben beschriebene
Override-Bestätigung.

### Erinnerungen und Benachrichtigungen

Sie erhalten Benachrichtigungen in der App, per Push und per E-Mail, je nach Ihren Benachrichtigungseinstellungen
(siehe [Benachrichtigungskategorien](#benachrichtigungskategorien)). Jede Mitteilung wird höchstens einmal
gesendet. Die Texte nutzen Ihre Sprache, sofern bekannt, sonst die Standardsprache der Installation. Die E-Mails sind
[E-Mail-Vorlagen](#e-mail-vorlagen), die Administratoren bearbeiten können.

| Wann                                                       | Was                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buchung bestätigt oder genehmigt                           | Bestätigung inklusive Check-in-Regeln.                                                                                                                                                                                                                                           |
| 48 Stunden vor Beginn                                      | „Brauchen Sie die Buchung noch?“ mit **Behalten** und **Stornieren**. Nur, wenn die Buchung mindestens 48 Stunden im Voraus bestätigt wurde (bei genehmigungspflichtigen Buchungen: genehmigt) und Sie nicht schon **Behalten** gewählt haben. Keine Antwort behält die Buchung. |
| 24 Stunden vor Beginn                                      | Erinnerung inklusive Check-in-Regeln. Entfällt für Buchungen, die weniger als 24 Stunden im Voraus bestätigt (gebucht oder genehmigt) wurden: Ihre Bestätigungs-E-Mail enthält die Regeln bereits.                                                                               |
| Buchung abgelehnt, abgelaufen, storniert, nicht erschienen | Information, was passiert ist und warum.                                                                                                                                                                                                                                         |
| Wartung überschneidet Ihre Buchung                         | Ein Hinweis pro Wartung, der alle Ihre betroffenen Buchungen aufführt. Buchungen werden nicht automatisch storniert.                                                                                                                                                             |
| Ressource wird gestört / erholt sich                       | Für Buchungen, die laufen oder innerhalb von 24 Stunden beginnen.                                                                                                                                                                                                                |
| Vor dem Beginn einer fremden Buchung                       | Bei laufender Sitzung: „Die Ressource ist ab 14:00 reserviert. Bitte beende deine Sitzung rechtzeitig.“                                                                                                                                                                          |
| Fremde Sitzung läuft bei Ihrem Beginn noch                 | Sie und die andere Person werden informiert (geprüft in den ersten fünf Minuten Ihrer Buchung). Die Sitzung wird nicht beendet.                                                                                                                                                  |
| Jemand hat Ihre Buchung übersteuert                        | Sie erfahren, wer trotzdem gestartet hat.                                                                                                                                                                                                                                        |

Ressourcen, deren Reservierungen deaktiviert sind, senden für beim Deaktivieren behaltene Buchungen keine
Erinnerungen, Übergabe- oder Überziehungs-Mitteilungen.

### Links in E-Mails

Aktionslinks in E-Mails („Behalten“, „Stornieren“) sind einfache Links auf `/reservations/<id>?action=keep|cancel`
in Attraccess.

- **Ein Link meldet Sie nie von selbst an** und enthält kein Token. Sind Sie nicht angemeldet, melden Sie sich wie
  gewohnt an und kehren zur Seite zurück.
- Das Öffnen des Links ändert nichts. Die Seite fragt in einem Dialog nach Ihrer Bestätigung, bevor sie die Buchung
  behält oder storniert.

Die Links in E-Mails werden aus der öffentlichen URL der Anwendung (`backend_url`) gebildet, die konfiguriert sein
muss, wie bei jeder Attraccess-E-Mail; siehe [Umgebungsvariablen](installation/environment-variables.md).

### Kalender-Feeds (iCal)

Auf Ihrer Kontoseite können Sie im Abschnitt **Kalender-Feeds (iCal)** Buchungen in jeder Kalender-App abonnieren.

- Sie können mehrere Feeds anlegen (bis zu 20), jeweils mit einem Namen.
- Jeder Feed hat eine **Auswahl**. Kombinieren Sie eine oder mehrere der Optionen: bestimmte Ressourcen,
  Ressourcengruppen, alle Ressourcen, in die Sie eingewiesen sind, alle Ressourcen, die Sie warten, und nur Ihre
  eigenen Buchungen.
- Enthalten sind nur Ressourcen, die Sie **zum Zeitpunkt des Kalenderabrufs** sehen dürfen.
- Bestätigte Buchungen erscheinen als Termine, ausstehende als **vorläufige** Termine. Stornierte Buchungen
  verschwinden. Der Feed deckt die letzten 30 Tage bis zum Buchungshorizont der jeweiligen Ressource ab.
- Der Titel lautet „Ressource – Reserviert“ bei Buchungen anderer und „Ressource – Name“ bei Ihren eigenen Buchungen
  und bei Ressourcen, die Sie verwalten.

> [!WARNING]
> Die Feed-URL ist ein Geheimnis: Wer sie kennt, kann den Feed ohne Anmeldung lesen. Sie wird **nur einmal**
> angezeigt, beim Erstellen oder Neu-Erzeugen des Feeds. Kopieren Sie sie sofort. Ist sie in falsche Hände geraten,
> erzeugen Sie sie **neu** (die alte URL funktioniert sofort nicht mehr) oder **widerrufen** Sie den Feed (die URL
> antwortet danach mit 404). Attraccess speichert nur einen Hash des Tokens.

Feeds sind ratenbegrenzt. Widerrufene und unbekannte Feeds antworten gleich mit `404`.

## Für Administratoren

### Plugin installieren

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

3. Das Plugin benötigt Attraccess 1.11.0 oder neuer.

E-Mail-Hinweise benötigen eine funktionierende [SMTP-Konfiguration](setup/smtp-email.md). Ohne sie funktionieren
Benachrichtigungen in der App und per Push weiterhin.

### Reservierungen für eine Ressource aktivieren

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

#### Buchbare Zeiten

Buchbare Zeiten gelten **nur für Buchungen**, nicht für spontane Starts. Die Regel: Sobald **irgendein** Wochentag
einen Bereich hat, sind Wochentage ohne Bereich **geschlossen**. Ohne jeden Bereich ist die Ressource rund um die
Uhr buchbar. Eine Buchung samt Puffern muss vollständig in einem Bereich an einem Tag liegen. Bereiche, die am selben
Tag aneinandergrenzen, bleiben getrennt: Bei 08:00-12:00 und 12:00-16:00 wird eine Buchung von 11:00 bis 13:00
abgelehnt. Nur ein Bereich bis 24:00 verbindet sich mit dem Bereich ab 00:00 des Folgetags.

#### Reservierungen deaktivieren

Deaktivieren Sie Reservierungen, während es ausstehende oder bestätigte künftige Buchungen gibt, warnt die
Einstellungsseite mit der Anzahl der betroffenen Buchungen. Bestätigen Sie, werden diese Buchungen mit der Begründung
„Reservierungen deaktiviert“ storniert und die Buchenden benachrichtigt (im Hintergrund, das Speichern wartet nicht
darauf). Eine Buchung, die genau in diesem Moment angelegt wird, wird entweder mit storniert oder abgelehnt. Nach dem
Deaktivieren sind alle Starts wieder erlaubt.

### Zeitzone

Die Zeitzone des Plugins ist eine globale Einstellung im Abschnitt **Reservierungen** der Systemeinstellungen
(sichtbar für Nutzende mit der Berechtigung für Systemeinstellungen). Standard ist die Zeitzone des Servers. Sie
gilt für buchbare Zeiten, das Zeitraster, Texte in E-Mails und Benachrichtigungen sowie die Kalender-Feeds. Zeiten
werden in UTC gespeichert, die Sommerzeit wird berücksichtigt.

### Benachrichtigungskategorien

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

### E-Mail-Vorlagen

Jede E-Mail des Plugins ist eine **E-Mail-Vorlage**, die Sie wie die E-Mails des Systems bearbeiten, unter
**Einstellungen → E-Mail → Vorlagen**. Die Vorlagen des Plugins stehen nach den Systemvorlagen und sind mit „Plugin:
reservations“ gekennzeichnet:

| Vorlage                                                                                                      | Gesendet, wenn                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Reservierungsanfrage wartet auf Genehmigung                                                                  | Eine Buchung wartet auf Genehmigung (an die Verwaltenden).                         |
| Reservierung bestätigt                                                                                       | Eine Buchung bestätigt oder genehmigt wurde, mit den Check-in-Regeln.              |
| Reservierung abgelehnt / Reservierungsanfrage abgelaufen                                                     | Eine Anfrage abgelehnt wurde oder bis zu ihrem Beginn niemand entschied.           |
| Reservierung von Verwaltung storniert / Laufende Reservierung vorzeitig beendet / Reservierung entfernt      | Verwaltende eine Buchung geändert oder entfernt haben oder Reservierungen deaktiviert wurden. |
| Nicht eingecheckt, Reservierung verfallen                                                                    | Eine Buchung als Nichterscheinen freigegeben wurde.                                |
| Erinnerung 48 Std. vorher: noch benötigt? / Erinnerung 24 Std. vorher                                        | Die Erinnerungen vor einer Buchung.                                                |
| Wartung betrifft eine Reservierung / Ressource hat ein Problem / Ressource funktioniert wieder               | Wartung oder der Zustand der Ressource eine Buchung betrifft.                      |
| Bald reserviert (an die aktuelle Person) / Reservierung begonnen, Ressource noch belegt / Reservierung begonnen, bitte beenden | Übergabe- und Überschreitungshinweise.                          |
| Start trotz Reservierung (an die Buchenden / an die Verwaltung)                                              | Verwaltende während einer Buchung gestartet haben.                                 |

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

### Startprüfung und Hook-Ausfälle

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

### Wartung und Gesundheit

- Über ein Wartungsfenster hinweg kann nicht gebucht werden, auch nicht über offene Wartung (sie zählt ab ihrem
  Beginn bis zum Abschluss).
- Wird eine Wartung angelegt oder geändert und überschneidet bestehende Buchungen, erhalten die Buchenden **einen**
  Hinweis, der alle ihre betroffenen Buchungen aufführt. Betrifft eine spätere Änderung weitere ihrer Buchungen, folgt
  ein weiterer Hinweis, der nur die neu betroffenen nennt. Buchungen werden **nicht** automatisch storniert; die
  Verwaltenden entscheiden.
- Wird eine Ressource gestört, werden Buchende von Buchungen informiert, die laufen oder innerhalb von 24 Stunden
  beginnen, und noch einmal bei Erholung.

### Audit-Log

Das Plugin schreibt die Audit-Domäne **reservations**: `created`, `approved`, `rejected`, `cancelled`,
`ended_early`, `no_show`, `expired`, `override_start`, `settings_changed`, `feed_created` und `feed_revoked`. Siehe
[Audit-Log](settings/audit-log.md).

### Betrieb mit einer Instanz

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

## API nutzen

Alle Endpunkte liegen unter `/api/reservations` und akzeptieren ein Sitzungs-Cookie **oder** ein API-Token
(`Authorization: Bearer <token>`, siehe [API-Referenz](developer/api-reference.md)). Zeiten sind ISO 8601.
Ein API-Token handelt mit den Berechtigungen des Tokens: Verwalteraktionen (fremde Buchungen genehmigen, stornieren
oder vorzeitig beenden, die Verwalterliste, Ressourceneinstellungen, Buchen bei „nur Verwalter“) brauchen
`resources.update` oder `resources.maintenance.manage` am Token selbst. Wartungs- und Einweiserrechte aus Ihren Rollen
gelten weiterhin.
Einen Kalender-Feed anlegen und seine URL neu erzeugen geht nur mit einer Browser-Sitzung (403 mit einem API-Token),
denn eine Feed-URL zeigt Ihre Buchungen mit allen Ihren Rechten, wie ein API-Token.
Ein Start mit einem API-Token läuft durch die Startprüfung des Kerns, die die Berechtigungen des Tokens anwendet; die
eigene Übersteuerungsprüfung des Plugins (Bestätigung statt Sperre während einer fremden Buchung) nutzt weiterhin die
Berechtigungen Ihrer Rollen, weil der Start-Hook den Umfang des Tokens nicht erhält.

| Methode und Pfad                                            | Zweck                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /resources/:resourceId/availability?from=&to=`         | Buchungen, Regeln und Ihre Buchungsberechtigung für einen Zeitraum (höchstens 62 Tage).    |
| `GET /resources/:resourceId/pending-decision`               | Ihre laufende Buchung, die auf „behalten/freigeben“ wartet, oder `null`.                   |
| `POST /`                                                    | Buchen (`resourceId`, `startTime` und `endTime` oder `durationMinutes`, optional `note`).  |
| `GET /mine?scope=upcoming\|past&status=`                    | Ihre Buchungen.                                                                            |
| `GET /manage?resourceId=&status=&from=&to=&page=`           | Buchungen der Ressourcen, die Sie verwalten (25 pro Seite); 403, wenn Sie keine verwalten. |
| `GET /:id`                                                  | Eine Buchung (Buchende oder Verwaltende).                                                  |
| `POST /:id/cancel`                                          | Stornieren (Body: optionaler `reason`, für Verwaltende).                                   |
| `POST /:id/end-early`                                       | Eine laufende Buchung jetzt beenden.                                                       |
| `POST /:id/keep`                                            | Die Buchung behalten (nur Buchende).                                                       |
| `POST /:id/approve`, `POST /:id/reject`                     | Ausstehende Buchung entscheiden (Verwaltende, optionaler `reason`).                        |
| `GET /resources/:resourceId/manager-access`                 | Ob Sie die Ressource verwalten.                                                            |
| `GET` / `PUT /resources/:resourceId/settings`               | Einstellungen der Ressource lesen oder ändern (Verwaltende). `PUT` ist eine Teiländerung.  |
| `GET /resources/:resourceId/settings/future-bookings-count` | Buchungen, die ein Deaktivieren stornieren würde.                                          |
| `GET` / `PUT /settings/global`                              | Plugin-weite Einstellungen (Zeitzone). `PUT` benötigt `system.settings.manage`.            |
| `GET`, `POST /ical/feeds`                                   | Ihre Kalender-Feeds auflisten oder anlegen.                                                |
| `PATCH`, `DELETE /ical/feeds/:id`                           | Einen Feed umbenennen oder neu auswählen, oder widerrufen.                                 |
| `POST /ical/feeds/:id/regenerate`                           | Eine neue geheime URL ausstellen.                                                          |
| `GET /ical/<token>.ics`                                     | Der Kalender (ohne Sitzung; das Token ist die Zugangsberechtigung).                        |

Beispiel: Eine Ressource für 60 Minuten mit einem API-Token buchen.

```bash
curl -X POST https://your-attraccess-instance/api/reservations \
  -H "Authorization: Bearer $ATTRACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "resourceId": 3, "startTime": "2026-12-01T14:00:00Z", "durationMinutes": 60 }'
```

Das Deaktivieren über `PUT /resources/:resourceId/settings` mit `"enabled": false` antwortet mit
`409 FUTURE_BOOKINGS_EXIST`, solange künftige Buchungen existieren, es sei denn, die Anfrage sendet zusätzlich
`"cancelFutureBookings": true`.

### Fehlercodes

Regelverstöße antworten mit `{ "code": "...", "message": "..." }`.

| Code                                                                                       | Status | Bedeutung                                                                      |
| ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| `RESERVATIONS_DISABLED`                                                                    | 409    | Reservierungen sind für die Ressource nicht aktiviert.                         |
| `NOT_ALLOWED_TO_BOOK`                                                                      | 409    | Durch die Einstellung „Wer buchen darf“ nicht erlaubt.                         |
| `IN_THE_PAST`                                                                              | 409    | Die Buchung würde in der Vergangenheit beginnen.                               |
| `OFF_TIME_STEP`                                                                            | 409    | Beginn oder Dauer liegt neben dem Zeitraster.                                  |
| `DURATION_TOO_SHORT`, `DURATION_TOO_LONG`                                                  | 409    | Unter der Mindest- oder über der Höchstdauer.                                  |
| `BEYOND_MAX_ADVANCE`                                                                       | 409    | Weiter in der Zukunft als der maximale Vorlauf.                                |
| `LEAD_TIME_TOO_SHORT`                                                                      | 409    | Zu spät für den Mindestvorlauf.                                                |
| `OUTSIDE_BOOKABLE_HOURS`                                                                   | 409    | Nicht vollständig innerhalb der buchbaren Zeiten.                              |
| `USER_BOOKING_LIMIT`                                                                       | 409    | Höchstzahl aktiver Buchungen pro Person erreicht.                              |
| `OVERLAP`                                                                                  | 409    | Überschneidet eine andere ausstehende oder bestätigte Buchung (mit Puffern).   |
| `MAINTENANCE`                                                                              | 409    | Überschneidet ein Wartungsfenster.                                             |
| `NOT_PENDING`, `NOT_ACTIVE`, `NOT_CANCELLABLE`                                             | 409    | Die Buchung ist nicht in einem Zustand, der diese Aktion erlaubt.              |
| `ALREADY_STARTED`, `ALREADY_FINISHED`                                                      | 409    | Die Buchung hat bereits begonnen oder ist beendet.                             |
| `FUTURE_BOOKINGS_EXIST`                                                                    | 409    | Das Deaktivieren würde künftige Buchungen stornieren; ausdrücklich bestätigen. |
| `FEED_LIMIT`                                                                               | 409    | Höchstzahl an Kalender-Feeds erreicht.                                         |
| `INVALID_RANGE`, `INVALID_SETTINGS`, `INVALID_TIMEZONE`, `RANGE_TOO_LARGE`, `INVALID_FEED` | 400    | Die Anfrage ist fehlerhaft oder ein Wert ist ungültig.                         |
| `FORBIDDEN`                                                                                | 403    | Das dürfen Sie nicht.                                                          |
| `RESERVATION_NOT_FOUND`, `RESOURCE_NOT_FOUND`, `FEED_NOT_FOUND`                            | 404    | Das Objekt existiert nicht (oder Sie dürfen es nicht sehen).                   |

> [!NOTE]
> Plugin-Routen erscheinen in der **Laufzeit**-OpenAPI-Dokumentation einer laufenden Instanz unter `/api`. Sie sind
> **nicht** Teil der exportierten Swagger-Datei und des generierten API-Clients, die ohne Plugins gebaut werden.

## Siehe auch

- [Ressourcen-Übersicht](resources/overview.md)
- [Wartung](resources/maintenance.md)
- [Reader-Anzeige](attractap/reader-ui.md)
- [Plugins installieren](plugins/installing-plugins.md)
- [Plugins entwickeln](plugins/developing-plugins.md)
