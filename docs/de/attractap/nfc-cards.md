# NFC-Karten

NFC-Karten sind die physischen Schluessel, mit denen Benutzer ueber Attractap-Leser auf Maschinen und Tueren zugreifen koennen. Jede Karte ist mit einem Benutzerkonto in Attraccess verknuepft.

## Wie NFC-Karten funktionieren

Wenn ein Benutzer eine NFC-Karte an einen Attractap-Leser haelt, sendet der Leser die eindeutige ID der Karte an das Attraccess-Backend. Das Backend prueft:

1. Ist diese Karte im System registriert?
2. Mit welchem Benutzerkonto ist die Karte verknuepft?
3. Hat dieser Benutzer die Berechtigung, die zugewiesene Ressource zu nutzen?

Wenn alle Pruefungen bestanden sind, wird der Zugang gewaehrt.

## NFC-Karten verwalten

### Alle Karten anzeigen

1. Navigieren Sie zu **Attractap** in der Seitenleiste
2. Klicken Sie auf **NFC-Karten**
3. Sie sehen eine Liste aller registrierten NFC-Karten mit ihren zugewiesenen Benutzern

<!-- TODO: Screenshot der NFC-Kartenliste -->

### Neue Karte registrieren

Um eine neue NFC-Karte zu registrieren:

1. Navigieren Sie zu **Attractap** > **NFC-Karten**
2. Klicken Sie auf **NFC-Karte hinzufuegen**
3. Waehlen Sie den Benutzer aus, der die Karte erhalten soll
4. Halten Sie die neue NFC-Karte an einen beliebigen verbundenen Attractap-Leser
5. Die Karten-ID wird automatisch erkannt und registriert

> [!TIP]
> Sie koennen eine Karte auch direkt ueber die Profilseite des Benutzers registrieren.

<!-- TODO: Screenshot des Dialogs "NFC-Karte hinzufuegen" -->

### Karte entfernen

1. Navigieren Sie zu **Attractap** > **NFC-Karten**
2. Suchen Sie die Karte, die Sie entfernen moechten
3. Klicken Sie auf die Schaltflaeche **Loeschen**
4. Bestaetigen Sie die Entfernung

> [!NOTE]
> Das Entfernen einer Karte widerruft den Zugang sofort. Die Karte kann an keinem Leser mehr verwendet werden.

## Mehrere Karten pro Benutzer

Jeder Benutzer kann mehrere NFC-Karten mit seinem Konto verknuepfen. Dies ist nuetzlich, wenn:

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

Administratoren koennen:

- Alle registrierten Karten ueber alle Benutzer hinweg einsehen
- Karten im Namen von Benutzern registrieren
- Karten von Benutzerkonten entfernen
- Sehen, welcher Leser eine Karte zuletzt gescannt hat

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
- [Benutzerverwaltung](user-management/overview.md) -- Benutzerkonten verwalten
- [Einweisungen](resources/introductions.md) -- Zugriffsberechtigungen fuer Ressourcen verwalten
