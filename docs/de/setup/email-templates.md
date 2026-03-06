# E-Mail-Vorlagen

Attraccess verwendet E-Mail-Vorlagen für automatisierte Nachrichten wie Registrierungsbestätigungen und Passwort-Zurücksetzungen. Sie können diese Vorlagen an Ihre Organisation anpassen.

## Vorlagen verwalten

Navigieren Sie zu **E-Mail-Vorlagen** in der Seitenleiste. Sie benötigen die Berechtigung **Systemkonfiguration verwalten**.

<!-- TODO: Screenshot der E-Mail-Vorlagen-Seite einfügen -->

## Verfügbare Vorlagen

Attraccess enthält Standardvorlagen für:

- **Registrierungsbestätigung** – Wird nach der Kontoerstellung gesendet
- **Passwort zurücksetzen** – Link zum Zurücksetzen des Passworts
- **E-Mail-Verifizierung** – Bestätigung der E-Mail-Adresse
- **Projekteinladung** – Einladung zu einem Projekt

## Vorlagen bearbeiten

1. Wählen Sie eine Vorlage aus der Liste
2. Bearbeiten Sie Betreff und Inhalt
3. Verwenden Sie Platzhalter für dynamische Inhalte
4. Speichern Sie die Änderungen

## Platzhalter

Vorlagen unterstützen Platzhalter, die beim Versand automatisch ersetzt werden:

| Platzhalter | Beschreibung |
|-------------|-------------|
| `{{username}}` | Benutzername des Empfängers |
| `{{email}}` | E-Mail-Adresse des Empfängers |
| `{{link}}` | Aktionslink (Bestätigung, Zurücksetzung etc.) |
| `{{appName}}` | Name der Anwendung |

## Siehe auch

- [E-Mail / SMTP](setup/smtp-email.md)
- [Ersteinrichtung](setup/first-time-setup.md)
