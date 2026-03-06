# E-Mail / SMTP-Konfiguration

Attraccess benötigt einen E-Mail-Server (SMTP), um E-Mails zu versenden – zum Beispiel für die Kontobestätigung, Passwort-Zurücksetzungen und Einladungen.

## Einstellungen konfigurieren

Navigieren Sie zu **Einstellungen** in der Seitenleiste und öffnen Sie den Bereich **E-Mail**.

### SMTP-Server

| Feld | Beschreibung | Beispiel |
|------|-------------|---------|
| **Dienst** | `SMTP` oder `Outlook365` | `SMTP` |
| **Server** | SMTP-Servername | `smtp.gmail.com` |
| **Port** | SMTP-Port | `587` |
| **Verschlüsselung** | TLS aktivieren | `true` |
| **Benutzer** | Anmeldename | `benutzer@example.com` |
| **Passwort** | SMTP-Passwort | |
| **Absender** | Von-Adresse | `no-reply@example.com` |

### Microsoft Outlook 365

Wählen Sie `Outlook365` als Dienst. Server, Port und Verschlüsselung werden automatisch gesetzt:
- Server: `smtp.office365.com`
- Port: `587`

Sie müssen nur Benutzer, Passwort und Absender-Adresse angeben.

## Häufige SMTP-Anbieter

| Anbieter | Server | Port | Verschlüsselung |
|----------|--------|------|-----------------|
| Gmail | `smtp.gmail.com` | `587` | Ja |
| Outlook/Office365 | `smtp.office365.com` | `587` | Ja |
| Mailgun | `smtp.mailgun.org` | `587` | Ja |
| SendGrid | `smtp.sendgrid.net` | `587` | Ja |

> [!TIP]
> Bei Gmail müssen Sie eventuell ein **App-Passwort** erstellen, wenn die Zwei-Faktor-Authentifizierung aktiviert ist.

## Lokaler Test mit Mailpit

Zum Testen können Sie [Mailpit](https://github.com/axllent/mailpit) als lokalen E-Mail-Server nutzen:

```yaml
services:
  mailpit:
    image: axllent/mailpit
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web-Oberfläche
```

Verwenden Sie dann folgende SMTP-Einstellungen:
- Server: `mailpit`
- Port: `1025`
- Verschlüsselung: `false`
- Kein Benutzer/Passwort nötig

Die Web-Oberfläche unter `http://ihr-server:8025` zeigt alle versendeten E-Mails an.

## Siehe auch

- [Ersteinrichtung](setup/first-time-setup.md)
- [E-Mail-Vorlagen](setup/email-templates.md)
- [Umgebungsvariablen](installation/environment-variables.md)
