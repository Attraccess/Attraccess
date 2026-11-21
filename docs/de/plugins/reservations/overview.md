# Reservierungen

<!-- llms-description: Das Plugin Reservierungen lässt Mitglieder eine Ressource für ein Zeitfenster buchen; Überblick, Voraussetzungen und Links zu Mitglieder-, Administrations- und API-Seiten. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Reservierungen** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Mit dem Plugin **Reservierungen** buchen Mitglieder eine Ressource im Voraus für ein bestimmtes Zeitfenster. Solange
eine Buchung aktiv ist, kann niemand sonst die Ressource starten. Wer kurz vor der Buchung einer anderen Person
startet, wird um eine Bestätigung gebeten.
Bei Maschinen mit mehreren parallelen Sitzungen belegt eine Buchung nur einen Platz (siehe
[Maschinen mit mehreren parallelen Sitzungen](plugins/reservations/using-reservations.md#maschinen-mit-mehreren-parallelen-sitzungen)).

Das Plugin beendet, sperrt oder übernimmt niemals eine laufende Sitzung. Es blockiert oder fragt nur vor dem
**Start** einer Sitzung und versendet Benachrichtigungen. Reservierungen sind standardmäßig deaktiviert und werden pro
Ressource aktiviert. Bei Ressourcen ohne aktivierte Reservierungen ändert sich nichts.

## Voraussetzungen

- Eine bezahlte Attraccess-Lizenz, die das Lizenzmodul **`reservations`** enthält. Das Plugin Reservierungen ist ein
  kommerzielles Add-on: Der Schlüssel für gemeinnützige Nutzung schaltet es **nicht** frei, eine kostenlose Nutzung
  gibt es nicht. Ohne das Modul wird das Plugin nicht geladen und erscheint in **Einstellungen → Plugins** als
  **Lizenz fehlt**. Speichern Sie einen gültigen Lizenzschlüssel mit dem Modul, startet Attraccess neu und lädt das
  Plugin. Siehe [Plugins installieren](plugins/installing-plugins.md#lizenz-fehlt). Lizenzen:
  [contact@attraccess.org](mailto:contact@attraccess.org).
- Attraccess 2.0 oder neuer.
- Das Upgrade einer 1.x-Installation (SQLite) übernimmt die Daten des Plugins nicht: Das Plugin startet auf
  PostgreSQL leer und muss neu eingerichtet werden (siehe
  [Umzug von SQLite auf PostgreSQL](installation/updating.md#umzug-von-sqlite-auf-postgresql)).
- Das Plugin `reservations`, installiert wie unter [Plugins installieren](plugins/installing-plugins.md) beschrieben.
  Die angeforderten Berechtigungen stehen unter [Reservierungen administrieren](plugins/reservations/administration.md#plugin-installieren).
- Optional: eine funktionierende [SMTP-Konfiguration](setup/smtp-email.md) für E-Mail-Hinweise. Ohne sie funktionieren
  In-App- und Push-Benachrichtigungen weiterhin.

## Wo es erscheint

- Eine Buchungskarte auf der Detailseite der Ressource und eine Liste **Meine Reservierungen** für Mitglieder.
- Eine Seite **Reservierungen verwalten** in der Seitenleiste für Verwaltende einer Ressource (Genehmigungen und alle
  Buchungen).
- Ein Bereich **Reservierungen** in den Ressourceneinstellungen und in den Systemeinstellungen (Zeitzone) für
  Administratoren.
- Attractap-Reader mit Bildschirm, die Buchungshinweise zeigen und Rückfragen stellen (siehe
  [Reader-Anzeige](attractap/reader-ui.md)).
- **Kalender-Feeds (iCal)** auf der Kontoseite des Benutzers, dazu Benachrichtigungen und Links in E-Mails.

## In diesem Bereich

| Seite                                                                   | Für             | Inhalt                                                                          |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| [Reservierungen nutzen](plugins/reservations/using-reservations.md)     | Mitglieder      | Buchen, Check-in, Genehmigung, Startschutz, Reader, Feeds                       |
| [Reservierungen administrieren](plugins/reservations/administration.md) | Administratoren | Installation, Einstellungen pro Ressource, Zeitzone, E-Mail-Vorlagen, Audit-Log |
| [Reservierungs-API](plugins/reservations/api.md)                        | Integratoren    | REST-Endpunkte und Fehlercodes                                                  |

## Siehe auch

- [Ressourcen-Übersicht](resources/overview.md)
- [Wartung](resources/maintenance.md)
- [Reader-Anzeige](attractap/reader-ui.md)
- [Plugins entwickeln](plugins/developing-plugins.md)
