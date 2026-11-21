# Benutzerverwaltung
<!-- llms-description: Überblick über die Benutzerverwaltung: Konten anlegen, Berechtigungen vergeben und Anmeldemethoden als Administrator konfigurieren. -->

Die Benutzerverwaltung ermöglicht es Administratoren, Benutzerkonten zu erstellen, Berechtigungen zu vergeben und Anmeldemethoden zu konfigurieren.

## Zugriff

Navigieren Sie zu **Benutzer** in der Seitenleiste. Sie benötigen die Berechtigung **Benutzer verwalten**.

<!-- TODO: Screenshot der Benutzerliste einfügen -->

## Funktionen

### Benutzerliste

Die Benutzerliste zeigt alle registrierten Benutzer mit:

- Name (Vor- und Nachname, ersatzweise der Benutzername) mit dem Benutzernamen darunter sowie E-Mail
- Anmeldemethode (Passwort oder SSO-Anbieter)
- Systemberechtigungen

Die Liste kann durchsucht und seitenweise durchblättert werden.

### Benutzerdetails

Klicken Sie auf einen Benutzer, um seine Details zu sehen und zu bearbeiten:

- Kontoinformationen (Benutzername, optionaler Vor- und Nachname, E-Mail). Administratoren mit der Berechtigung **Benutzer aktualisieren** können den Namen ändern; er wird in ganz Attraccess statt des Benutzernamens angezeigt, ohne Namen dient der Benutzername als Ersatz. Namen von Benutzern, die sich per SSO anmelden, sind schreibgeschützt, weil der Identity Provider sie verwaltet.
- Anmeldemethoden (lokales Passwort, SSO-Verknüpfungen)
- Systemberechtigungen
- Verknüpfte RFID-Karten

### Anmeldemethoden

Jeder Benutzer kann mehrere Anmeldemethoden haben:

| Methode | Beschreibung |
|---------|-------------|
| **Lokales Passwort** | Benutzername/E-Mail und Passwort |
| **SSO (OIDC)** | Anmeldung über einen OIDC-Anbieter |
| **SSO (SAML)** | Anmeldung über einen SAML-Anbieter |
| **TOTP** | Zwei-Faktor-Authentifizierung als Zusatz |

## Nächste Schritte

- [Benutzer anlegen](user-management/creating-users.md)
- [Berechtigungen](user-management/permissions.md)
- [SSO einrichten](user-management/sso-overview.md)
- [Zwei-Faktor-Authentifizierung](user-management/two-factor-auth.md)
