# RFID-Karten

RFID-Karten sind die physischen Schluessel, mit denen Benutzer ueber Attractap-Leser auf Maschinen und Tueren zugreifen koennen. Jede Karte ist mit einem Benutzerkonto in Attraccess verknuepft.

## Wie RFID-Karten funktionieren

Wenn ein Benutzer eine RFID-Karte an einen Attractap-Leser haelt, sendet der Leser die eindeutige ID der Karte an das Attraccess-Backend. Das Backend spricht dann **ueber den Leser** mit der Karte und prueft:

1. Ist diese Karte im System registriert?
2. Beweist die Karte, dass sie den dafuer gespeicherten geheimen Schluessel kennt? (Eine kopierte Karten-ID genuegt nicht.)
3. Mit welchem Benutzerkonto ist die Karte verknuepft?
4. Hat dieser Benutzer die Berechtigung, die zugewiesene Ressource zu nutzen?

Wenn alle Pruefungen bestanden sind, wird der Zugang gewaehrt. Der Leser reicht nur Nachrichten zwischen Backend und Karte durch: **Kartenschluessel werden vom Server erzeugt und geprueft und erreichen nie einen Leser**. Ein Leser ohne Verbindung gewaehrt nichts.

Kartenschluessel sind zufaellig, je 16 Byte lang, und werden verschluesselt gespeichert. Wie du das Secret sicherst, das sie schuetzt, steht unter [Sicherheitseinstellungen](settings/security.md).

## RFID-Karten verwalten

Öffnen Sie **RFID-Karten** in der Seitenleiste, um Ihre eigenen Karten zu verwalten. Die Liste zeigt ID, UID, Erstellungsdatum und den Zeitpunkt der letzten Verwendung.

### Neue Karte registrieren

1. Klicken Sie auf **RFID-Karte registrieren**
2. Wählen Sie einen verbundenen Attractap, der die Registrierung von Karten unterstützt
3. Klicken Sie auf **Registrieren** und folgen Sie den Anweisungen auf dem Leser

Eine Karte wird erst registriert, nachdem der Server geprueft hat, dass die Karte ihren neuen Schluessel angenommen hat. Wird die Karte weggezogen oder schlaegt das Schreiben fehl, wird nichts gespeichert; halte dieselbe Karte erneut an den Leser, dann wird die Registrierung abgeschlossen.

> [!NOTE]
> Nur Leser mit Firmware 2.0.0 oder neuer koennen Karten registrieren und zuruecksetzen. Aeltere Leser werden beim naechsten Verbindungsaufbau automatisch aktualisiert (siehe [Firmware-Updates](attractap/firmware-updates.md)); bis dahin bieten sie keine Kartenfunktionen und zeigen, dass ein Update noetig ist. Bereits eingerichtete Karten funktionieren weiter.

### Karten aktivieren und deaktivieren

Klicken Sie neben einer Karte auf **Aktivieren** oder **Deaktivieren** und bestätigen Sie die Aktion. Beim Aktivieren werden die anderen Karten des Benutzers automatisch deaktiviert. Somit ist pro Benutzer nur eine Karte aktiv. Deaktivieren Sie verlorene Karten sofort, um den Zugang ohne die physische Karte zu widerrufen.

### Karte entfernen

1. Klicken Sie neben der Karte auf **Löschen**
2. Wählen Sie einen verbundenen Attractap und bestätigen Sie **Löschen**
3. Folgen Sie den Anweisungen auf dem Leser, um die physische Karte zurückzusetzen

Die Karte wird aus dem Konto entfernt, sobald der Leser das erfolgreiche Zurücksetzen bestätigt. Die physische Karte wird benötigt; nutzen Sie **Deaktivieren**, falls die Karte nicht verfügbar ist.

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

## Welche Leser Karten registrieren und zuruecksetzen duerfen

Standardmaessig kann jeder Leser Karten registrieren und zuruecksetzen. Administratoren koennen das unter **Einstellungen -> Kartenleser** begrenzen: **Ausgewaehlte Leser** waehlen und die Leser ankreuzen, die Karten beschreiben duerfen. Die Bildschirme zum Registrieren und Zuruecksetzen zeigen dann nur diese Leser. Alle Leser lassen Mitglieder sich weiterhin mit ihrer Karte anmelden.

## Administratorfunktionen

Die Berechtigung `users.rfid-cards.manage` erlaubt die Verwaltung von RFID-Karten für beliebige Benutzer. Die Rolle **Administrator** enthält sie automatisch. Sie kann auch über eine eigene Rolle vergeben werden.

Öffnen Sie **Benutzer**, wählen Sie einen Benutzer und klicken Sie auf **RFID-Karten verwalten**. Dort können Sie Karten für den ausgewählten Benutzer registrieren, aktivieren, deaktivieren und löschen. Für den Zugriff auf die Benutzerdetails ist zusätzlich `users.read` erforderlich. Bei der Registrierung wird die Karte dem ausgewählten Benutzer zugeordnet; das Audit-Protokoll erfasst den ausführenden Administrator.

## Siehe auch

- [Leser benutzen](attractap/using-the-reader.md) – Mit der Karte anmelden und Maschinen oder Türen nutzen
- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
- [Benutzerverwaltung](user-management/overview.md) -- Benutzerkonten verwalten
- [Einweisungen](resources/introductions.md) -- Zugriffsberechtigungen fuer Ressourcen verwalten
