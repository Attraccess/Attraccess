# E-Mail-Vorlagen

Attraccess verwendet E-Mail-Vorlagen für automatisierte Nachrichten wie Registrierungsbestätigungen und Passwort-Zurücksetzungen. Sie können diese Vorlagen an Ihre Organisation anpassen.

## Vorlagen verwalten

Öffnen Sie **Einstellungen** in der Seitenleiste, wählen Sie den Bereich **E-Mail** und öffnen Sie **Vorlagen**. Sie benötigen die Berechtigung **Systemkonfiguration verwalten**.

<!-- TODO: Screenshot der E-Mail-Vorlagen-Seite einfügen -->

## Verfügbare Vorlagen

Attraccess enthält Standardvorlagen für:

- **Registrierungsbestätigung** – Wird nach der Kontoerstellung gesendet
- **Passwort zurücksetzen** – Link zum Zurücksetzen des Passworts
- **E-Mail-Verifizierung** – Bestätigung der E-Mail-Adresse
- **Projekteinladung** – Einladung zu einem Projekt

## Plugin-Vorlagen

Plugins können eigene E-Mail-Vorlagen mitbringen (das Reservierungs-Plugin etwa für Buchungsbestätigungen und
Erinnerungen). Sie stehen in derselben Liste nach den Kernvorlagen, mit einem Chip **Plugin: &lt;Name&gt;**
gekennzeichnet, und werden genauso bearbeitet und übersetzt. Ist eine Plugin-Vorlage einmal gespeichert, gehört sie
Ihnen: Plugin-Upgrades lassen Ihre Fassung unverändert, neue Standardtexte eines Plugin-Updates überschreiben sie also
nicht. Mit **Standard wiederherstellen** übernehmen Sie die aktuellen Standardtexte und Übersetzungen des Plugins.

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
