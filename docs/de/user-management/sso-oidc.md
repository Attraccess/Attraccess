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

### E-Mail-Verifizierung

Sendet der Identity Provider `email_verified=false` (Boolean oder String), wird die E-Mail-Adresse nicht verwendet, um ein bestehendes Konto zuzuordnen oder zu verknüpfen. Es wird ein neues Konto mit nicht verifizierter E-Mail-Adresse erstellt. Gehört die E-Mail-Adresse bereits zu einem anderen Konto, wird die Anmeldung mit `SSO_EMAIL_NOT_VERIFIED` abgelehnt. Fehlt der Claim, wird die E-Mail wie bisher als vertrauenswürdig behandelt.

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

Wenn Sie Keycloak-Gruppen für Rollenzuordnungen verwenden, konfigurieren Sie einen Group-Membership-Mapper, der den `groups`-Claim im ID-Token oder in der UserInfo-Response ausgibt. Attraccess liest Rollen-Claims nicht aus dem Access-Token; den Mapper nur dafür zu aktivieren, reicht daher nicht aus.

Keycloak lässt den `groups`-Claim bei Benutzern ohne Gruppenzugehörigkeit weg. Attraccess behält bestehende per SSO gewährte Rollen bei, wenn kein Rollen- oder Gruppen-Claim vorhanden ist. Das Entfernen der letzten zugeordneten Gruppe eines Benutzers entzieht diese Rolle daher nicht bei der nächsten Anmeldung. Weisen Sie jedem SSO-Benutzer eine Basisgruppe wie `attraccess_users` zu, damit der Claim vorhanden bleibt und das Entfernen einer zugeordneten Gruppe synchronisiert werden kann.

### Berechtigungsabgleich während der Sitzung

Standardmäßig werden SSO-Rollen nur bei der Anmeldung (oder über die Provisioning-API) aktualisiert. Der Abgleich ist für jeden Anbieter aus, bis Sie ihn einschalten. Damit langlebige Sitzungen mit dem Identitätsanbieter übereinstimmen:

1. Bearbeiten Sie den OIDC-Anbieter und öffnen Sie den Abschnitt **Berechtigungsabgleich während der Sitzung**.
2. Lesen Sie die dort angezeigten Anforderungen an den Identitätsanbieter (auch unten aufgeführt) und prüfen Sie Ihren Anbieter darauf.
3. Schalten Sie **Berechtigungen während der Sitzung abgleichen** ein und setzen Sie das **Abgleichsintervall (Minuten)**: wie viele Minuten zwischen zwei Rollenprüfungen eines angemeldeten Benutzers liegen. Es beginnt bei `60`; der Höchstwert ist `525600` (365 Tage).
4. Speichern Sie den Anbieter. Die Änderung wirkt nach etwa 30 Sekunden, ohne Neustart.

Ist seit der letzten Rollenprüfung einer Sitzung das Abgleichsintervall abgelaufen, holt ihre nächste Anfrage mit dem Refresh-Token der Sitzung aktuelle Claims vom Token- und UserInfo-Endpunkt. Die Rollen werden dann genau wie bei der Anmeldung zugeordnet. Schalten Sie den Schalter aus, endet der Abgleich für diesen Anbieter.

Auch das Erneuern der Sitzung (`POST /api/auth/session/refresh`) löst einen Abgleich aus, höchstens einmal pro Minute, selbst wenn das Abgleichsintervall noch nicht abgelaufen ist.

Der Abgleich folgt denselben Regeln wie die Anmeldung. Rollen ändern sich nur, wenn sich die Rollen-/Gruppen-Claims geändert haben, und ein vollständig fehlender Claim entfernt nie Rollen. Jeder Versuch wird protokolliert und in der Metrik `attraccess_auth_sso_permission_resync_total` gezählt. Rollenänderungen werden im Audit-Log als **SSO-Berechtigungen synchronisiert** erfasst.

Lehnt der Anbieter das Refresh-Token ab (`invalid_grant`, z. B. weil der Benutzer deaktiviert wurde oder seine Anbieter-Sitzung beendet ist) oder meldet er ein anderes Subject, wird die Attraccess-Sitzung beendet und als **SSO-Sitzungen widerrufen** erfasst. Bei Netzwerkfehlern oder Ausfällen des Anbieters bleiben die Sitzung und ihre aktuellen Rollen erhalten, und der nächste Versuch (periodisch oder beim Erneuern der Sitzung) wartet eine Minute.

> [!WARNING]
> Der Abgleich benötigt ein Refresh-Token. Eine Sitzung erhält es nur, wenn der Anbieter es bei der Anmeldung ausgestellt hat, das ID-Token verifiziert werden konnte (JWKS konfiguriert oder per Discovery auffindbar) und sich der Benutzer nach dem Update auf eine Version mit dieser Funktion angemeldet hat. Refresh-Tokens werden bei jeder solchen Anmeldung verschlüsselt gespeichert, auch solange der Abgleich aus ist. Ein späteres Aktivieren erfordert daher keine neue Anmeldung. Ist der Abgleich aktiv, hat der Anbieter bei der Anmeldung aber kein Refresh-Token ausgestellt, protokolliert Attraccess eine Warnung und zählt die Anmeldung in `attraccess_auth_sso_refresh_token_missing_total`. Bei Keycloak laufen Refresh-Tokens mit den SSO-Session-Idle-/Max-Timeouts ab. Setzen Sie diese mindestens so lang wie das Abgleichsintervall oder fordern Sie den Scope `offline_access` an, damit aktive Benutzer nicht abgemeldet werden. SAML-Anbieter werden während der Sitzung nicht abgeglichen. Verwenden Sie stattdessen die Provisioning-API.

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

## Zentrale OIDC-Abmeldung

Hinterlegen Sie optional eine **End-Session-URL** und **JWKS-URL**, oder lassen Sie sie leer, um die Discovery des konfigurierten Issuers zu verwenden. Die entdeckte Issuer-Identität muss exakt übereinstimmen. Erlaubte asymmetrische Signaturalgorithmen sind konfigurierbar; der Standard ist `RS256`. In Produktion ist HTTPS erforderlich. Bei lokaler Entwicklung sind HTTP-Loopback-URLs erlaubt. Metadatenabrufe begrenzen Zeit, Größe, Weiterleitungen und Cache-Dauer. Schlüssel-URLs aus eingehenden Tokens werden niemals vertraut.

Registrieren Sie folgende URLs beim Anbieter. Ersetzen Sie `API_ORIGIN` und `PROVIDER_ID` durch die öffentliche API-Adresse und Anbieter-ID. Das Formular zeigt die exakten URLs aus den Anwendungseinstellungen:

| Anbietereinstellung | URL |
| --- | --- |
| Weiterleitungs-URI nach Abmeldung | `API_ORIGIN/api/auth/sso/OIDC/PROVIDER_ID/post-logout` |
| Back-Channel-Abmelde-URI | `API_ORIGIN/api/auth/sso/OIDC/PROVIDER_ID/backchannel-logout` |
| Front-Channel-Abmelde-URI | `API_ORIGIN/api/auth/sso/OIDC/PROVIDER_ID/frontchannel-logout` |

**Überall abmelden** verwendet, soweit vorhanden, einen verifizierten ID-Token-Hinweis und einen einmaligen serverseitigen Statuswert. Registrieren Sie die Rücksprung-URI exakt. Abmelde-Tokens werden per formularcodiertem POST gesendet. Sie müssen signiert sein und passenden Issuer und Empfänger, `iat`, `exp`, `jti`, das Back-Channel-Abmeldeereignis sowie `sub` oder `sid` enthalten. Eine Nonce ist unzulässig. Nachrichten dürfen höchstens fünf Minuten alt sein (`iat`) und noch nicht abgelaufen sein (`exp`), wobei eine Uhrabweichung von 30 Sekunden toleriert wird. Der Zeitraum zwischen Ausstellung und Ablauf darf länger als fünf Minuten sein; ein frisch ausgestelltes Token mit einer Stunde Gültigkeit wird akzeptiert. Enthält eine Nachricht sowohl Benutzer- als auch Sitzungs-ID, müssen beide passen. Gültige Wiederholungen sind erfolgreich, ohne neuere Sitzungen zu beenden.

Front-Channel-Nachrichten akzeptieren `iss` und `sid` gemeinsam. Ohne diese Parameter kann nur die passende aktuelle Browsersitzung beendet werden; ohne Cookie geschieht nichts. Attraccess-Cookies verwenden SameSite=Strict. Browserbeschränkungen für Drittanbieter-Cookies können reine Cookie-Nachrichten verhindern. Nachrichten mit Sitzungsparametern erfordern keine Cookies. Aktivieren Sie **Back-Channel-Abmeldung** für zuverlässige Anbieternachrichten. Nur der minimale Benachrichtigungsendpunkt erlaubt die Einbettung als Iframe; Anwendungsseiten behalten ihren bestehenden Frame-Schutz.

Ältere Sitzungen ohne verifizierte SSO-Zuordnung bleiben für lokale Anmeldung und Abmeldung gültig. Sind Verifizierung oder Discovery einer älteren Konfiguration nicht verfügbar, wird keine unverifizierte ID-Token-Zuordnung gespeichert. Hinterlegen Sie vertrauenswürdige JWKS-Metadaten und melden Sie sich erneut an, um die zentrale Abmeldung zu aktivieren.
