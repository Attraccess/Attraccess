# Berechtigungen

Attraccess verwendet **rollenbasierte Zugriffskontrolle (RBAC)**. Berechtigungen werden Benutzern nicht direkt zugewiesen — Benutzer erhalten **Rollen**, und jede Rolle gewährt granulare Berechtigungen.

## Funktionsweise

```
User → assigned Roles → Roles contain Permissions → Guards check Permissions
```

Die effektiven Benutzerrechte sind die Vereinigung aller durch zugewiesene Rollen gewährten Berechtigungen. Autorisierungs-Guards prüfen immer einzelne Berechtigungsschlüssel (beispielsweise `resources.update`), nie Rollennamen direkt.

## Standardrollen

Diese systemverwalteten Rollen sind vorinstalliert und können nicht gelöscht werden:

| Rolle                   | Schlüssel          | Gewährte Berechtigungen                                                                 |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| **Benutzer**            | `user`             | `resources.read` — standardmäßig jedem Benutzer gewährt                                 |
| **Ressourcenmanager**   | `resource-manager` | Ressourcen erstellen, aktualisieren und löschen; Ressourcenzugang und Wartung verwalten |
| **Benutzermanager**     | `user-manager`     | Benutzer lesen, erstellen, aktualisieren und löschen; Rollenzuweisungen verwalten       |
| **Systemadministrator** | `system-admin`     | Systemeinstellungen, SSO-Anbieter und Plugins verwalten                                 |
| **Abrechnungsmanager**  | `billing-manager`  | Abrechnungskonfiguration und Transaktionen lesen und verwalten                          |
| **Eigentümer**          | `owner`            | Alle Berechtigungen                                                                     |

## Berechtigungsschlüssel

| Kategorie | Schlüssel                      | Beschreibung                                                                                 |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| resources | `resources.read`               | Ressourceninformationen anzeigen                                                             |
| resources | `resources.create`             | Neue Ressourcen erstellen                                                                    |
| resources | `resources.update`             | Bestehende Ressourcen aktualisieren                                                          |
| resources | `resources.delete`             | Ressourcen löschen                                                                           |
| resources | `resources.access.manage`      | Ressourcenzugang verwalten (Einweisungen)                                                    |
| resources | `resources.maintenance.manage` | Wartungspläne und -anfragen verwalten                                                        |
| users     | `users.read`                   | Benutzerinformationen anzeigen                                                               |
| users     | `users.create`                 | Benutzer erstellen                                                                           |
| users     | `users.update`                 | Benutzerkonten aktualisieren                                                                 |
| users     | `users.delete`                 | Benutzer löschen                                                                             |
| users     | `users.roles.manage`           | Benutzerrollen zuweisen und widerrufen                                                       |
| users     | `users.rfid-cards.manage`      | RFID-Karten beliebiger Benutzer anzeigen, registrieren, aktivieren, deaktivieren und löschen |
| system    | `system.settings.manage`       | Systemkonfiguration ändern                                                                   |
| system    | `system.sso.manage`            | SSO-Anbieterkonfiguration verwalten                                                          |
| system    | `system.plugins.manage`        | Plugins installieren und konfigurieren                                                       |
| billing   | `billing.read`                 | Abrechnungsinformationen anzeigen                                                            |
| billing   | `billing.manage`               | Abrechnungskonfiguration und Transaktionen verwalten                                         |

## Rollen zuweisen

1. **Benutzer** in der Seitenleiste öffnen
2. Benutzer auswählen
3. Im Bereich **Rollen** Rollen zuweisen oder widerrufen
4. Änderungen wirken sofort

> Benutzer mit `users.roles.manage` dürfen nur Rollen zuweisen, deren Berechtigungen eine Teilmenge ihrer eigenen effektiven Rechte sind („keine Rechte vergeben, die man nicht hat“).

## SSO-verwaltete Rollen

Ist ein Benutzer über [SSO](user-management/sso-overview.md) angemeldet und der SSO-Anbieter hat [Berechtigungszuordnungen](user-management/sso-oidc.md), werden Rollen bei jedem Login automatisch synchronisiert.

SSO-zugewiesene Rollen erscheinen mit Anbieter-Badge in der Rollenliste. Sie können bei aktivem SSO nicht manuell widerrufen werden — Änderungen müssen beim SSO-Anbieter erfolgen.

## Was alle Benutzer können

Ohne erhöhte Rolle kann jeder authentifizierte Benutzer:

- Sich anmelden und eigenes Konto verwalten
- Ressourcen mit erfolgter Einweisung anzeigen (`resources.read`)
- Eigene Nutzungssitzungen starten und stoppen
- An eingeladenen Projekten teilnehmen

## RFID-Karten anderer Benutzer verwalten

Die Berechtigung `users.rfid-cards.manage` erlaubt das Anzeigen, Registrieren, Aktivieren, Deaktivieren und Löschen von RFID-Karten beliebiger Benutzer. Sie kann über eine eigene Rolle vergeben werden.

Öffnen Sie einen Benutzer und wählen Sie **RFID-Karten verwalten**. Zugriff auf Benutzerdetails benötigt zusätzlich `users.read`.

## Siehe auch

- [Benutzerverwaltung](user-management/overview.md)
- [SSO-Überblick](user-management/sso-overview.md)
- [Einweisungen](resources/introductions.md) — Ressourcenbezogene Zugangsgewährung
