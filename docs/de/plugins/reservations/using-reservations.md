# Reservierungen nutzen
<!-- llms-description: Wie Mitglieder mit dem Plugin Reservierungen Ressourcen buchen, einchecken, Genehmigungen abwickeln und Kalender-Feeds nutzen. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Reservierungen** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

## Eine Ressource buchen

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource. Bei Ressourcen mit aktivierten
   Reservierungen sehen Sie eine Karte **Reservierungen** mit Tages- und Wochenansicht. Ihre eigenen Buchungen sind
   hervorgehoben, Buchungen anderer erscheinen als **Reserviert**.
2. Klicken Sie auf **Reservieren**.
3. Wählen Sie Datum, Beginn und Dauer. Beginn und Dauer folgen dem Zeitraster der Ressource (zum Beispiel 15
   Minuten); nur gültige Zeitfenster sind auswählbar. Der Dialog zeigt außerdem die Check-in-Regeln und ob die
   Buchung genehmigt werden muss.
4. Bestätigen Sie. Die Buchung ist sofort **bestätigt**, oder **ausstehend**, wenn die Ressource eine Genehmigung
   verlangt.

Alle Zeiten werden in der konfigurierten [Zeitzone](plugins/reservations/administration.md#zeitzone) des Plugins angezeigt.

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

#### Maschinen mit mehreren parallelen Sitzungen

Bei einer Maschine mit `maxParallelSessions` von N > 1 belegt eine Buchung **einen Platz**, nicht die ganze Maschine.
Maschinen mit Limit 1 und Türen funktionieren wie oben beschrieben.

- Bis zu N Buchungen (ausstehende und bestätigte, samt Puffern) dürfen sich überschneiden. Die (N+1)-te
  überschneidende Buchung wird mit „Zu dieser Zeit sind alle Plätze belegt“ abgelehnt (Code `OVERLAP`).
- Sie können nicht zwei sich überschneidende Buchungen auf derselben Maschine halten (Code `OWN_OVERLAP`).
- Solange eine Buchung läuft, zählt ihr Platz gegen spontane Starts. Ein Start wird nur dann mit dem Text
  „Reserviert“ abgelehnt, wenn laufende Sitzungen plus die für **andere** Personen reservierten Plätze das Limit
  erreichen. Die buchende Person darf ihren eigenen Platz immer nutzen. Verwaltende können nach einer Bestätigung
  übersteuern.
- Die Frage „Bald reserviert“ erscheint nur, wenn ein Start dazu führen würde, dass eine bevorstehende Buchung
  innerhalb des Bestätigungsfensters keinen Platz mehr hätte.
- **Wird das Limit gesenkt** (oder der Typ so geändert, dass das Limit sinkt), werden die zuletzt angelegten,
  noch nicht begonnenen Buchungen storniert, die nicht mehr passen, mit der Begründung `machine capacity reduced`
  (so gespeichert und angezeigt). Die buchenden Personen erhalten die E-Mail „Reservierung entfernt: {Ressource}“,
  und die Stornierungen stehen im [Audit-Log](settings/audit-log.md). Laufende Buchungen werden nie storniert. Wird
  das Limit erhöht, wird nichts storniert.
- Übergabe- und Überzugs-Hinweise werden auf solchen Maschinen nur versendet, wenn der buchenden Person ein Platz
  fehlen würde.
- Die Karte **Reservierungen** zeigt zu jeder Buchung, wie viele Plätze im vollsten Moment ihres Zeitraums (samt
  Puffern) reserviert sind, zum Beispiel „2 von 3 Plätzen reserviert“. Sind alle Plätze belegt, wird die Zählung rot.
- Ein Reader zeigt „Reserviert“ nur, wenn kein freier Platz mehr übrig ist; sonst zeigt er eine Zählung wie
  „2 von 3 Plätzen reserviert“ (in der kurzen Statuszeile „2/3 reserviert“).

## Meine Reservierungen

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

## Genehmigung

Verlangt die Ressource eine Genehmigung, ist eine neue Buchung **ausstehend**, bis eine verwaltende Person sie
genehmigt oder ablehnt (optional mit Begründung). Sie werden über die Entscheidung benachrichtigt. Eine Buchung, die
bei ihrem Beginn noch aussteht, wird **abgelaufen**. Eine ausstehende Buchung blockiert andere Buchungen, aber nie
den Start der Ressource.

## Check-in und Nichterscheinen

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

## Vorzeitig beenden: behalten oder Rest freigeben

Sie können eine laufende Buchung unter **Meine Reservierungen** oder auf der Ressourcenseite vorzeitig beenden. Das
Zeitfenster wird sofort frei.

Beenden Sie Ihre Sitzung während Ihrer eigenen laufenden Buchung, werden Sie gefragt: **Behalten oder Rest
freigeben?**

- Im Web erscheint ein Dialog auf der Ressourcenseite („Deine Buchung läuft bis 16:00. Behalten oder den Rest
  freigeben?“). Ignorieren Sie ihn, bleibt die Buchung bestehen. Die Frage wird 15 Minuten lang gemerkt.
- Auf einem Attractap-Reader mit Bildschirm erscheint die Frage nach dem Stopp. Ohne Antwort gilt **Behalten**.

## Startschutz und Bestätigung

Beim Start einer Ressource prüft das Plugin die Buchungen **anderer** Personen. Nur bestätigte Buchungen zählen.

- **Eine fremde Buchung läuft:** Der Start wird mit „Von einer anderen Person bis 16:00 reserviert.“ abgelehnt, oder
  mit „Von Alex Beispiel bis 16:00 reserviert.“, wenn Sie sehen dürfen, wer die Maschine nutzt (siehe
  [Wer den Namen der buchenden Person sieht](#wer-den-namen-der-buchenden-person-sieht)).
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

## Wer den Namen der buchenden Person sieht

Der Name der buchenden Person folgt der Regel, die Attraccess bereits für die Anzeige verwendet, **wer eine Maschine
gerade nutzt**: Wer den Namen der aktuellen Nutzerin oder des aktuellen Nutzers einer Ressource sehen darf, sieht auch,
wer darauf gebucht hat. Alle anderen erhalten den anonymen Text („einer anderen Person“, „Reserviert“) und nur die
Zeiten. Welche Regel gilt, legt die Einstellung
[**Wer die Ressourcennutzung sehen darf**](settings/overview.md#sichtbarkeit-der-ressourcennutzung) fest.

- **Sieht den Namen:** die buchende Person; Verwaltende und Wartende der Ressource; alle mit **Ressourcen-Zugriff
  verwalten** (`resources.access.manage`); und alle, die die Nutzung der Maschine nach dieser Einstellung sehen dürfen.
  Mit dem Standard **Alle mit „Ressourcen lesen“** sind das alle mit **Ressourcen lesen**; mit **Nur in die Ressource
  eingewiesene Personen** die in die Maschine eingewiesenen Personen.
- **Sieht den Namen nicht:** Personen, die nur **Verfügbar** oder **In Benutzung** sehen (Maschinen, die beaufsichtigte
  Nutzung erlauben oder erfordern, bei der Einstellung „Nur eingewiesene Personen“), und Personen, die die Aktivität
  der Maschine gar nicht sehen dürfen.
- **Wo das gilt:** der Hinweis auf der Ressourcenseite, die Ablehnung beim Drücken von Start (in der Web-Oberfläche,
  über die API und am Reader), die Verfügbarkeitsansicht in der Buchungskarte, die Kalender-Feeds und Attractap-Reader nach dem Auflegen einer Karte (siehe [Attractap-Reader](#attractap-reader)). Notizen, Gründe und Entscheidungen einer Buchung
  sehen weiterhin nur die buchende Person und die Verwaltenden. Verwaltende erhalten immer die Override-Bestätigung,
  die die buchende Person nennt.
- Ein Kalender-Feed wird beim Abruf geprüft, mit den Berechtigungen der Feed-Besitzerin oder des Feed-Besitzers zu
  diesem Zeitpunkt.

## Attractap-Reader

Auf einem Attractap-Touch-Reader mit aktueller Firmware zeigt das Plugin Reservierungsinformationen auf dem
Bildschirm an, fragt vor einem Start nach, der mit einer Buchung kollidiert, und wertet einen Start am Reader als
Check-in. Für die Reader-Widgets braucht das Plugin die Berechtigung, Widgets auf Attractap-Reader-Bildschirmen anzuzeigen, die eine
administrierende Person bei Installation oder Update freigibt (siehe [Reader-Anzeige](attractap/reader-ui.md)).
Alle Zeiten stehen in der [Zeitzone](plugins/reservations/administration.md#zeitzone) des Plugins als `HH:MM`; eine Zeit an einem anderen Tag bekommt einen
kurzen Wochentag („Di 09:00“). Gezeigt werden nur bestätigte Buchungen. Der Status des Readers selbst („In
Benutzung“, Wartung und so weiter) hat immer Vorrang vor dem Hinweis des Plugins.

**Vor dem Auflegen einer Karte.** Ein Reader, an dem niemand angemeldet ist, zeigt nur Zeiten und Zustände, nie Namen
oder andere personenbezogene Daten, auch nicht für Personen, die sonst Namen sehen dürfen:

| Situation                                                                                                                                         | Ressourcenliste            | Ressourcendetails                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------- |
| Nichts läuft, nichts beginnt innerhalb von 24 Stunden                                                                                             | nichts                     | nichts                                        |
| Die nächste Buchung beginnt innerhalb von 24 Stunden, keine läuft                                                                                 | „Frei bis 14:00“           | „Frei bis 14:00, dann reserviert bis 16:00“   |
| Eine Buchung läuft, Check-in ist verlangt, aber noch nicht erfolgt, vor Ablauf der Frist                                                          | „Res., Check-in bis 14:15“ | „Reserviert 14:00-16:00 (Check-in bis 14:15)“ |
| Eine Buchung läuft und ist eingecheckt, Check-in ist ausgeschaltet, oder die Check-in-Frist ist ohne Check-in abgelaufen (noch nicht freigegeben) | „Reserviert bis 16:00“     | „Reserviert 14:00-16:00“                      |

Jede Buchung steht pro Bildschirm in genau einem Text, nie doppelt: Die Details haben eine Zeile für die freie Zeit
und die Buchung, die sie beendet. Die Listenzeile fasst 24 Zeichen, deshalb ist der offene Check-in dort gekürzt; eine Frist an einem anderen Tag
lautet „Res., Check-in Di 00:05“. Die Details haben immer den vollen Text. Der Sperrbildschirm der Ressource zeigt
dieselbe öffentliche Zeile wie die Listenzeile, anstelle von „Verfügbar“ (nicht, solange die Ressource in Benutzung
oder in Wartung ist).

**Die aktuelle Uhrzeit.** Reader-Bildschirme zeigen die aktuelle Zeit in der Fußleiste (der Sperrbildschirm und
die Liste ohne Anmeldung haben stattdessen eine große Uhr, und die Sitzungszusammenfassung nach einem Stopp zeigt
keine Fußleiste, außer solange die Frage „behalten oder freigeben“ offen ist), so lässt sich „Check-in bis 14:15“ auf jetzt beziehen.
Das Plugin schreibt die Uhrzeit nicht in seine Texte. Der Reader nutzt für diese Uhr die [Zeitzone](plugins/reservations/administration.md#zeitzone) des
Plugins, daher stimmen Uhr und Reservierungszeiten immer überein, auch wenn der Server in einer anderen Zone läuft;
ändert sich die Zeitzone, wechseln die Reader sofort. Das Plugin schlägt seine Zeitzone nur für Ressourcen vor, bei
denen Reservierungen aktiviert sind; für andere Ressourcen gilt die Zeitzone des Servers. Siehe
[Uhrzeit und Zeitzone](attractap/reader-ui.md#uhrzeit-und-zeitzone).

Die Zeiten sind Beginn und Ende der Buchung ohne Puffer. Die Texte folgen der Standardsprache der Installation.

Auf einem Attractap Touch mit aktueller Firmware wird eine Uhrzeit wie „14:25“ nie auf zwei Zeilen verteilt. Jede Zeile
enthält einen Teil eines Hinweises, zum Beispiel „Frei bis 13:55,“ über „dann reserviert von bea bis 14:25“ und den
Check-in-Hinweis „(Check-in bis 14:10)“ unter der Buchung. Bei einem langen Namen stehen die Zeiten in einer eigenen
Zeile.

**Nach dem Auflegen einer Karte.** Die Texte folgen der Sprache der Person, die die Karte aufgelegt hat. Endet die
Kartensitzung, kehrt der Reader zu den Texten oben zurück.

- **Die eigene Buchung** (laufend oder beginnt im Fenster für frühes Einchecken): Die Liste zeigt „Deine Buchung bis
  16:00“ („Für dich bis Mi 16:00“, wenn sie an einem anderen Tag endet), die Details „Deine Buchung 14:00-16:00“,
  bei noch offenem Check-in mit dem Zusatz „(Check-in bis 14:15)“.
- **Wer den Namen der buchenden Person sehen darf** (Verwaltende der Ressource und alle anderen, die sehen dürfen, wer
  die Maschine nutzt, siehe [Wer den Namen der buchenden Person sieht](#wer-den-namen-der-buchenden-person-sieht)),
  sieht ihn auch in den Details („Frei bis 14:00, dann reserviert von Alex bis 16:00“, „Reserviert von Alex 14:00-16:00 (Check-in bis
  14:15)“). Alle anderen sehen die Texte oben.
- **Im Leerlauf** (niemand nutzt die Ressource und keine Buchung läuft): Der Detailtext trägt die freie Zeit und die nächste Buchung in einer
  Zeile, „Frei bis 14:00, dann reserviert von Alex bis 16:00“ (Name nach den Regeln oben, sonst „Frei bis 14:00, dann
  reserviert bis 16:00“). Das gilt auch, wenn diese Buchung im Bestätigungsfenster beginnt; solange nichts läuft,
  zeigt der Reader keinen Sitzungsbereich, der Detailtext ist also der eine Ort dafür.
- **Solange eine Nutzung läuft** (Ihre oder die einer anderen Person), Sie angemeldet sind und die Buchung einer
  anderen Person im Bestätigungsfenster beginnt, zeigt der Sitzungsbereich diese Buchung einmal, „Reserviert von Alex
  14:00-16:00“, mit einem Countdown (Name nach den Regeln oben, sonst „Reserviert 14:00-16:00“). Der Detailtext zeigt
  dann nichts zu dieser Buchung: keine „Frei bis“-Zeile und keinen zweiten Text. Beginnt, endet oder wechselt eine
  Nutzung, verschiebt der Reader den Text innerhalb weniger Sekunden zwischen den beiden Orten.
- Die **Liste zeigt nie Namen**, weder angemeldet noch abgemeldet. Lange Namen werden in den Details gekürzt.

**Am Reader starten.**

| Situation                                                                 | Was der Reader tut                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Die Buchung einer anderen Person beginnt im Bestätigungsfenster           | Fragt „Reserviert ab 14:00, du hast 40 Min. Trotzdem starten?“ mit Countdown. Abbrechen oder keine Antwort startet nichts. Der Name steht nur dabei, wenn Sie Namen sehen dürfen.          |
| Die Buchung einer anderen Person läuft                                    | Lehnt ab: „Von einer anderen Person bis 16:00 reserviert“ (mit Namen, wenn Sie Namen sehen dürfen). Verwaltende bekommen stattdessen die Override-Frage, die buchende Person wird genannt. |
| Sie starten innerhalb Ihrer Buchung oder im Fenster für frühes Einchecken | Keine Frage. Der Start checkt die Buchung ein und der Bildschirm aktualisiert sich.                                                                                                        |
| Sie beenden eine Sitzung innerhalb Ihrer eigenen laufenden Buchung        | Fragt „Behalten oder den Rest freigeben?“. **Rest freigeben** beendet die Buchung vorzeitig. Ohne Antwort innerhalb von 15 Sekunden bleibt die Buchung bestehen.                           |

Eine Buchung ohne Sitzung freizugeben ist nur in der Weboberfläche möglich. Buchen selbst ist am Reader nicht möglich.

**Reader ohne Bildschirm.** Attractap-Lite-Reader, Touch-Reader mit älterer Firmware und Reader, deren
Plugin-Hinweise nach Abstürzen pausiert sind, können nichts davon anzeigen:

| Reader                   | Reservierungstexte | Buchung beginnt bald                                                                                              | Andere Buchung läuft                                       | Frage nach dem Beenden             |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Lite                     | keine              | Das Plugin schlägt Blockieren vor; die Ressourceneinstellung **Reader ohne Bildschirm** entscheidet.              | Abgelehnt (bernsteinfarbener Halbring, dann rotes Blinken) | keine, die Buchung bleibt bestehen |
| Touch, ältere Firmware   | keine              | Dieselbe Einstellung; Blockieren zeigt einen allgemeinen Fehler. Zweites Auflegen der Karte gibt es nur für Lite. | Allgemeiner Fehler                                         | keine, die Buchung bleibt bestehen |
| Plugin-Hinweise pausiert | keine              | Dieselbe Einstellung.                                                                                             | Abgelehnt                                                  | keine, die Buchung bleibt bestehen |

**Reader ohne Bildschirm** ist unter [Reader-Anzeige](attractap/reader-ui.md#reader-ohne-bildschirm) beschrieben:
**Plugin-Standard** (Voreinstellung; dieses Plugin schlägt Blockieren vor), **Start blockieren**, **Mit zweitem Auflegen
der Karte bestätigen** (nur Lite) oder **Mit Warnung starten**. Dieselbe Einstellung entscheidet über das Übergehen
einer laufenden Buchung durch Verwaltende; für alle anderen wird ein Start während der laufenden Buchung einer anderen
Person immer abgelehnt. Der Check-in funktioniert auf jedem Readertyp, sofern die buchende Person den Start macht.

## Erinnerungen und Benachrichtigungen

Sie erhalten Benachrichtigungen in der App, per Push und per E-Mail, je nach Ihren Benachrichtigungseinstellungen
(siehe [Benachrichtigungskategorien](plugins/reservations/administration.md#benachrichtigungskategorien)). Jede Mitteilung wird höchstens einmal
gesendet. Die Texte nutzen Ihre Sprache, sofern bekannt, sonst die Standardsprache der Installation. Die E-Mails sind
[E-Mail-Vorlagen](plugins/reservations/administration.md#e-mail-vorlagen), die Administratoren bearbeiten können.

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

## Links in E-Mails

Aktionslinks in E-Mails („Behalten“, „Stornieren“) sind einfache Links auf `/reservations/<id>?action=keep|cancel`
in Attraccess.

- **Ein Link meldet Sie nie von selbst an** und enthält kein Token. Sind Sie nicht angemeldet, melden Sie sich wie
  gewohnt an und kehren zur Seite zurück.
- Das Öffnen des Links ändert nichts. Die Seite fragt in einem Dialog nach Ihrer Bestätigung, bevor sie die Buchung
  behält oder storniert.

Die Links in E-Mails werden aus der **Anwendungs-URL** gebildet, die konfiguriert sein muss, wie bei jeder
Attraccess-E-Mail; siehe [Einstellungen → Anwendungseinstellungen](settings/overview.md#anwendungseinstellungen).

## Kalender-Feeds (iCal)

Auf Ihrer Kontoseite können Sie im Abschnitt **Kalender-Feeds (iCal)** Buchungen in jeder Kalender-App abonnieren.

- Sie können mehrere Feeds anlegen (bis zu 20), jeweils mit einem Namen.
- Jeder Feed hat eine **Auswahl**. Kombinieren Sie eine oder mehrere der Optionen: bestimmte Ressourcen,
  Ressourcengruppen, alle Ressourcen, in die Sie eingewiesen sind, alle Ressourcen, die Sie warten, und nur Ihre
  eigenen Buchungen.
- Enthalten sind nur Ressourcen, die Sie **zum Zeitpunkt des Kalenderabrufs** sehen dürfen.
- Bestätigte Buchungen erscheinen als Termine, ausstehende als **vorläufige** Termine. Stornierte Buchungen
  verschwinden. Der Feed deckt die letzten 30 Tage bis zum Buchungshorizont der jeweiligen Ressource ab.
- Der Titel lautet „Ressource – Name“ bei Ihren eigenen Buchungen, bei Ressourcen, die Sie verwalten, und bei
  Ressourcen, bei denen Sie sehen dürfen, wer die Maschine nutzt
  ([Regel](#wer-den-namen-der-buchenden-person-sieht)); sonst „Ressource – Reserviert“.

> [!WARNING]
> Die Feed-URL ist ein Geheimnis: Wer sie kennt, kann den Feed ohne Anmeldung lesen. Sie wird **nur einmal**
> angezeigt, beim Erstellen oder Neu-Erzeugen des Feeds. Kopieren Sie sie sofort. Ist sie in falsche Hände geraten,
> erzeugen Sie sie **neu** (die alte URL funktioniert sofort nicht mehr) oder **widerrufen** Sie den Feed (die URL
> antwortet danach mit 404). Attraccess speichert nur einen Hash des Tokens.

Feeds sind ratenbegrenzt. Widerrufene und unbekannte Feeds antworten gleich mit `404`.
