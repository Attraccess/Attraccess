# RFID-Karten

RFID-Karten sind die physischen Schluessel, mit denen Benutzer ueber Attractap-Leser auf Maschinen und Tueren zugreifen koennen. Jede Karte ist mit einem Benutzerkonto in Attraccess verknuepft.

## Wie RFID-Karten funktionieren

Wenn ein Benutzer eine RFID-Karte an einen Attractap-Leser haelt, sendet der Leser die eindeutige ID der Karte an das Attraccess-Backend. Das Backend prueft:

1. Ist diese Karte im System registriert?
2. Mit welchem Benutzerkonto ist die Karte verknuepft?
3. Hat dieser Benutzer die Berechtigung, die zugewiesene Ressource zu nutzen?

Wenn alle Pruefungen bestanden sind, wird der Zugang gewaehrt.

## RFID-Karten verwalten

Öffnen Sie **RFID-Karten** in der Seitenleiste, um Ihre eigenen Karten zu verwalten. Die Liste zeigt ID, UID, Erstellungsdatum und den Zeitpunkt der letzten Verwendung.

### Neue Karte registrieren

1. Klicken Sie auf **RFID-Karte registrieren**
2. Wählen Sie einen verbundenen Attractap, der die Registrierung von Karten unterstützt
3. Klicken Sie auf **Registrieren** und folgen Sie den Anweisungen auf dem Leser

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

## Administratorfunktionen

Die Berechtigung `users.rfid-cards.manage` erlaubt die Verwaltung von RFID-Karten für beliebige Benutzer. Die Rolle **Administrator** enthält sie automatisch. Sie kann auch über eine eigene Rolle vergeben werden.

Öffnen Sie **Benutzer**, wählen Sie einen Benutzer und klicken Sie auf **RFID-Karten verwalten**. Dort können Sie Karten für den ausgewählten Benutzer registrieren, aktivieren, deaktivieren und löschen. Für den Zugriff auf die Benutzerdetails ist zusätzlich `users.read` erforderlich. Bei der Registrierung wird die Karte dem ausgewählten Benutzer zugeordnet; das Audit-Protokoll erfasst den ausführenden Administrator.

## Siehe auch

- [Leser benutzen](attractap/using-the-reader.md) – Mit der Karte anmelden und Maschinen oder Türen nutzen
- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
- [Benutzerverwaltung](user-management/overview.md) -- Benutzerkonten verwalten
- [Einweisungen](resources/introductions.md) -- Zugriffsberechtigungen fuer Ressourcen verwalten
