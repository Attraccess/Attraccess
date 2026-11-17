# Berechtigungen

<!-- llms-description: Erklärt das rollenbasierte Berechtigungsmodell, Standardrollen, Berechtigungsschlüssel, Plugin-Berechtigungen, die Vergabe von Rollen und SSO-verwaltete Rollen. -->

Attraccess verwendet ein **rollenbasiertes Berechtigungsmodell (RBAC)**. Berechtigungen werden Benutzern nicht direkt zugewiesen: Benutzer erhalten **Rollen**, und jede Rolle gewährt eine Reihe feingranularer Berechtigungen.

## So funktioniert es

```
Benutzer → zugewiesene Rollen → Rollen enthalten Berechtigungen → Prüfungen fragen Berechtigungen ab
```

Die wirksamen Berechtigungen eines Benutzers sind die Vereinigung aller Berechtigungen seiner Rollen. Prüfungen fragen immer einzelne Berechtigungsschlüssel ab (z. B. `resources.update`), nie Rollennamen.

## Standardrollen

Diese systemverwalteten Rollen sind vorinstalliert und können nicht gelöscht werden:

| Rolle                     | Schlüssel          | Gewährte Berechtigungen                                                     |
| ------------------------- | ------------------ | --------------------------------------------------------------------------- |
| **Benutzer**              | `user`             | `resources.read`, standardmäßig jedem Benutzer zugewiesen                   |
| **Ressourcen-Verwalter**  | `resource-manager` | Ressourcen anlegen, ändern, löschen; Zugriff und Wartung verwalten          |
| **Benutzer-Verwalter**    | `user-manager`     | Benutzer lesen, anlegen, ändern, löschen; Rollenzuweisungen verwalten       |
| **Systemadministrator**   | `system-admin`     | Systemeinstellungen, SSO-Anbieter und Plugins verwalten                     |
| **Abrechnungs-Verwalter** | `billing-manager`  | Abrechnungskonfiguration und Transaktionen lesen und verwalten              |
| **Administrator**         | `administrator`    | Alle Berechtigungen, einschließlich aller verfügbaren Plugin-Berechtigungen |

## Berechtigungsschlüssel

| Kategorie | Schlüssel                      | Beschreibung                                                                                 |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| resources | `resources.read`               | Ressourcen anzeigen                                                                          |
| resources | `resources.create`             | Ressourcen anlegen                                                                           |
| resources | `resources.update`             | Ressourcen ändern                                                                            |
| resources | `resources.delete`             | Ressourcen löschen                                                                           |
| resources | `resources.access.manage`      | Zugriff auf Ressourcen verwalten (Einweisungen)                                              |
| resources | `resources.maintenance.manage` | Wartungen und Wartungsanfragen verwalten                                                     |
| resources | `resources.reports.export`     | Berichte zu Sitzungen und Betriebsdauer exportieren                                          |
| users     | `users.read`                   | Benutzer anzeigen                                                                            |
| users     | `users.create`                 | Benutzer anlegen                                                                             |
| users     | `users.update`                 | Benutzerkonten ändern                                                                        |
| users     | `users.delete`                 | Benutzer löschen                                                                             |
| users     | `users.roles.manage`           | Rollen zuweisen und entziehen                                                                |
| users     | `users.api-tokens.manage`      | Persönliche API-Tokens anlegen, anzeigen, ändern und widerrufen                              |
| users     | `users.rfid-cards.manage`      | RFID-Karten beliebiger Benutzer anzeigen, registrieren, aktivieren, deaktivieren und löschen |
| system    | `system.settings.manage`       | Systemkonfiguration ändern                                                                   |
| system    | `system.audit.read`            | Audit-Log lesen                                                                              |
| system    | `system.sso.manage`            | SSO-Anbieter konfigurieren                                                                   |
| system    | `system.plugins.manage`        | Plugins installieren und konfigurieren                                                       |
| billing   | `billing.read`                 | Abrechnungsdaten anzeigen                                                                    |
| billing   | `billing.manage`               | Abrechnungskonfiguration und Transaktionen verwalten                                         |

## Plugin-Berechtigungen

Plugins können eigene Berechtigungsschlüssel deklarieren, zum Beispiel `matter.devices.read` für das Matter-Plugin oder
`rabbitmq.broker.manage` für das RabbitMQ-Plugin. Sie erscheinen im Rollen-Editor und in der Auswahl für API-Tokens
in einer eigenen Gruppe pro Plugin, nach den Kernkategorien und in Ihrer Sprache beschriftet. Sie vergeben sie wie
Kernschlüssel über Rollen; SSO-Benutzer erhalten sie über ihre zugeordneten Rollen.

- **Administrator** hält immer jeden Plugin-Schlüssel.
- Bei der ersten Installation kann ein Plugin seine Schlüssel einigen Systemrollen geben (zum Beispiel
  **Ressourcen-Verwalter**). Das geschieht nur einmal: Entfernen Sie einen solchen Schlüssel später aus einer Rolle,
  bleibt er entfernt.
- Eigene Rollen erhalten Plugin-Schlüssel nie automatisch. Fügen Sie sie einer eigenen Rolle selbst hinzu.

Welche Schlüssel ein Plugin deklariert und was sie erlauben, steht in der Dokumentation des Plugins, zum Beispiel
[Matter-Berechtigungen](plugins/matter/permissions.md).

### Wenn ein Plugin deinstalliert ist oder nicht lädt

Wird ein Plugin deinstalliert, unter Quarantäne gestellt oder schlägt sein Laden fehl, oder entfernt eine neuere
Version einen Schlüssel, sind seine Schlüssel **nicht verfügbar**: Sie sind im Rollen-Editor und in der Auswahl für
API-Tokens ausgeblendet und gewähren nichts. Rollen und API-Tokens behalten ihre Zuweisungen, und das Bearbeiten
einer Rolle oder eines Tokens entfernt die ausgeblendeten nicht. Lädt das Plugin wieder, kommen seine Schlüssel mit
allen Zuweisungen zurück. Das Deinstallieren eines hochgeladenen Plugins löscht dessen Daten, aber nicht seine
Berechtigungen und Zuweisungen.

### Zwei-Faktor-Authentifizierung

Jeder Schlüssel außerhalb von `resources.*` macht seinen Inhaber für die Zwei-Faktor-Authentifizierung zu einem
**privilegierten** Benutzer. Plugin-Schlüssel sind keine Ausnahme: Gilt Ihre Zwei-Faktor-Richtlinie für privilegierte
Benutzer, muss ein Benutzer, der einen Plugin-Schlüssel erhält (zum Beispiel ein Ressourcen-Verwalter mit
Matter-Schlüsseln), die Zwei-Faktor-Authentifizierung einrichten.

## Rollen zuweisen

1. Öffnen Sie **Benutzer** in der Seitenleiste
2. Wählen Sie einen Benutzer aus
3. Weisen Sie im Bereich **Rollen** Rollen zu oder entziehen Sie sie
4. Änderungen wirken sofort

> Benutzer mit der Berechtigung `users.roles.manage` können nur Rollen zuweisen, deren Berechtigungen sie selbst alle halten („nur vergeben, was man selbst hat“).

## SSO-verwaltete Rollen

Wenn ein Benutzer über [SSO](user-management/sso-overview.md) angemeldet ist und der SSO-Anbieter [Berechtigungszuordnungen](user-management/sso-oidc.md) konfiguriert hat, werden Rollen bei jeder Anmeldung vom SSO-Anbieter synchronisiert.

SSO-zugewiesene Rollen tragen in der Rollenliste des Benutzers ein Anbieter-Kennzeichen. Solange SSO aktiv ist, können sie nicht manuell entzogen werden; Änderungen erfolgen über den SSO-Anbieter.

## Was alle Benutzer können

Ohne erweiterte Rolle kann jeder angemeldete Benutzer:

- Sich anmelden und sein Konto verwalten
- Ressourcen anzeigen, für die er eingewiesen ist (`resources.read`)
- Eigene Nutzungssitzungen starten und beenden
- An Projekten teilnehmen, zu denen er eingeladen wurde

## RFID-Karten anderer Benutzer verwalten

Die Berechtigung `users.rfid-cards.manage` erlaubt das Anzeigen, Registrieren, Aktivieren, Deaktivieren und Löschen von RFID-Karten für beliebige Benutzer. Die Rolle **Administrator** enthält diese Berechtigung automatisch; sie kann auch über eine eigene Rolle vergeben werden.

Öffnen Sie einen Benutzer und klicken Sie auf **RFID-Karten verwalten**. Für den Zugriff auf die Benutzerdetails benötigen Sie zusätzlich `users.read`.

## Siehe auch

- [Benutzerverwaltung](user-management/overview.md)
- [SSO Überblick](user-management/sso-overview.md)
- [Einweisungen](resources/introductions.md) – Ressourcenbezogene Berechtigungen
