# Systemeinstellungen

Auf der Seite Systemeinstellungen koennen Administratoren das grundlegende Verhalten der Anwendung konfigurieren. Oeffnen Sie diese ueber **Einstellungen** in der Seitenleiste.

## Einstellungen aufrufen

1. Klicken Sie auf **Einstellungen** in der Seitenleiste
2. Die Einstellungsseite oeffnet sich mit allen Konfigurationsbereichen

> [!NOTE]
> Sie benoetigen die Berechtigung **Systemkonfiguration verwalten**, um auf die Systemeinstellungen zugreifen zu koennen. Siehe [Berechtigungen](user-management/permissions.md).

<!-- TODO: Screenshot der Einstellungsseite -->

## Anwendungseinstellungen

Allgemeine Einstellungen fuer die Attraccess-Instanz:

| Einstellung | Beschreibung |
|-------------|-------------|
| **Anwendungs-URL** | Die URL, unter der Benutzer auf Attraccess zugreifen (entspricht `ATTRACCESS_URL`). |
| **Oeffentliche Internet-URL** | Oeffentliche URL fuer externe Callbacks, z.B. Zahlungsanbieter. Nur erforderlich, wenn sie sich von der Anwendungs-URL unterscheidet. |
| **Lizenzschluessel** | Ihr Attraccess-Lizenzschluessel. |

> [!TIP]
> Die meisten Einstellungen koennen auch ueber [Umgebungsvariablen](installation/environment-variables.md) konfiguriert werden. In der Oberflaeche geaenderte Einstellungen ueberschreiben die Standardwerte der Umgebungsvariablen.

## E-Mail-Einstellungen

Konfigurieren Sie, wie Attraccess E-Mails versendet:

| Einstellung | Beschreibung |
|-------------|-------------|
| **SMTP-Host** | Hostname Ihres E-Mail-Servers |
| **SMTP-Port** | Portnummer fuer die SMTP-Verbindung |
| **SMTP Sicher** | Ob TLS-Verschluesselung verwendet werden soll |
| **SMTP-Benutzer** | Benutzername fuer die Authentifizierung |
| **SMTP-Passwort** | Passwort fuer die Authentifizierung |
| **Absenderadresse** | Die "Von"-Adresse fuer ausgehende E-Mails |

Fuer eine detaillierte Anleitung zur E-Mail-Einrichtung siehe [E-Mail / SMTP](setup/smtp-email.md).

## Weitere Einstellungen

Abhaengig von Ihrer Attraccess-Version und installierten Plugins koennen zusaetzliche Einstellungsbereiche verfuegbar sein:

- **Erscheinungsbild** -- Anpassung des Erscheinungsbilds der Anwendung. Siehe [Erscheinungsbild](setup/branding.md).
- **E-Mail-Vorlagen** -- Benachrichtigungs-E-Mails anpassen. Siehe [E-Mail-Vorlagen](setup/email-templates.md).
- **Sicherheit** -- Cookie- und Sitzungseinstellungen. Siehe [Sicherheit](settings/security.md).

## Siehe auch

- [Umgebungsvariablen](installation/environment-variables.md) -- Alle Konfigurationsoptionen
- [Ersteinrichtung](setup/first-time-setup.md) -- Erstmalige Konfiguration
- [E-Mail / SMTP](setup/smtp-email.md) -- E-Mail-Server einrichten
- [Erscheinungsbild](setup/branding.md) -- Erscheinungsbild anpassen
- [Sicherheit](settings/security.md) -- Cookie- und Sitzungssicherheit
