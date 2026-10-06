# Berechtigungen

Attraccess verwendet ein Berechtigungssystem mit vier Systemberechtigungen, die Administratoren einzelnen Benutzern zuweisen können.

## Systemberechtigungen

| Berechtigung | Beschreibung |
|-------------|-------------|
| **Ressourcen verwalten** | Ressourcen erstellen, bearbeiten und löschen. Wartungen und Einweisungen verwalten. |
| **Systemkonfiguration verwalten** | Systemeinstellungen, SSO-Anbieter und E-Mail-Vorlagen konfigurieren. |
| **Benutzer verwalten** | Benutzerkonten und deren Berechtigungen verwalten. |
| **Abrechnung verwalten** | Abrechnungskonfiguration und Transaktionen verwalten. |

## Berechtigungen vergeben

1. Navigieren Sie zu **Benutzer** in der Seitenleiste
2. Wählen Sie einen Benutzer aus
3. Aktivieren oder deaktivieren Sie die gewünschten Berechtigungen
4. Speichern Sie die Änderungen

<!-- TODO: Screenshot der Berechtigungseinstellungen einfügen -->

## SSO-verwaltete Berechtigungen

Wenn ein Benutzer über [SSO](user-management/sso-overview.md) angemeldet ist und der SSO-Anbieter [Berechtigungszuordnungen](user-management/sso-oidc.md) konfiguriert hat, werden einige Berechtigungen automatisch durch den SSO-Anbieter gesteuert.

In diesem Fall:
- Die betroffenen Schalter sind deaktiviert (ausgegraut)
- Ein Hinweis zeigt an, welcher SSO-Anbieter die Berechtigung verwaltet
- Änderungen müssen über den SSO-Anbieter vorgenommen werden

## Berechtigungen ohne Administratorrolle

Auch ohne Systemberechtigungen können Benutzer:

- Sich anmelden und ihr Konto verwalten
- Ressourcen anzeigen, für die sie eingewiesen sind
- Ressourcen nutzen (Sitzungen starten/beenden)
- An Projekten teilnehmen, zu denen sie eingeladen wurden

## RFID-Karten anderer Benutzer verwalten

Die Berechtigung `users.rfid-cards.manage` erlaubt das Anzeigen, Registrieren, Aktivieren, Deaktivieren und Löschen von RFID-Karten für beliebige Benutzer. Die Rolle **Administrator** enthält diese Berechtigung automatisch; sie kann auch über eine eigene Rolle vergeben werden.

Öffnen Sie einen Benutzer und klicken Sie auf **RFID-Karten verwalten**. Für den Zugriff auf die Benutzerdetails benötigen Sie zusätzlich `users.read`.

## Siehe auch

- [Benutzerverwaltung](user-management/overview.md)
- [SSO Überblick](user-management/sso-overview.md)
- [Einweisungen](resources/introductions.md) – Ressourcenbezogene Berechtigungen
