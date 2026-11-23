# RFID-Karten
<!-- llms-description: Wie RFID-Karten mit Benutzerkonten verknüpft sind, Kartenverwaltung, Kartentypen, unsichere UID-only-Karten und welche Leser Karten registrieren oder zurücksetzen dürfen. -->

RFID-Karten sind die physischen Schluessel, mit denen Benutzer ueber Attractap-Leser auf Maschinen und Tueren zugreifen koennen. Jede Karte ist mit einem Benutzerkonto in Attraccess verknuepft.

## Wie RFID-Karten funktionieren

Wenn ein Benutzer eine RFID-Karte an einen Attractap-Reader hält, sendet der Reader die eindeutige ID der Karte an das Attraccess-Backend. Das Backend spricht dann **über den Reader** mit der Karte und prüft:

1. Ist diese Karte im System registriert?
2. Beweist die Karte, dass sie den dafür gespeicherten geheimen Schlüssel kennt? (Eine kopierte Karten-ID genügt nicht.)
3. Mit welchem Benutzerkonto ist die Karte verknüpft?
4. Hat dieser Benutzer die Berechtigung, die zugewiesene Ressource zu nutzen?

Wenn alle Prüfungen bestanden sind, wird der Zugang gewährt. Der Reader reicht nur Nachrichten zwischen Backend und Karte durch: **Kartenschlüssel werden vom Server erzeugt und geprüft; beim Vorhalten einer Karte erfährt der Reader keinen Kartenschlüssel**. Ein Reader ohne Verbindung gewährt nichts.

Kartenschlüssel sind zufällig, je 16 Byte lang, und werden verschlüsselt gespeichert. Wie Sie das Secret sichern, das sie schützt, steht unter [Sicherheitseinstellungen](settings/security.md).

## RFID-Karten verwalten

Öffnen Sie **RFID-Karten** in der Seitenleiste, um Ihre eigenen Karten zu verwalten. Die Liste zeigt ID, UID, Erstellungsdatum und den Zeitpunkt der letzten Verwendung.

### Neue Karte registrieren

1. Klicken Sie auf **RFID-Karte registrieren**
2. Wählen Sie einen verbundenen Attractap, der die Registrierung von Karten unterstützt
3. Klicken Sie auf **Registrieren** und folgen Sie den Anweisungen auf dem Leser

Eine Karte wird erst registriert, nachdem der Server geprüft hat, dass die Karte ihren neuen Schlüssel angenommen hat. Wird die Karte weggezogen oder schlägt das Schreiben fehl, wird nichts gespeichert; halten Sie dieselbe Karte erneut an den Reader, dann wird die Registrierung abgeschlossen.

> [!NOTE]
> Für alle Kartenfunktionen brauchen Reader Firmware 2.0.0 oder neuer. Readern mit älterer Firmware wird das Update auf 2.0.0 beim Verbindungsaufbau automatisch angeboten (siehe [Firmware-Updates](attractap/firmware-updates.md)). Bis sie es installiert haben, lehnt der Server ihre Kartenanmeldungen ab, und sie können keine Karten registrieren oder zurücksetzen. Bereits registrierte Karten funktionieren weiter, sobald der Reader aktualisiert ist.

### Karten aktivieren und deaktivieren

Klicken Sie neben einer Karte auf **Aktivieren** oder **Deaktivieren** und bestätigen Sie die Aktion. Beim Aktivieren werden die anderen Karten des Benutzers automatisch deaktiviert. Somit ist pro Benutzer nur eine Karte aktiv. Deaktivieren Sie verlorene Karten sofort, um den Zugang ohne die physische Karte zu widerrufen.

### Karte entfernen

1. Klicken Sie neben der Karte auf **Löschen**
2. Wählen Sie einen verbundenen Attractap und bestätigen Sie **Löschen**
3. Folgen Sie den Anweisungen auf dem Leser, um die physische Karte zurückzusetzen

Die Karte wird aus dem Konto entfernt, nachdem der Server geprüft hat, dass die Karte wieder im Werkszustand ist. Die physische Karte wird benötigt; nutzen Sie **Deaktivieren**, falls die Karte nicht verfügbar ist.

**UID-only-Karten** brauchen keinen Leser: Auf sie wird nichts geschrieben, daher fragt **Löschen** nur nach einer Bestätigung und entfernt die Karte sofort. Das können der Besitzer oder Benutzer mit `users.rfid-cards.manage`; das Audit-Log hält es fest.

## Mehrere Karten pro Benutzer

Jeder Benutzer kann mehrere RFID-Karten mit seinem Konto verknuepfen. Dies ist nuetzlich, wenn:

- Ein Benutzer eine Ersatzkarte benoetigt
- Ein Benutzer verschiedene Karten fuer verschiedene Standorte hat
- Eine verlorene Karte ersetzt werden muss, waehrend die alte deaktiviert bleibt

## Kartentypen

Attractap-Leser verwenden AES-verschluesselte Authentifizierung, die Karten mit Hardware-Krypto-Unterstuetzung erfordert:

| Kartentyp | Unterstuetzt |
|-----------|-------------|
| NTAG424 DNA | Ja |
| MIFARE DESFire EV2/EV3 | Ja |
| MIFARE DESFire EV1 | Nur als [UID-only-Karte](#uid-only-karten-unsicher) |
| MIFARE Classic / Ultralight / NTAG213-216 | Nur als [UID-only-Karte](#uid-only-karten-unsicher) |
| UID-only (unsicher, benötigt Einstellung) | Karten ohne AES, die nur ihre UID bieten: MIFARE Classic, MIFARE Ultralight, NTAG213/215/216 und DESFire EV1. Standardmäßig aus; ein Administrator muss sie erlauben. |

> [!NOTE]
> Auf MIFARE-DESFire-Karten speichert Attractap seine Schluessel in einer eigenen DESFire-Applikation (AID `0xACCE55`), die bei der Registrierung automatisch angelegt wird. Andere Applikationen auf der Karte (z.B. bestehende Zugangssysteme) bleiben unberuehrt.

## UID-only-Karten (unsicher)

Günstige RFID-Karten (MIFARE Classic, MIFARE Ultralight, NTAG213/215/216 und DESFire EV1) können keine AES-Authentifizierung. Sie bieten nur ihre UID. Ein Administrator kann sie unter **Einstellungen -> RFID-Kartenregistrierung** mit dem Schalter **UID-only-Karten erlauben (unsicher)** zulassen. Der Schalter ist standardmäßig aus, nur Benutzer mit `system.settings.manage` können ihn ändern, und das Einschalten verlangt eine Bestätigung. Jede Änderung steht im Audit-Log.

> [!CAUTION]
> **UID-only-Karten lassen sich mit günstigen Werkzeugen kopieren.** Der Server vergleicht nur die UID. Wer eine solche Karte ausliest, kann sich an Maschinen und Türen als deren Besitzer ausgeben, auch an Türen, die über Plugins wie das CES-Schloss-Plugin geöffnet werden. Erlauben Sie sie nur, wenn Sie dieses Risiko akzeptieren.

So funktioniert es:

- **Ein Schalter für die ganze Installation.** Er gilt für alle Reader und Plugins; es gibt keine Einstellung pro Reader oder Ressource.
- **Die Registrierung weicht automatisch aus.** Der Reader prüft zuerst, ob die Karte AES kann. Eine Karte, die es kann, wird immer sicher registriert. Eine Karte, die es nicht kann, wird als UID-only-Karte registriert, aber nur bei eingeschalteter Einstellung; sonst zeigt der Reader „Karte wird nicht unterstützt“. Eine sichere Karte (NTAG 424 DNA, DESFire EV2/EV3) wird nie als UID-only registriert, auch nicht, wenn ihre sichere Registrierung fehlschlägt.
- **Der Karteneintrag entscheidet, wie ein Scan geprüft wird.** Eine sichere Karte muss immer ihren Schlüssel beweisen, egal was die Einstellung sagt; ihre UID auf eine billige Karte zu kopieren funktioniert also nicht. Eine UID-only-Karte wird allein anhand der UID akzeptiert, und nur bei eingeschalteter Einstellung.
- **Karten mit zufälliger UID werden abgelehnt.** Ein Handy oder eine Bankkarte ändert die UID bei jedem Auflegen; der Reader zeigt „Karte mit wechselnder UID wird nicht unterstützt“.
- **Einstellung ausschalten.** Vorhandene UID-only-Karten bleiben in den Kartenlisten, markiert mit **Nur UID, deaktiviert**, werden aber von Readern und Plugins abgelehnt („UID-Karten sind deaktiviert“), bis die Einstellung wieder eingeschaltet wird. Sie müssen nicht neu registriert werden.
- **Kartenlisten.** UID-only-Karten tragen ein Label **Nur UID**.

> [!NOTE]
> Der Reader meldet den Kartentyp, daher brauchen Reader Firmware 2.14.0 oder neuer, um UID-only-Karten zu registrieren und zu nutzen. Reader mit älterer Firmware verhalten sich wie bisher.

## Welche Reader Karten registrieren und zurücksetzen dürfen

Standardmäßig kann jeder Reader mit Display und Firmware 2.0.0 oder neuer Karten registrieren und zurücksetzen. Administratoren können das unter **Einstellungen -> RFID-Kartenregistrierung** begrenzen: Wählen Sie **Ausgewählten Readern** und kreuzen Sie die Reader an, die Karten beschreiben dürfen. Die Bildschirme zum Registrieren und Zurücksetzen zeigen dann nur diese Reader. Alle Reader lassen Mitglieder sich weiterhin mit ihrer Karte anmelden.

Reader, deren Kopplung entfernt wurde, erscheinen nur im Block **Nicht gekoppelt** auf der Reader-Seite, wo sie erneut gekoppelt werden. Sie werden weder in der Reader-Liste, in Auswahlfeldern, in den Einstellungen noch bei der Ressourcenzuordnung angezeigt und können niemals Karten registrieren oder zurücksetzen, einen Start beaufsichtigen oder eine Sammeleinweisung ausführen. Ein solcher Reader kann sich bis zur erneuten Kopplung nicht verbinden und nimmt daher keine Kartenscans, Türen, Ressourcen oder Abläufe an.

> [!IMPORTANT]
> **Erlauben Sie nur gekoppelten, vertrauenswürdigen Readern, Karten zu registrieren und zurückzusetzen.** Eine neue Karte hat noch den öffentlich bekannten Werksschlüssel, deshalb schreibt der Server den neuen Kartenschlüssel unter diesem Werksschlüssel.
>
> - **Die Verbindung:** Ein [gekoppelter Reader](attractap/pairing.md) spricht über eine verschlüsselte Verbindung mit dem Server, niemand im Netzwerk kann den Schlüssel mitlesen. Ein nicht gekoppelter Reader kann sich gar nicht verbinden und deshalb nie Karten registrieren oder zurücksetzen.
> - **Der Reader selbst:** Der Reader, der den Schreibvorgang weiterreicht, kann den neuen Schlüssel weiterhin ermitteln. Ein manipulierter Reader könnte so Karten kopieren, die an ihm registriert oder zurückgesetzt wurden. Beschränken Sie das unter **Einstellungen -> RFID-Kartenregistrierung** auf Reader an einem Ort, den Sie kontrollieren, zum Beispiel am Empfang. Gegen manipulierte Reader soll abgesicherte Reader-Firmware helfen, die für eine spätere Version geplant ist.
>
> Das normale Vorhalten einer Karte ist nicht betroffen: Der Server prüft die Karte, ohne dass der Schlüssel über den Reader läuft.

## Administratorfunktionen

Die Berechtigung `users.rfid-cards.manage` erlaubt die Verwaltung von RFID-Karten für beliebige Benutzer. Die Rolle **Administrator** enthält sie automatisch. Sie kann auch über eine eigene Rolle vergeben werden.

Öffnen Sie **Benutzer**, wählen Sie einen Benutzer und klicken Sie auf **RFID-Karten verwalten**. Dort können Sie Karten für den ausgewählten Benutzer registrieren, aktivieren, deaktivieren und löschen. Für den Zugriff auf die Benutzerdetails ist zusätzlich `users.read` erforderlich. Bei der Registrierung wird die Karte dem ausgewählten Benutzer zugeordnet; das Audit-Protokoll erfasst den ausführenden Administrator.

## Siehe auch

- [Leser benutzen](attractap/using-the-reader.md) – Mit der Karte anmelden und Maschinen oder Türen nutzen
- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
- [Benutzerverwaltung](user-management/overview.md) -- Benutzerkonten verwalten
- [Einweisungen](resources/introductions.md) -- Zugriffsberechtigungen fuer Ressourcen verwalten
