# RFID-Karten

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
| MIFARE DESFire EV1 | Nein (fehlender Authentifizierungsmodus) |
| MIFARE Classic / Ultralight / NTAG213-216 | Nein (keine AES-Authentifizierung) |

> [!NOTE]
> Auf MIFARE-DESFire-Karten speichert Attractap seine Schluessel in einer eigenen DESFire-Applikation (AID `0xACCE55`), die bei der Registrierung automatisch angelegt wird. Andere Applikationen auf der Karte (z.B. bestehende Zugangssysteme) bleiben unberuehrt.

## Welche Reader Karten registrieren und zurücksetzen dürfen

Standardmäßig kann jeder Reader mit Display und Firmware 2.0.0 oder neuer Karten registrieren und zurücksetzen. Administratoren können das unter **Einstellungen -> RFID-Kartenregistrierung** begrenzen: Wählen Sie **Ausgewählten Readern** und kreuzen Sie die Reader an, die Karten beschreiben dürfen. Die Bildschirme zum Registrieren und Zurücksetzen zeigen dann nur diese Reader. Alle Reader lassen Mitglieder sich weiterhin mit ihrer Karte anmelden.

Noch nicht gekoppelte Reader erscheinen nur im Block **Nicht gekoppelt** auf der Reader-Seite, wo sie gekoppelt werden. Sie werden weder in der Reader-Liste, in Auswahlfeldern, in den Einstellungen noch bei der Ressourcenzuordnung angezeigt und können niemals Karten registrieren oder zurücksetzen, einen Start beaufsichtigen oder eine Sammeleinweisung ausführen. Der Server behandelt einen solchen Reader wie einen mit veralteter Firmware: keine Kartenscans, Türen, Ressourcen oder Abläufe. Er nimmt nur Firmware-Updates an, und der Server fordert ihn zur Kopplung auf, sodass er seinen Code zeigt.

> [!IMPORTANT]
> **Erlauben Sie nur gekoppelten, vertrauenswürdigen Readern, Karten zu registrieren und zurückzusetzen.** Eine neue Karte hat noch den öffentlich bekannten Werksschlüssel, deshalb schreibt der Server den neuen Kartenschlüssel unter diesem Werksschlüssel.
>
> - **Die Verbindung:** Ein [gekoppelter Reader](attractap/pairing.md) spricht über eine verschlüsselte Verbindung mit dem Server, niemand im Netzwerk kann den Schlüssel mitlesen. Ein noch nicht gekoppelter Reader verbindet sich weiterhin unverschlüsselt. Ein noch nicht gekoppelter Reader kann Karten überhaupt nicht registrieren oder zurücksetzen.
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
