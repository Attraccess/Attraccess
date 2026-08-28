# Single Sign-On (SSO)

Attraccess unterstützt Single Sign-On (SSO) über zwei Protokolle: **OpenID Connect (OIDC)** und **SAML**. Damit können sich Ihre Benutzer mit ihrem bestehenden Organisationskonto anmelden.

## Voraussetzungen

- [HTTPS muss konfiguriert sein](installation/ssl-setup.md) (SSO-Anbieter erfordern sichere Verbindungen)
- SSO-Modul muss in Ihrer Lizenz enthalten sein
- Berechtigung **Systemkonfiguration verwalten**

## Unterstützte Protokolle

| Protokoll | Anwendungsfall | Beispiel-Anbieter |
|-----------|---------------|-------------------|
| **OIDC** | Moderne Webanwendungen | Authentik, Keycloak, Azure AD, Google Workspace |
| **SAML** | Unternehmen und Bildungseinrichtungen | Authentik, Keycloak, Azure AD, Shibboleth |

## Anbieter konfigurieren

1. Öffnen Sie **Einstellungen** in der Seitenleiste und wählen Sie den Bereich **Single Sign-on**
2. Klicken Sie auf **Neuen Anbieter hinzufügen**
3. Wählen Sie den Typ (OIDC oder SAML)
4. Füllen Sie die Konfiguration aus

Detaillierte Anleitungen:
- [OIDC einrichten](user-management/sso-oidc.md)
- [SAML einrichten](user-management/sso-saml.md)

## Automatische Erkennung

Attraccess bietet automatische Erkennung für verbreitete OIDC-Anbieter:

- **Authentik** – Geben Sie Host und Anwendungsname ein
- **Keycloak** – Geben Sie Host und Realm ein
- **OpenID Configuration** – URL zur `.well-known/openid-configuration` eingeben

Die Erkennung füllt alle URL-Felder (Issuer, Authorization, Token, UserInfo) automatisch aus.

## Berechtigungszuordnung

SSO-Anbieter können Benutzerberechtigungen automatisch steuern. Wenn Ihr Anbieter Rollen oder Gruppen übergibt, können Sie diese den vier Attraccess-[Systemberechtigungen](user-management/permissions.md) zuordnen.

Beispiel: Die OIDC-Rolle `attraccess_admin` wird der Berechtigung **Benutzer verwalten** zugeordnet.

## Kontoverknüpfung

Wenn ein Benutzer bereits ein lokales Konto hat und sich erstmals über SSO anmeldet, kann das bestehende Konto mit dem SSO-Anbieter verknüpft werden. Dazu wird die E-Mail-Adresse und das lokale Passwort zur Bestätigung abgefragt.

## Mehrere Anbieter

Sie können mehrere SSO-Anbieter gleichzeitig konfigurieren. Benutzer sehen auf der Anmeldeseite Schaltflächen für jeden konfigurierten Anbieter.

## Siehe auch

- [OIDC einrichten](user-management/sso-oidc.md)
- [SAML einrichten](user-management/sso-saml.md)
- [Berechtigungen](user-management/permissions.md)
- [SSL einrichten](installation/ssl-setup.md)
