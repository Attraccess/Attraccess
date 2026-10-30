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

## Sichtbarkeit der Gerätenutzung

Unter **Allgemein** legt **Wer die Gerätenutzung sehen darf** fest, wer sieht, welche Geräte in Benutzung sind und von wem. Zum Ändern ist die Berechtigung **Systemkonfiguration verwalten** nötig; jede Änderung wird im [Audit-Log](settings/audit-log.md) protokolliert.

| Option | Wer die Nutzung eines Geräts sieht |
|--------|-------------------------------------|
| **Alle Geräte** (Standard) | Alle mit der Berechtigung **Ressourcen ansehen**. |
| **Nur eingewiesene Geräte** | Personen, die das Gerät benutzen dürfen (direkt oder über eine Gruppe eingewiesen), seine Einweisenden und Wartenden sowie alle mit **Ressourcen verwalten** oder **Zugriff verwalten**. |

In beiden Modi gilt:

- Man muss angemeldet sein. Abgemeldete Anfragen erhalten `401` und keine Daten.
- Die eigene laufende Sitzung sieht man immer.
- Die Namen der Einweisenden und Wartenden eines Geräts bleiben für alle mit **Ressourcen ansehen** sichtbar, damit noch nicht eingewiesene Personen wissen, wen sie fragen können. E-Mail-Adressen werden nie angezeigt.

Im Modus **Nur eingewiesene Geräte** sehen alle anderen das Gerät weiterhin im Katalog, aber ohne Nutzung: Es erscheint nicht in der Liste der Geräte in Benutzung, Statusabfragen antworten mit `403`, und Live-Aktualisierungen werden abgelehnt. Bei Geräten mit [betreuter Nutzung](resources/introductions.md) sehen sie nur *frei* oder *in Benutzung*, ohne Namen.

Die Einstellung liegt in den Systemeinstellungen. Instanzen, die sie nie gesetzt haben, verhalten sich wie **Alle Geräte**; ein Upgrade braucht also keine Migration.

> [!NOTE]
> Skripte und Plugins, die die Liste der Geräte in Benutzung, Einweisungen oder Einweisende ohne Anmeldung lesen, funktionieren nicht mehr. Melden Sie sich stattdessen mit einem [API-Token](developer/api-reference.md) an. Die vollständigen Einweisungs- und Einweisenden-Listen sowie die Abfrage, ob eine andere Person einweisen darf, erfordern **Ressourcen verwalten**, **Zugriff verwalten** oder die Rolle Einweisende:r des Geräts bzw. seiner Gruppe.

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
