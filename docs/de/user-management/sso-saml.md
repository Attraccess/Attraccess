# SAML einrichten

SAML (Security Assertion Markup Language) wird häufig in Unternehmens- und Bildungsumgebungen eingesetzt.

## Voraussetzungen

- [HTTPS konfiguriert](installation/ssl-setup.md)
- Ein SAML-fähiger Identity Provider
- Berechtigung **Systemkonfiguration verwalten**

SAML-Status-Cookies verwenden immer `Secure`, `HttpOnly` und `SameSite=Lax`. Die
Attraccess-Website muss HTTPS verwenden, auch bei lokalen Installationen. Wenn TLS
an einem Reverse Proxy endet, konfigurieren Sie `TRUST_PROXY` für diesen Proxy,
damit Attraccess sichere Anfragen erkennt. Über HTTP wird kein SAML-Status-Cookie gesetzt.

## Anbieter anlegen

1. Öffnen Sie **Einstellungen** in der Seitenleiste und wählen Sie den Bereich **Single Sign-on**
2. Klicken Sie auf **Neuen Anbieter hinzufügen**
3. Wählen Sie **SAML** als Typ
4. Geben Sie einen Namen für den Anbieter ein

## Konfiguration

| Feld | Beschreibung |
|------|-------------|
| **Entry Point** | SSO-URL des Identity Providers |
| **Issuer** | Service Provider Identifier (Ihre Attraccess-URL) |
| **Zertifikat** | Signaturzertifikat des Identity Providers (X.509, PEM-Format) |

### Signaturoptionen

| Option | Standard | Beschreibung |
|--------|----------|-------------|
| **Request signieren** | Aus | AuthnRequest an den IdP signieren |
| **Signierte Assertions erwarten** | Ein | IdP muss Assertions signieren |
| **Signierte Responses erwarten** | Ein | IdP muss die gesamte Response signieren |
| **Authentifizierung erzwingen** | Aus | Bei jedem Login erneut authentifizieren |

> [!NOTE]
> Wenn **Request signieren** aktiviert ist, müssen Sie zusätzlich ein SP-Signaturzertifikat und einen privaten Schlüssel angeben.

### E-Mail-Attribut

Geben Sie die SAML-Attributnamen an, die die E-Mail-Adresse enthalten. Mehrere Werte sind möglich (einer pro Zeile).

Häufige Attributnamen:
- `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
- `email`
- `mail`

### Provisioning-Secret

Optional können Sie ein Provisioning-Secret festlegen. Damit kann Ihr Identity Provider über die Provisioning-API Benutzer und Berechtigungen in Attraccess verwalten.

### Berechtigungszuordnung

Wie bei [OIDC](user-management/sso-oidc.md) können Sie SAML-Rollen den Attraccess-Berechtigungen zuordnen.

## Service Provider Metadaten

Konfigurieren Sie Ihren SAML-Identity-Provider mit diesen Werten:

| Feld | Wert |
|------|------|
| **ACS URL (Callback)** | `https://ihre-url.de/api/auth/sso/SAML/{provider-id}/callback` |
| **Entity ID / Issuer** | Ihre Attraccess-URL |
| **Binding** | HTTP-POST |

## Testen

1. Melden Sie sich ab
2. Klicken Sie auf der Anmeldeseite auf die SAML-Anbieter-Schaltfläche
3. Authentifizieren Sie sich beim Identity Provider
4. Sie werden automatisch zurück zu Attraccess geleitet

## Siehe auch

- [SSO Überblick](user-management/sso-overview.md)
- [OIDC einrichten](user-management/sso-oidc.md)
- [Berechtigungen](user-management/permissions.md)

## SAML Single Logout

Hinterlegen Sie die **Entity-ID des Identitätsanbieters** getrennt vom bisherigen **Service-Provider-Issuer**. Konfigurieren Sie die **Abmelde-URL** des Anbieters, dessen Signaturzertifikat sowie Signaturzertifikat und privaten Schlüssel von Attraccess. Der private Schlüssel wird verschlüsselt gespeichert. Jede Abmeldenachricht erfordert eine Signatur, auch wenn Signaturoptionen für die Anmeldung deaktiviert sind.

Registrieren Sie `API_ORIGIN/api/auth/sso/SAML/PROVIDER_ID/slo` als SP-SingleLogoutService-URL für **HTTP-Redirect** und **HTTP-POST**. Verwenden Sie die exakte API-URL aus dem Anbieterformular. Hinterlegen Sie das Attraccess-Signaturzertifikat als vertrauenswürdig beim Anbieter. Attraccess sendet signierte Redirect-Anfragen und -Antworten und akzeptiert signierte Redirect- und POST-Nachrichten. SOAP- und Artifact-Bindings werden nicht unterstützt.

**Überall abmelden** überträgt die ursprüngliche NameID mit Format und Qualifiern sowie alle erfassten SessionIndex-Werte. Ältere Sitzungen benötigen eine neue SSO-Anmeldung. Ohne Signaturmaterial oder nutzbare Sitzungszuordnung bleibt die zentrale Abmeldung deaktiviert; die lokale Abmeldung funktioniert weiterhin.

Eingehende Anfragen müssen zu IdP-Issuer und Zieladresse passen und aktuelle Zeitstempel enthalten. Sie beenden passende NameID-Identitäten einschließlich Qualifiern, begrenzt durch gegebenenfalls mitgelieferte SessionIndex-Werte. Ohne SessionIndex werden alle Sitzungen dieser Anbieteridentität beendet. Antworten müssen zu einer offenen, gültigen Anfrage passen und werden einmalig verbraucht. Wiederholte Anfragen, unsignierte Nachrichten, ungültige Signaturen und falsche Zieladressen werden abgelehnt. Teilweise oder fehlgeschlagene Anbieterabmeldungen werden angezeigt, ohne lokale Sitzungen wiederherzustellen oder eine Abmeldung von anderen Anwendungen zu behaupten.
