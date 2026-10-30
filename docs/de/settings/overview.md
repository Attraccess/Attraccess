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
| **Standardsprache des Systems** | Deutsch oder Englisch als Ersatzsprache für übersetzte Inhalte. Eine unterstützte Benutzer- oder Browsersprache hat Vorrang. Attractap verwendet während einer Sitzung die unterstützte Sprache des Karteninhabers, sonst die Standardsprache. Auswahl bei der Ersteinrichtung; Administratoren können sie hier ändern. |

> [!TIP]
> Die meisten Einstellungen koennen auch ueber [Umgebungsvariablen](installation/environment-variables.md) konfiguriert werden. In der Oberflaeche geaenderte Einstellungen ueberschreiben die Standardwerte der Umgebungsvariablen.

## Sichtbarkeit der Ressourcennutzung

Unter **Allgemein** legt **Wer die Ressourcennutzung sehen darf** fest, wer sieht, welche Ressourcen in Benutzung sind und von wem. Zum Ändern ist die Berechtigung **Systemeinstellungen verwalten** (`system.settings.manage`) nötig; jede Änderung wird im [Audit-Log](settings/audit-log.md) protokolliert.

| Option | Wer die Nutzung einer Ressource sieht |
|--------|----------------------------------------|
| **Alle mit „Ressourcen lesen“** (Standard) | Alle mit der Berechtigung **Ressourcen lesen** (`resources.read`). |
| **Nur in die Ressource eingewiesene Personen** | Personen, die in die Ressource eingewiesen sind (direkt oder über eine Gruppe), ihre Einweiser und Wartenden sowie alle mit **Ressourcen bearbeiten** (`resources.update`) oder **Ressourcen-Zugriff verwalten** (`resources.access.manage`). |

In beiden Modi gilt:

- Man muss angemeldet sein. Abgemeldete Anfragen erhalten `401` und keine Daten.
- Die eigene laufende Sitzung sieht man immer.
- Die Namen der Einweiser und Wartenden einer Ressource bleiben für alle mit **Ressourcen lesen** sichtbar, damit noch nicht eingewiesene Personen wissen, wen sie fragen können. E-Mail-Adressen werden nie angezeigt.

Mit **Nur in die Ressource eingewiesene Personen** sehen alle anderen die Ressource weiterhin im Katalog, aber ohne Nutzung: Sie erscheint nicht in der Liste der Ressourcen in Benutzung, Statusabfragen antworten mit `403`, und Live-Aktualisierungen werden abgelehnt. Bei Ressourcen, die [beaufsichtigte Nutzung](resources/introductions.md#beaufsichtigungsmodus) erlauben oder erfordern, sehen sie nur **Verfügbar** oder **In Benutzung**, ohne Namen.

Die Einstellung liegt in den Systemeinstellungen. Instanzen, die sie nie gesetzt haben, verhalten sich wie **Alle mit „Ressourcen lesen“**; ein Upgrade braucht also keine Migration.

> [!NOTE]
> Skripte und Plugins, die die Liste der Ressourcen in Benutzung, Einweisungen oder Einweiser ohne Anmeldung lesen, funktionieren nicht mehr. Melden Sie sich stattdessen mit einem [API-Token](developer/api-reference.md) an. Die vollständigen Einweisungs- und Einweiser-Listen sowie die Abfrage, ob eine andere Person einweisen darf, erfordern **Ressourcen bearbeiten**, **Ressourcen-Zugriff verwalten** oder die Rolle Einweiser der Ressource bzw. ihrer Gruppe.

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
