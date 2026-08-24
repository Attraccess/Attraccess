# OIDC einrichten

OpenID Connect (OIDC) ist das empfohlene SSO-Protokoll für die meisten Anwendungsfälle.

## Voraussetzungen

- [HTTPS konfiguriert](installation/ssl-setup.md)
- Ein OIDC-fähiger Identity Provider (z.B. Authentik, Keycloak, Azure AD)
- Berechtigung **Systemkonfiguration verwalten**

## Anbieter anlegen

1. Öffnen Sie **Einstellungen** in der Seitenleiste und wählen Sie den Bereich **Single Sign-on**
2. Klicken Sie auf **Neuen Anbieter hinzufügen**
3. Wählen Sie **OIDC** als Typ
4. Geben Sie einen Namen für den Anbieter ein

## Konfiguration

### Automatische Erkennung

Für Authentik, Keycloak oder andere OpenID-kompatible Anbieter können Sie die automatische Erkennung nutzen:

- **Authentik**: Geben Sie Host und Anwendungsname ein
- **Keycloak**: Geben Sie Host und Realm ein
- **OpenID Configuration**: Geben Sie die URL zur `.well-known/openid-configuration` ein

Alle URL-Felder werden automatisch ausgefüllt.

### Manuelle Konfiguration

| Feld | Beschreibung | Beispiel |
|------|-------------|---------|
| **Issuer** | Aussteller-URL des Anbieters | `https://auth.example.com/application/o/attraccess/` |
| **Authorization URL** | Autorisierungsendpunkt | `https://auth.example.com/application/o/authorize/` |
| **Token URL** | Token-Endpunkt | `https://auth.example.com/application/o/token/` |
| **UserInfo URL** | Benutzerinfo-Endpunkt | `https://auth.example.com/application/o/userinfo/` |
| **Client ID** | Client-Kennung | `attraccess` |
| **Client Secret** | Client-Geheimnis | (wird verschlüsselt gespeichert) |

### Scopes

Optional können Sie zusätzliche OIDC-Scopes angeben (kommagetrennt). Standard-Scopes werden automatisch angefordert.

### Claim-Pfade

Attraccess muss wissen, welche Felder im OIDC-Token den Benutzernamen und die E-Mail-Adresse enthalten.

| Feld | Standard | Beschreibung |
|------|----------|-------------|
| **Benutzername-Claim-Pfade** | `preferred_username, email, sub` | Geordnete Liste von Token-Feldern für den Benutzernamen |
| **E-Mail-Claim-Pfade** | `email, emails[0].value, upn` | Geordnete Liste von Token-Feldern für die E-Mail |

Attraccess prüft die Pfade in der angegebenen Reihenfolge und verwendet den ersten Treffer.

### Berechtigungszuordnung

Ordnen Sie OIDC-Rollen den Attraccess-Berechtigungen zu. Für jede Berechtigung geben Sie eine kommagetrennte Liste von Rollennamen ein.

| Berechtigung | Beispiel-Rollen |
|-------------|----------------|
| **Ressourcen verwalten** | `attraccess_resources, admin` |
| **Systemkonfiguration verwalten** | `attraccess_admin` |
| **Benutzer verwalten** | `attraccess_admin, user_manager` |
| **Abrechnung verwalten** | `attraccess_billing` |

> [!NOTE]
> Die Rollennamen werden beim Vergleich normalisiert (Kleinbuchstaben, nur alphanumerisch). `CanManageUsers` und `canmanageusers` sind identisch.

### Keycloak-Gruppenzuordnungen

Wenn Sie Keycloak-Gruppen für Rollenzuordnungen verwenden, konfigurieren Sie einen Group-Membership-Mapper, der den `groups`-Claim im Token oder in der UserInfo-Response ausgibt. Keycloak lässt diesen Claim bei Benutzern ohne Gruppenzugehörigkeit weg. Weisen Sie daher jedem SSO-Benutzer eine Basisgruppe wie `attraccess_users` zu, damit der Claim immer vorhanden ist und gruppenbasierte Rollenzuordnungen zuverlässig synchronisiert werden.

## Callback-URL

Tragen Sie folgende Callback-URL in Ihrem OIDC-Anbieter ein:

```
https://ihre-attraccess-url.de/api/auth/sso/OIDC/{provider-id}/callback
```

Die Provider-ID wird nach dem Erstellen des Anbieters angezeigt.

> [!IMPORTANT]
> Die Callback-URL muss exakt übereinstimmen — hängen Sie keine Query-Parameter an. Attraccess verwendet den OIDC-`state`-Parameter, um zu speichern, wohin Benutzer nach der Anmeldung weitergeleitet werden sollen. Stellen Sie sicher, dass Ihr Identity Provider den `state`-Parameter unverändert beim Callback zurückgibt.

## Testen

1. Melden Sie sich ab
2. Auf der Anmeldeseite sollte eine Schaltfläche für Ihren SSO-Anbieter erscheinen
3. Klicken Sie darauf und melden Sie sich bei Ihrem Identity Provider an
4. Sie werden automatisch zurück zu Attraccess geleitet

## Siehe auch

- [SSO Überblick](user-management/sso-overview.md)
- [SAML einrichten](user-management/sso-saml.md)
- [Berechtigungen](user-management/permissions.md)
